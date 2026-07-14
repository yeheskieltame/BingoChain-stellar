#!/usr/bin/env node
// Records a REAL three player staked game of BingoChain Stellar on the live
// testnet contract. The hero plays through the untouched frontend UI in a
// headless chromium: a page init script impersonates the Freighter extension
// (the exact window message protocol @stellar/freighter-api speaks), answering
// connection and network queries with testnet details and the hero public key,
// and forwarding every signTransaction to node where the hero Keypair signs.
// Two rival accounts play headlessly through the bingo-client bindings, biased
// to lose. The runner replays until the hero wins outright, keeps the winning
// take, converts it to mp4, and writes a cuesheet for Remotion.
//
// Nothing in frontend/ is modified: the wallet is shimmed entirely from the
// page side, exactly as the real extension would drive it.

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(VIDEO_DIR, "..");
const FRONTEND_DIR = path.join(REPO_ROOT, "frontend");
const BINGO_CLIENT = pathToFileURL(
  path.join(FRONTEND_DIR, "packages", "bingo-client", "dist", "index.js")
).href;
const GAMEPLAY_DIR = path.join(VIDEO_DIR, "assets", "gameplay");
const TMP_DIR = path.join(GAMEPLAY_DIR, "tmp");
const TAKE_PATH = path.join(GAMEPLAY_DIR, "take.mp4");
const CUES_PATH = path.join(GAMEPLAY_DIR, "cues.json");

const PORT = 4199;
const BASE_URL = `http://localhost:${PORT}`;
const MAX_ATTEMPTS = 6;

// The generated bindings carry the contract id and passphrase; every account
// signs against them so a redeploy plus regenerate needs no edit here.
const bingo = await import(BINGO_CLIENT);
const { Client, Keypair, TransactionBuilder, contract, networks } = bingo;
const CONTRACT_ID = networks.testnet.contractId;
const NETWORK_PASSPHRASE = networks.testnet.networkPassphrase;
const RPC_URL = "https://soroban-testnet.stellar.org";
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";

const STAKE = 10_000_000n; // 1 XLM per seat, the contract minimum.
const SEATS = 3;
const FEE_BPS = 200n; // matches deployment.json; pool = total minus this fee.

// Camera beats. Not stand-ins for real waits: every turn and phase change is
// gated on real on-chain and DOM state below. These only slow the cut enough
// to read on screen.
const BEAT_MS = 900;
const SHORT_BEAT_MS = 500;
const FINAL_LINGER_MS = 12000;
const POLL_MS = 1200;
const CHAIN_CONFIRM_TIMEOUT_MS = 90000;
const DOM_WAIT_MS = 30000;

// The 12 winning lines as bitmasks over the 25 cell positions, copied verbatim
// from contracts/bingo/src/board.rs and frontend/src/lib/board.ts.
const LINE_MASKS = [
  0x000001f, 0x00003e0, 0x0007c00, 0x00f8000, 0x1f00000, 0x0108421, 0x0210842, 0x0421084,
  0x0842108, 0x1084210, 0x1041041, 0x0111110,
];

function popcount(v) {
  let count = 0;
  while (v !== 0) {
    v &= v - 1;
    count++;
  }
  return count;
}

function countCompletedLines(marked) {
  let lines = 0;
  for (const lm of LINE_MASKS) if ((marked & lm) === lm) lines++;
  return lines;
}

/** Marked-cell bitmask for a board given the called-number mask (bit n-1 set
 * for number n), mirroring board.ts marks(). */
function marksFor(board, calledMask) {
  let marked = 0;
  board.forEach((n, pos) => {
    if (n >= 1 && n <= 25 && calledMask & (1 << (n - 1))) marked |= 1 << pos;
  });
  return marked;
}

/** Earliest 1-based call index at which a board reaches five lines replaying
 * calls, or null. Mirrors the contract's bingo_index used at settle. */
