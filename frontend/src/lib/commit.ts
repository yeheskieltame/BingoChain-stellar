// Sealed board commitment: sha256(board bytes || salt bytes), matching the
// contract's reveal_board check exactly (25 board bytes, then 32 salt
// bytes, 57 total). Pure crypto and validation logic lives above the line
// below; localStorage access is isolated to saveReveal/loadReveal under it.

const BOARD_SIZE = 25;
const SALT_SIZE = 32;

/** A shuffled 1..25 permutation, the board layout a player commits to. */
export function randomBoard(): number[] {
  const board = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

/** True if board is exactly a permutation of 1..25, what the contract requires. */
export function isValidBoard(board: number[]): boolean {
  if (board.length !== BOARD_SIZE) return false;
  const seen = new Set(board);
  if (seen.size !== BOARD_SIZE) return false;
  return board.every((n) => Number.isInteger(n) && n >= 1 && n <= BOARD_SIZE);
}

/** 32 random bytes for the commitment salt. */
export function newSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_SIZE);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * sha256 over the 25 board bytes followed by the 32 salt bytes, matching
 * reveal_board's check exactly. Throws if board or salt are the wrong shape.
 */
export async function boardCommitment(board: number[], salt: Uint8Array): Promise<Uint8Array> {
  if (!isValidBoard(board)) throw new Error("Board must contain 1 to 25, each exactly once.");
  if (salt.length !== SALT_SIZE) throw new Error("Salt must be 32 bytes.");

  const preimage = new Uint8Array(BOARD_SIZE + SALT_SIZE);
  preimage.set(board, 0);
  preimage.set(salt, BOARD_SIZE);

  const digest = await crypto.subtle.digest("SHA-256", preimage);
  return new Uint8Array(digest);
}

// ---------------------------------------------------------------------------
// Reveal storage. saveReveal must run BEFORE the commit_board transaction is
// sent, so a crash mid-transaction never loses the salt: without it, the
// board cannot be revealed later and the stake is forfeited at settlement.
// ---------------------------------------------------------------------------

interface RevealRecord {
  board: number[];
  salt: string; // base64
}

function revealKey(contractId: string, arenaId: number, address: string): string {
  return `bingo:reveal:${contractId}:${arenaId}:${address}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Persist the board and salt for a given arena and player, local device only. */
export function saveReveal(
  contractId: string,
  arenaId: number,
  address: string,
  board: number[],
  salt: Uint8Array
): void {
  const record: RevealRecord = { board, salt: bytesToBase64(salt) };
  localStorage.setItem(revealKey(contractId, arenaId, address), JSON.stringify(record));
}

/** Read back the board and salt saved by saveReveal, or null if none is stored. */
export function loadReveal(
  contractId: string,
  arenaId: number,
  address: string
): { board: number[]; salt: Uint8Array } | null {
  const raw = localStorage.getItem(revealKey(contractId, arenaId, address));
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as RevealRecord;
    return { board: record.board, salt: base64ToBytes(record.salt) };
  } catch {
    return null;
  }
}
