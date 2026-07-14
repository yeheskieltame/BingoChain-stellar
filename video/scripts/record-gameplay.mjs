#!/usr/bin/env node
// Records a winning practice round of BingoChain Stellar with a headless
// chromium, using a greedy line-completion strategy so the round ends in a
// player win. Builds and serves the frontend, plays the round, keeps only
// the winning take, converts it to mp4, and writes a cuesheet for Remotion.

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(VIDEO_DIR, "..");
const FRONTEND_DIR = path.join(REPO_ROOT, "frontend");
const GAMEPLAY_DIR = path.join(VIDEO_DIR, "assets", "gameplay");
const TMP_DIR = path.join(GAMEPLAY_DIR, "tmp");
const TAKE_PATH = path.join(GAMEPLAY_DIR, "take.mp4");
const CUES_PATH = path.join(GAMEPLAY_DIR, "cues.json");

const PORT = 4199;
const BASE_URL = `http://localhost:${PORT}`;
const MAX_ATTEMPTS = 12;
const ATTEMPT_TIMEOUT_MS = 90000;

// Pacing beats, not fixed sleeps standing in for real waits: the app's own
// state (turn strip, meter, phase) always gates what happens next. These
// just slow the cut down enough to read on camera.
const PRACTICE_VIEW_PAUSE_MS = 1200;
const SHUFFLE_BEAT_MS = 900;
const POST_SETUP_PAUSE_MS = 900;
const PLAYER_THINK_PAUSE_MS = 500;
const DAUBER_PAUSE_MS = 600;
const POLL_INTERVAL_MS = 150;
const FINAL_LINGER_MS = 15000;

// Same 12 winning lines as contracts/bingo/src/board.rs and
// frontend/src/lib/board.ts: 5 rows, 5 columns, 2 diagonals, as bitmasks
// over the 25 cell positions (bit p set when cell p = row * 5 + col).
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

/** Mirrors the bot's own botPick in frontend/src/lib/practice.ts: for every
 * unmarked cell, score its best line's marked-cell count, take the max. */
function bestPick(markedBits) {
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

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server not up yet, keep polling.
    }
    await sleep(300);
  }
  throw new Error(`Frontend preview never came up at ${url}`);
}

function runBuild() {
  console.log("Building frontend...");
  const result = spawnSync("pnpm", ["build"], { cwd: FRONTEND_DIR, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`pnpm build failed with exit code ${result.status}`);
  }
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
  if (result.status !== 0) {
    throw new Error("playwright install chromium failed");
  }
}

/** Finds a button by its accessible name within a scoped container, reading
 * the label straight off the DOM instead of assuming fixed app copy. */
async function findButtonByName(scope, namePattern) {
  const buttons = await scope.getByRole("button").all();
  for (const button of buttons) {
    const name = (await button.textContent())?.trim() ?? "";
    if (namePattern.test(name)) return button;
  }
  return null;
}

async function readSnapshot(page) {
  return page.evaluate(() => {
    const turnEl = document.querySelector(".turn-strip");
    const meterEl = document.querySelector(".bingo-meter");
    const settledEl = document.querySelector(".state-title");
    const claimNoteEl = document.querySelector(".claim-note");
    const settleButton = Array.from(document.querySelectorAll("button")).find((b) =>
      /settle/i.test(b.textContent ?? "")
    );
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
      settleVisible: !!settleButton,
      settledTitle: settledEl ? settledEl.textContent : null,
      cells,
    };
  });
}

/** Logs a cue with a strictly increasing timestamp: nudges past the last
 * logged tMs when two beats land in the same polling tick. */
function makeCueLogger(startedAt, cues) {
  return (label) => {
    const measured = Date.now() - startedAt;
    const floor = cues.length > 0 ? cues[cues.length - 1].tMs + 1 : 0;
    const tMs = Math.max(measured, floor);
    cues.push({ label, tMs });
    console.log(`  cue ${label} at ${tMs}ms`);
  };
}

/** Plays one practice round to its end, greedy on the player's own board.
 * Returns null if the round timed out, otherwise the outcome and cues. */