function bingoIndex(board, calls) {
  const posOf = new Array(26).fill(-1);
  board.forEach((n, pos) => {
    if (n >= 1 && n <= 25) posOf[n] = pos;
  });
  let marked = 0;
  for (let i = 0; i < calls.length; i++) {
    const cell = posOf[calls[i]];
    if (cell < 0) continue;
    marked |= 1 << cell;
    if (countCompletedLines(marked) >= 5) return i + 1;
  }
  return null;
}

/** Greedy pick from a DOM board snapshot: for every unmarked cell, score its
 * best line's marked count, take the max. Identical to the practice recorder's
 * bestPick, so the hero plays his own board to a fast win. */
function bestPickFromMarked(markedBits) {
  let best = null;
  let bestScore = -1;
  for (let pos = 0; pos < 25; pos++) {
    if ((markedBits & (1 << pos)) !== 0) continue;
    let score = -1;
    for (const lm of LINE_MASKS) {
      if ((lm & (1 << pos)) === 0) continue;
      const done = popcount(lm & markedBits);
      if (done > score) score = done;
    }
    if (score > bestScore) {
      bestScore = score;
      best = pos;
    }
  }
  return best;
}

/** Deliberately suboptimal rival pick: the uncalled number whose cell advances
 * the rival's own strongest line the least, so a rival almost never reaches
 * five lines before the greedy hero. Ties broken at random. */
function worstPick(board, calledMask) {
  const posOf = new Array(26).fill(-1);
  board.forEach((n, pos) => (posOf[n] = pos));
  const marked = marksFor(board, calledMask);
  let ties = [];
  let bestScore = Infinity;
  for (let n = 1; n <= 25; n++) {
    if (calledMask & (1 << (n - 1))) continue;
    const cell = posOf[n];
    let score = -1;
    for (const lm of LINE_MASKS) {
      if ((lm & (1 << cell)) === 0) continue;
      const done = popcount(lm & marked);
      if (done > score) score = done;
    }
    if (score < bestScore) {
      bestScore = score;
      ties = [n];
    } else if (score === bestScore) {
      ties.push(n);
    }
  }
  return ties[Math.floor(Math.random() * ties.length)];
}

// ---------------------------------------------------------------------------
// Stellar helpers
// ---------------------------------------------------------------------------

async function friendbotFund(publicKey) {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  // 400 means already funded, which is fine for a retry.
  if (!res.ok && res.status !== 400) {
    throw new Error(`friendbot funding failed for ${publicKey}: ${res.status}`);
  }
}

async function sha256(bytes) {
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

function randomBoard() {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

function randomSalt() {
  const salt = new Uint8Array(32);
  webcrypto.getRandomValues(salt);
  return salt;
}

/** sha256 over the 25 board bytes then the 32 salt bytes, matching the
 * contract's reveal check and the frontend's boardCommitment. */
async function boardCommitment(board, salt) {
  const preimage = new Uint8Array(57);
  preimage.set(board, 0);
  preimage.set(salt, 25);
  return sha256(preimage);
}

/** A rival driven headlessly through the real bindings. Signs with a node
 * Keypair via basicNodeSigner, the same envelope-plus-auth signing the
 * extension does for the hero. */
function makeRival() {
  const keypair = Keypair.random();
  const signer = contract.basicNodeSigner(keypair, NETWORK_PASSPHRASE);
  const client = new Client({
    contractId: CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: keypair.publicKey(),
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  });
  return { keypair, client, publicKey: keypair.publicKey(), board: randomBoard(), salt: randomSalt() };
}

const readClient = new Client({
  contractId: CONTRACT_ID,
  networkPassphrase: NETWORK_PASSPHRASE,
  rpcUrl: RPC_URL,
});

async function readArena(id) {
  const tx = await readClient.get_arena({ arena_id: id });
  return tx.result.unwrap();
}

async function earningsOf(publicKey) {
  const tx = await readClient.earnings_of({ player: publicKey });
  return tx.result;
}

async function revealedBoardOf(id, publicKey) {
  const tx = await readClient.revealed_board_of({ arena_id: id, player: publicKey });
  return tx.result;
}

/** Submit a bindings write with one retry on a transient network hiccup. */
async function sendWrite(assembled) {
  try {
    return await assembled.signAndSend();
  } catch (err) {
    console.log(`  bindings write hiccup, retrying once: ${err instanceof Error ? err.message : err}`);
    await sleep(2000);
    return assembled.signAndSend();
  }
}

// ---------------------------------------------------------------------------
// Frontend build and preview (same shape as the practice recorder)
// ---------------------------------------------------------------------------

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error(`Frontend preview never came up at ${url}`);
}

function runBuild() {
  console.log("Building frontend...");
  const result = spawnSync("pnpm", ["build"], { cwd: FRONTEND_DIR, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`pnpm build failed with exit code ${result.status}`);
}

function startPreview() {
  console.log(`Starting preview server on port ${PORT}...`);
  const proc = spawn("pnpm", ["preview", "--port", String(PORT), "--strictPort"], {
    cwd: FRONTEND_DIR,
    stdio: "pipe",
    detached: true,
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});
  return proc;
}

function stopPreview(proc) {
  if (!proc || proc.killed) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill("SIGTERM");
  }
}

async function ensureChromiumInstalled() {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return;
  } catch (err) {
    console.log("Chromium not found, installing...", err instanceof Error ? err.message : err);
  }
  const result = spawnSync("pnpm", ["exec", "playwright", "install", "chromium"], {
    cwd: VIDEO_DIR,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("playwright install chromium failed");
}

// ---------------------------------------------------------------------------
// The Freighter shim, injected into the page before any app script runs.
// ---------------------------------------------------------------------------

/**
 * Runs in the page. Impersonates the extension side of @stellar/freighter-api
 * v4: the api posts { source: "FREIGHTER_EXTERNAL_MSG_REQUEST", messageId, type,
 * ...opts } and resolves on a message whose data.source is
 * "FREIGHTER_EXTERNAL_MSG_RESPONSE" and data.messagedId equals the request's
 * messageId (the response key really is "messagedId"). window.freighter set
 * truthy short-circuits isConnected. signTransaction is forwarded to node
 * through the exposed __freighterSign binding for the hero Keypair to sign.
 */
function freighterShim(cfg) {
  window.freighter = true;
  const REQ = "FREIGHTER_EXTERNAL_MSG_REQUEST";
  const RESP = "FREIGHTER_EXTERNAL_MSG_RESPONSE";
  window.addEventListener(
    "message",
    async (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== REQ) return;
      const reply = (fields) =>
        window.postMessage({ source: RESP, messagedId: data.messageId, ...fields }, window.location.origin);
      switch (data.type) {
        case "REQUEST_ACCESS":
        case "REQUEST_PUBLIC_KEY":
        case "REQUEST_USER_INFO":
          reply({ publicKey: cfg.publicKey, userInfo: { publicKey: cfg.publicKey } });
          break;
        case "REQUEST_CONNECTION_STATUS":
          reply({ isConnected: true });
          break;
        case "REQUEST_ALLOWED_STATUS":
        case "SET_ALLOWED_STATUS":
          reply({ isAllowed: true });
          break;
        case "REQUEST_NETWORK":
        case "REQUEST_NETWORK_DETAILS":
          reply({
            network: cfg.networkDetails.network,
            networkPassphrase: cfg.networkDetails.networkPassphrase,
            networkDetails: cfg.networkDetails,
          });
          break;
        case "SUBMIT_TRANSACTION":
          try {
            const signedTransaction = await window.__freighterSign(data.transactionXdr);
            reply({ signedTransaction, signerAddress: cfg.publicKey });
          } catch (err) {
            reply({ apiError: { code: -1, message: String((err && err.message) || err) } });
          }
          break;
        default:
          // Anything else this app never calls; leave it to time out harmlessly.
          break;
      }
    },
    false
  );
}

const NETWORK_DETAILS = {
  network: "TESTNET",
  networkName: "Test Net",
  networkUrl: HORIZON_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  sorobanRpcUrl: RPC_URL,
};

// ---------------------------------------------------------------------------
// DOM reading and cue logging
// ---------------------------------------------------------------------------

/** Reads the live game state off the DOM, the same signals the practice
 * recorder keys on plus the reveal and settle affordances. */
async function readSnapshot(page) {
  return page.evaluate(() => {
    const turnEl = document.querySelector(".turn-strip");
    const meterEl = document.querySelector(".bingo-meter");
    const claimNoteEl = document.querySelector(".claim-note");
    const cells = Array.from(document.querySelectorAll(".board-cell")).map((el) => ({
      number: Number(el.querySelector(".cell-num")?.textContent ?? "0"),
      marked: el.className.includes("cell--marked"),
      disabled: el.disabled,
    }));
    return {
      isYourTurn: turnEl ? turnEl.className.includes("turn-strip--you") : false,
      meterCount: (() => {
        const label = meterEl ? meterEl.getAttribute("aria-label") : null;
        if (!label) return 0;
        if (label.startsWith("Bingo")) return 5;
        const match = label.match(/^(\d+) of 5/);
        return match ? Number(match[1]) : 0;
      })(),
      strikeCount: document.querySelectorAll(".strike-line").length,
      claimNoteVisible: !!claimNoteEl,
      revealPanelVisible: !!document.querySelector(".countdown"),
      cells,
    };
  });
}

function makeCueLogger(startedAt, cues) {
  const logged = new Set();
  const log = (label) => {
    const measured = Date.now() - startedAt;
    const floor = cues.length > 0 ? cues[cues.length - 1].tMs + 1 : 0;
    const tMs = Math.max(measured, floor);
    cues.push({ label, tMs });
    console.log(`  cue ${label} at ${tMs}ms`);
  };
  const once = (label) => {
    if (logged.has(label)) return;
    logged.add(label);
    log(label);
  };
  return { log, once };
}

/** Reads the DOM and logs any newly-crossed meter and strike beats. Called
 * throughout play so the letter meter cues land when they fill on screen. */
async function pollMeterCues(page, cue) {
  const snap = await readSnapshot(page);
  if (snap.strikeCount >= 1 || snap.meterCount >= 1) cue.once("first-strike");
  if (snap.meterCount >= 2) cue.once("meter-2");
  if (snap.meterCount >= 3) cue.once("meter-3");
  if (snap.meterCount >= 4) cue.once("meter-4");
  if (snap.meterCount >= 5) cue.once("bingo");
  if (snap.claimNoteVisible) cue.once("auto-claim");
  return snap;
}

// ---------------------------------------------------------------------------
// Small waits and clickers
// ---------------------------------------------------------------------------

async function findButtonByName(scope, namePattern) {
  const buttons = await scope.getByRole("button").all();
  for (const button of buttons) {
    const name = (await button.textContent())?.trim() ?? "";
    if (namePattern.test(name)) return button;
  }
  return null;
}

async function pollUntil(fn, timeoutMs, intervalMs = POLL_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(intervalMs);
  }
  return last;
}