async function playRound(page, startedAt) {
  const cues = [];
  const logCue = makeCueLogger(startedAt, cues);
  const logged = new Set();
  const once = (key, fn) => {
    if (logged.has(key)) return;
    logged.add(key);
    fn();
  };

  await page.goto(`${BASE_URL}/#/`);
  await page.getByRole("heading", { name: /open tables/i }).waitFor({ state: "visible" });
  once("lobby-open", () => logCue("lobby-open"));
  await sleep(3000);

  const playFreeLink = page.getByRole("link", { name: /play free/i });
  await playFreeLink.click();
  await page.getByRole("heading", { name: /practice table/i }).waitFor({ state: "visible" });
  once("practice-open", () => logCue("practice-open"));
  await sleep(PRACTICE_VIEW_PAUSE_MS);

  const setupActions = page.locator(".board-setup-actions");
  const shuffleButton = await findButtonByName(setupActions, /shuffle/i);
  const commitButton = await findButtonByName(setupActions, /^(?!.*shuffle).+$/i);
  if (!shuffleButton || !commitButton) {
    throw new Error("Could not find the shuffle or commit button on the setup panel.");
  }

  await shuffleButton.click();
  await sleep(SHUFFLE_BEAT_MS);
  await shuffleButton.click();
  await sleep(SHUFFLE_BEAT_MS);
  await commitButton.click();
  await page.locator(".turn-strip").waitFor({ state: "visible" });
  once("setup-done", () => logCue("setup-done"));
  await sleep(POST_SETUP_PAUSE_MS);

  const deadline = Date.now() + ATTEMPT_TIMEOUT_MS;
  let settleClicked = false;

  while (Date.now() < deadline) {
    const snap = await readSnapshot(page);

    if (snap.settledTitle) {
      once("settled", () => logCue("settled"));
      const win = snap.settledTitle.includes("You take the pot");
      return { win, cues, settledTitle: snap.settledTitle };
    }

    if (snap.strikeCount >= 1) once("first-strike", () => logCue("first-strike"));
    if (snap.meterCount >= 2) once("meter-2", () => logCue("meter-2"));
    if (snap.meterCount >= 3) once("meter-3", () => logCue("meter-3"));
    if (snap.meterCount >= 4) once("meter-4", () => logCue("meter-4"));
    if (snap.meterCount >= 5) once("bingo", () => logCue("bingo"));
    if (snap.claimNoteVisible || snap.settleVisible) {
      once("auto-claim", () => logCue("auto-claim"));
    }

    if (snap.settleVisible) {
      if (!settleClicked) {
        const settleButton = await findButtonByName(page.locator(".claim-row"), /settle/i);
        if (settleButton) {
          settleClicked = true;
          await settleButton.click();
        }
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (snap.isYourTurn) {
      let marked = 0;
      snap.cells.forEach((cell, idx) => {
        if (cell.marked) marked |= 1 << idx;
      });
      const pick = bestPick(marked);
      if (pick !== null && !snap.cells[pick].disabled) {
        await sleep(PLAYER_THINK_PAUSE_MS);
        await page.locator(".board-cell").nth(pick).click();
        once("first-call", () => logCue("first-call"));
        await sleep(DAUBER_PAUSE_MS);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
      continue;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

async function attempt(attemptNumber) {
  const attemptDir = path.join(TMP_DIR, `attempt-${attemptNumber}`);
  await mkdir(attemptDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: attemptDir, size: { width: 1920, height: 1080 } },
  });
  const startedAt = Date.now();
  const page = await context.newPage();

  let outcome = null;
  try {
    outcome = await playRound(page, startedAt);
  } catch (err) {
    console.log(`  attempt ${attemptNumber} errored: ${err instanceof Error ? err.message : err}`);
  }

  if (outcome?.win) {
    await sleep(FINAL_LINGER_MS);
  }

  const video = page.video();
  await context.close();
  await browser.close();

  const videoPath = video ? await video.path() : null;
  return { outcome, videoPath, attemptDir };
}

async function convertToMp4(inputPath) {
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
  if (result.status !== 0) {
    throw new Error(`ffmpeg conversion failed with exit code ${result.status}`);
  }
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

    let winningResult = null;
    for (let n = 1; n <= MAX_ATTEMPTS && !winningResult; n++) {
      console.log(`Attempt ${n} of ${MAX_ATTEMPTS}...`);
      const result = await attempt(n);
      if (result.outcome?.win) {
        console.log(`  win: "${result.outcome.settledTitle}"`);
        winningResult = { ...result, attemptNumber: n };
      } else {
        const label = result.outcome ? result.outcome.settledTitle : "no result (timed out)";
        console.log(`  not a win: ${label}, retrying`);
      }
    }

    if (!winningResult) {
      throw new Error(`No winning take after ${MAX_ATTEMPTS} attempts.`);
    }

    await convertToMp4(winningResult.videoPath);

    const cuesPayload = {
      cues: winningResult.outcome.cues,
      totalMs: winningResult.outcome.cues[winningResult.outcome.cues.length - 1].tMs + FINAL_LINGER_MS,
    };
    const { writeFile } = await import("node:fs/promises");
    await writeFile(CUES_PATH, JSON.stringify(cuesPayload, null, 2) + "\n");

    await rm(TMP_DIR, { recursive: true, force: true });

    const takeStats = await stat(TAKE_PATH);
    console.log(`Done. Winning take on attempt ${winningResult.attemptNumber}.`);
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