async function waitCallCount(id, atLeast) {
  const arena = await pollUntil(async () => {
    const a = await readArena(id);
    return Number(a.call_count) >= atLeast ? a : null;
  }, CHAIN_CONFIRM_TIMEOUT_MS);
  if (!arena) throw new Error(`call_count never reached ${atLeast}`);
  return arena;
}

async function waitState(id, tags) {
  const wanted = Array.isArray(tags) ? tags : [tags];
  const arena = await pollUntil(async () => {
    const a = await readArena(id);
    return wanted.includes(a.state.tag) ? a : null;
  }, CHAIN_CONFIRM_TIMEOUT_MS);
  if (!arena) throw new Error(`arena never reached ${wanted.join("/")}`);
  return arena;
}

// ---------------------------------------------------------------------------
// One recording attempt
// ---------------------------------------------------------------------------

// Module scope so main() can convert the winning attempt's video, which is
// only resolvable after its context closes in the finally below.
let lastWinningVideo = null;

async function attempt(attemptNumber) {
  const attemptDir = path.join(TMP_DIR, `attempt-${attemptNumber}`);
  await mkdir(attemptDir, { recursive: true });

  const heroKeypair = Keypair.random();
  const heroPk = heroKeypair.publicKey();
  const rivals = [makeRival(), makeRival()];

  const cues = [];
  let browser = null;
  let context = null;
  let page = null;
  let win = false;
  let arenaId = null;

  try {
    console.log(`  funding hero and two rivals...`);
    await Promise.all([heroPk, rivals[0].publicKey, rivals[1].publicKey].map(friendbotFund));
    // Friendbot writes settle in a ledger or two; a short beat avoids a cold read.
    await sleep(3000);

    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      recordVideo: { dir: attemptDir, size: { width: 1920, height: 1080 } },
    });

    // The extension side: sign forwarded envelopes with the hero Keypair.
    await context.exposeFunction("__freighterSign", (xdr) => {
      const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
      tx.sign(heroKeypair);
      return tx.toXDR();
    });
    await context.addInitScript(freighterShim, { publicKey: heroPk, networkDetails: NETWORK_DETAILS });

    page = await context.newPage();
    const startedAt = Date.now();
    const cue = makeCueLogger(startedAt, cues);

    // 1. Lobby, connect the hero wallet through the shim.
    await page.goto(`${BASE_URL}/#/`);
    await page.getByRole("heading", { name: /open tables/i }).waitFor({ state: "visible" });
    cue.once("lobby-open");
    await sleep(BEAT_MS);

    await page.getByRole("button", { name: /connect wallet/i }).click();
    await page.locator(".chip--wallet").waitFor({ state: "visible", timeout: DOM_WAIT_MS });
    await sleep(BEAT_MS);

    // 2. Create the table: stake 1 XLM, three seats.
    cue.once("create-form");
    const stakeInput = page.locator("#create-stake");
    await stakeInput.fill("1");
    await sleep(SHORT_BEAT_MS);
    // Seats are [2,3,4,5,6]; index 1 is the three-seat option.
    await page.locator(".seat-opt").nth(1).click();
    await sleep(SHORT_BEAT_MS);
    await (await findButtonByName(page.locator(".create-card"), /open the table/i)).click();

    // create_arena confirms, the app routes to the room via a hash change.
    const routed = await pollUntil(() => /#\/arena\/\d+/.test(page.url()), DOM_WAIT_MS, 400);
    if (!routed) throw new Error("create_arena never routed to the room");
    arenaId = Number(page.url().match(/#\/arena\/(\d+)/)[1]);
    await waitState(arenaId, ["Created"]);
    cue.once("arena-created");
    console.log(`  arena ${arenaId} created`);
    await sleep(BEAT_MS);

    // 3. Board setup: shuffle, commit, the shim signs.
    await page.locator(".board-setup").waitFor({ state: "visible", timeout: DOM_WAIT_MS });
    cue.once("board-setup");
    const setupActions = page.locator(".board-setup-actions");
    const shuffleButton = await findButtonByName(setupActions, /shuffle/i);
    const commitButton = await findButtonByName(setupActions, /commit|seal|retry/i);
    await shuffleButton.click();
    await sleep(BEAT_MS);
    await shuffleButton.click();
    await sleep(BEAT_MS);
    await commitButton.click();

    // Hero commit lands: the hero is seat 0, first to call.
    await pollUntil(async () => {
      const a = await readArena(arenaId);
      return a.players.includes(heroPk) ? a : null;
    }, CHAIN_CONFIRM_TIMEOUT_MS);
    cue.once("committed");
    console.log("  hero board committed");

    // Read the hero's committed board and salt back (the same reveal record the
    // app saved) for the winner math and, if the reveal button is unreachable,
    // a headless hero reveal signed with the hero key.
    const heroRecord = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, `bingo:reveal:${CONTRACT_ID}:${arenaId}:${heroPk}`);
    if (!heroRecord || !heroRecord.board || heroRecord.board.length !== 25) {
      throw new Error("could not read the hero board");
    }
    const heroBoard = heroRecord.board;
    const heroSalt = Buffer.from(heroRecord.salt, "base64");
    // A hero bindings client, used only if the browser reveal button never
    // becomes reachable (see the reveal step). Signs with the hero key, so the
    // hero still reveals its own board.
    const heroSigner = contract.basicNodeSigner(heroKeypair, NETWORK_PASSPHRASE);
    const heroClient = new Client({
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: heroPk,
      signTransaction: heroSigner.signTransaction,
      signAuthEntry: heroSigner.signAuthEntry,
    });

    // 4. Rivals join headlessly. Their joins arrive on the hero screen live.
    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      const commitment = await boardCommitment(r.board, r.salt);
      await sendWrite(
        await r.client.commit_board({
          arena_id: arenaId,
          player: r.publicKey,
          commitment: Buffer.from(commitment),
        })
      );
      await pollUntil(async () => {
        const a = await readArena(arenaId);
        return a.players.length >= i + 2 ? a : null;
      }, CHAIN_CONFIRM_TIMEOUT_MS);
      cue.once(`rival-${i + 1}-joined`);
      console.log(`  rival ${i + 1} joined`);
      await pollMeterCues(page, cue);
      await sleep(SHORT_BEAT_MS);
    }

    // Third seat sealed the table.
    await waitState(arenaId, ["Committed", "Playing"]);
    cue.once("ready");
    await page.locator(".turn-strip").waitFor({ state: "visible", timeout: DOM_WAIT_MS });
    await sleep(BEAT_MS);

    // 5. Turn based calls. Hero greedy through the UI, rivals suboptimal headless.
    let firstCall = false;
    let heroFiveLines = false;
    for (let turn = 0; turn < 40 && !heroFiveLines; turn++) {
      const arena = await readArena(arenaId);
      if (arena.state.tag !== "Committed" && arena.state.tag !== "Playing") break;

      const calledMask = Number(arena.called_mask);
      if (countCompletedLines(marksFor(heroBoard, calledMask)) >= 5) {
        heroFiveLines = true;
        break;
      }

      const seatPk = arena.players[Number(arena.turn_index)];
      const before = Number(arena.call_count);

      if (seatPk === heroPk) {
        // Hero turn: read his board off the DOM, greedy pick, click the cell.
        await page.locator(".turn-strip--you").waitFor({ state: "visible", timeout: DOM_WAIT_MS });
        const snap = await pollMeterCues(page, cue);
        let marked = 0;
        snap.cells.forEach((cell, idx) => {
          if (cell.marked) marked |= 1 << idx;
        });
        const pick = bestPickFromMarked(marked);
        if (pick === null || snap.cells[pick]?.disabled) {
          await sleep(POLL_MS);
          continue;
        }
        await sleep(SHORT_BEAT_MS);
        await page.locator(".board-cell").nth(pick).click();
        if (!firstCall) {
          cue.once("first-call");
          firstCall = true;
        }
        await waitCallCount(arenaId, before + 1);
        await sleep(SHORT_BEAT_MS);
      } else {
        // Rival turn: suboptimal call through the bindings.
        const r = rivals.find((x) => x.publicKey === seatPk);
        const number = worstPick(r.board, calledMask);
        await sendWrite(
          await r.client.call_number({ arena_id: arenaId, player: r.publicKey, number })
        );
        await waitCallCount(arenaId, before + 1);
      }
      await pollMeterCues(page, cue);
    }

    // Freeze point reached: the hero has five lines. Decide the winner from the
    // frozen call sequence before spending time on reveals. Clean win only:
    // sole earliest bingo index. A tie or a rival ahead means abandon.
    const frozen = await readArena(arenaId);
    const callSeq = Array.from(frozen.call_sequence);
    const heroIdx = bingoIndex(heroBoard, callSeq);
    const rivalIdx = rivals.map((r) => bingoIndex(r.board, callSeq));
    const cleanWin =
      heroIdx !== null &&
      rivalIdx.every((idx) => idx === null || idx > heroIdx);
    console.log(`  freeze at ${callSeq.length} calls: heroIdx=${heroIdx} rivalIdx=${rivalIdx.join(",")} cleanWin=${cleanWin}`);
    if (!cleanWin) {
      return { win: false, cues, arenaId, videoPending: true };
    }

    // 6. Auto-claim fires from the app and signs through the shim. Let the
    // letter meter fill on screen before logging the bingo beat.
    await pollUntil(async () => (await readSnapshot(page)).meterCount >= 5, 20000, 700);
    await pollMeterCues(page, cue);
    cue.once("bingo");
    cue.once("auto-claim");
    // Give the app a beat to auto-claim; fall back to the armed button if needed.
    let claimed = await pollUntil(async () => {
      const a = await readArena(arenaId);
      return a.state.tag === "Revealing" ? a : null;
    }, 35000, 1500);
    if (!claimed) {
      const claimButton = await findButtonByName(page.locator(".claim-row"), /claim bingo/i);
      if (claimButton) await claimButton.click();
      claimed = await waitState(arenaId, ["Revealing"]);
    }
    cue.once("claimed");
    console.log("  bingo claimed, reveal phase open");

    // 7. Reveal. Rivals headless, then settle. The hero reveals with its own
    // key: revealed_board_of returns null (not undefined) for a player who has
    // not revealed, and the app's GameRoom tests `!== undefined`, so it marks
    // every seat "revealed" the instant the reveal phase opens and hides the
    // "reveal your board" button after a sub-second render window. We click that
    // button if we catch it, and otherwise reveal the hero headlessly with the
    // hero key so it still reveals its own board. A real revealed board is a
    // Buffer, so on-chain checks use `!= null`.
    await page.locator(".countdown").waitFor({ state: "visible", timeout: DOM_WAIT_MS });
    cue.once("reveal-panel");
    // No beat here: the reveal button is only live for a sub-second window
    // before the app hides it, so start hunting for it immediately.

    const heroRevealedOnChain = async () => (await revealedBoardOf(arenaId, heroPk)) != null;
    const heroRevealButton = page.getByRole("button", { name: /reveal your board/i });
    let clickedReveal = false;
    const tightDeadline = Date.now() + 12000;
    while (Date.now() < tightDeadline && !clickedReveal) {
      if (await heroRevealButton.isVisible().catch(() => false)) {
        await heroRevealButton.click().catch(() => {});
        clickedReveal = true;
        console.log("  hero reveal clicked in the render window");
      } else {
        await sleep(120);
      }
    }
    let heroRevealed = await pollUntil(heroRevealedOnChain, clickedReveal ? CHAIN_CONFIRM_TIMEOUT_MS : 3000, 1500);
    if (!heroRevealed) {
      console.log("  reveal button unreachable (app marks all seats revealed early), revealing hero headlessly");
      await sendWrite(
        await heroClient.reveal_board({
          arena_id: arenaId,
          player: heroPk,
          board: Buffer.from(heroBoard),
          salt: heroSalt,
        })
      );
      await pollUntil(heroRevealedOnChain, CHAIN_CONFIRM_TIMEOUT_MS);
    }
    cue.once("hero-revealed");
    console.log("  hero revealed");
    await sleep(BEAT_MS);

    for (const r of rivals) {
      await sendWrite(
        await r.client.reveal_board({
          arena_id: arenaId,
          player: r.publicKey,
          board: Buffer.from(r.board),
          salt: Buffer.from(r.salt),
        })
      );
    }
    await pollUntil(async () => {
      const marks = await Promise.all(frozen.players.map((p) => revealedBoardOf(arenaId, p)));
      return marks.every((b) => b != null);
    }, CHAIN_CONFIRM_TIMEOUT_MS);
    cue.once("rivals-revealed");
    console.log("  rivals revealed");

    // Settle unlocks once all boards are in; the hero clicks it.
    const settleButton = page.getByRole("button", { name: /settle the table/i });
    await pollUntil(async () => (await settleButton.isEnabled().catch(() => false)), DOM_WAIT_MS, 1500);
    await sleep(BEAT_MS);
    await settleButton.click();
    cue.once("settle-clicked");
    await waitState(arenaId, ["Settled"]);
    cue.once("settled");
    console.log("  table settled");

    // Confirm the hero swept the pot before keeping the take.
    const heroEarnings = await earningsOf(heroPk);
    const total = STAKE * BigInt(SEATS);
    const expectedPool = total - (total * FEE_BPS) / 10_000n;
    const rivalEarnings = await Promise.all(rivals.map((r) => earningsOf(r.publicKey)));
    console.log(`  hero earnings ${heroEarnings} (pool ${expectedPool}), rivals ${rivalEarnings.join(",")}`);
    if (heroEarnings <= 0n || rivalEarnings.some((e) => e > 0n)) {
      return { win: false, cues, arenaId, videoPending: true };
    }

    // 8. Withdraw. The earnings card credits, the hero pulls it, the header
    // balance ticks up.
    await sleep(BEAT_MS);
    const withdrawButton = page.getByRole("button", { name: /withdraw/i });
    await pollUntil(async () => (await withdrawButton.isEnabled().catch(() => false)), DOM_WAIT_MS, 1500);
    await withdrawButton.click();
    cue.once("withdraw-clicked");
    await pollUntil(async () => (await earningsOf(heroPk)) === 0n, CHAIN_CONFIRM_TIMEOUT_MS);
    // Nudge the header balance to reflect the landed XLM within its poll.
    await page.locator('button[title="Refresh balance"]').click().catch(() => {});
    await sleep(2500);
    cue.once("withdrawn");
    console.log("  withdrawn");

    win = true;
    await sleep(FINAL_LINGER_MS);
    return { win: true, cues, arenaId, heroPk };
  } catch (err) {
    console.log(`  attempt ${attemptNumber} errored: ${err instanceof Error ? err.stack : err}`);
    return { win: false, cues, arenaId, videoPending: true };
  } finally {
    const video = page ? page.video() : null;
    if (context) await context.close();
    if (browser) await browser.close();
    if (win && video) {
      // Path resolves only once the context has flushed the recording.
      lastWinningVideo = await video.path();
    }
  }
}

function convertToMp4(inputPath) {
  console.log(`Converting ${inputPath} to H.264 mp4...`);
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale=1920:1080",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-movflags",
      "+faststart",
      TAKE_PATH,
    ],
    { stdio: "inherit" }
  );
  if (result.status !== 0) throw new Error(`ffmpeg conversion failed with exit code ${result.status}`);
}

async function main() {
  await mkdir(GAMEPLAY_DIR, { recursive: true });
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });

  await ensureChromiumInstalled();
  runBuild();
  const preview = startPreview();

  try {
    await waitForServer(BASE_URL, 20000);

    let winner = null;
    for (let n = 1; n <= MAX_ATTEMPTS && !winner; n++) {
      console.log(`Attempt ${n} of ${MAX_ATTEMPTS}...`);
      const result = await attempt(n);
      if (result.win) {
        winner = { ...result, video: lastWinningVideo };
        console.log(`  attempt ${n} is a clean hero win on arena ${result.arenaId}`);
      } else {
        console.log(`  attempt ${n} not a clean win, retrying with fresh keys`);
      }
    }

    if (!winner) throw new Error(`No clean hero win after ${MAX_ATTEMPTS} attempts.`);

    convertToMp4(winner.video);

    const totalMs = winner.cues[winner.cues.length - 1].tMs + FINAL_LINGER_MS;
    const payload = {
      heroAddress: winner.heroPk,
      arenaId: winner.arenaId,
      cues: winner.cues,
      totalMs,
    };
    await writeFile(CUES_PATH, JSON.stringify(payload, null, 2) + "\n");

    await rm(TMP_DIR, { recursive: true, force: true });

    const takeStats = await stat(TAKE_PATH);
    console.log(`Done. Clean hero win on arena ${winner.arenaId}.`);
    console.log(`${TAKE_PATH} (${takeStats.size} bytes)`);
    console.log(`${CUES_PATH}`);
  } finally {
    stopPreview(preview);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
