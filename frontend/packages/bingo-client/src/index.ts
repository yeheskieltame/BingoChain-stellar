import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDI5BKQK23UBJFWOO2T5UUVYKYA3ARIO7WXADVVU3HBL4ODCDORWQZBW",
  }
} as const


/**
 * A staked peer to peer bingo arena. Gameplay fields (called_mask, call_count,
 * turn_index, call_sequence, reveal_deadline) are set by later gameplay calls
 * and start zeroed at creation.
 */
export interface Arena {
  call_count: u32;
  call_sequence: Buffer;
  called_mask: u32;
  created_at: u64;
  creator: string;
  id: u32;
  max_players: u32;
  players: Array<string>;
  reveal_deadline: u64;
  stake: i128;
  state: ArenaState;
  turn_index: u32;
}

/**
 * Contract error codes. The numeric values are part of the ABI: the frontend
 * error mapper decodes them by code, so never renumber an existing variant.
 */
export const Errors = {
  1: {message:"FeeTooHigh"},
  2: {message:"InvalidPlayerCount"},
  3: {message:"StakeTooLow"},
  4: {message:"ArenaNotFound"},
  5: {message:"WrongState"},
  6: {message:"AlreadyJoined"},
  7: {message:"ArenaFull"},
  8: {message:"NotAPlayer"},
  9: {message:"NotYourTurn"},
  10: {message:"NumberOutOfRange"},
  11: {message:"NumberAlreadyCalled"},
  12: {message:"CommitMismatch"},
  13: {message:"AlreadyRevealed"},
  14: {message:"RevealWindowClosed"},
  15: {message:"RevealWindowOpen"},
  16: {message:"InvalidBoard"},
  17: {message:"NothingToWithdraw"},
  18: {message:"CancelNotAllowed"}
}


export interface Config {
  admin: string;
  fee_bps: u32;
  token: string;
}

export type DataKey = {tag: "Config", values: void} | {tag: "ArenaCount", values: void} | {tag: "Arena", values: readonly [u32]} | {tag: "Commit", values: readonly [u32, string]} | {tag: "Board", values: readonly [u32, string]} | {tag: "Earnings", values: readonly [string]};

/**
 * Lifecycle of a single arena, advanced only in the order declared here.
 */
export type ArenaState = {tag: "Created", values: void} | {tag: "Committed", values: void} | {tag: "Playing", values: void} | {tag: "Revealing", values: void} | {tag: "Settled", values: void} | {tag: "Cancelled", values: void};

export interface Client {
  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The contract configuration set at construction.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a settle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settle an arena and split the prize. Anyone may call once the reveal
   * window closes, or earlier if every player has revealed. Non revealers
   * forfeit. Winners are the revealed players who reached five lines at the
   * earliest call index; if none did, those with the most completed lines at
   * the final state; if nobody revealed, the whole pot becomes the fee.
   */
  settle: ({arena_id}: {arena_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw your accumulated earnings. The ledger entry is zeroed before the
   * token leaves the contract. Returns the amount paid out.
   */
  withdraw: ({account}: {account: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a commit_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The sealed board commitment a player submitted, if they joined.
   */
  commit_of: ({arena_id, player}: {arena_id: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>

  /**
   * Construct and simulate a get_arena transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a single arena, or ArenaNotFound if the id was never created.
   */
  get_arena: ({arena_id}: {arena_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Arena>>>

  /**
   * Construct and simulate a arena_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Number of arenas ever created (also the id of the most recent one).
   */
  arena_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a call_number transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Call a number on your turn. The first call flips a Committed arena to
   * Playing; the 25th opens the reveal phase. Each of 1..=25 is callable once.
   */
  call_number: ({arena_id, player, number}: {arena_id: u32, player: string, number: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim_bingo transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim BINGO to freeze the call sequence and open the reveal phase. The
   * winner is decided by replay in settle, so a false claim cannot win.
   */
  claim_bingo: ({arena_id, player}: {arena_id: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a earnings_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A player's withdrawable balance from cancels and settlements.
   */
  earnings_of: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a cancel_arena transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a stalled arena and refund every joined player through the
   * earnings ledger. Authorization matrix: a Created (unfilled) arena may be
   * cancelled by its creator anytime, or by anyone once the join window has
   * elapsed; a Committed (full but never called) arena may be cancelled by
   * anyone, creator included, only after the join window, so stakes cannot
   * stay stranded when the first player to act never calls. Early attempts
   * get CancelNotAllowed; a Playing or later arena gets WrongState.
   */
  cancel_arena: ({arena_id, caller}: {arena_id: u32, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a commit_board transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Join an arena with a sealed board commitment and escrow the stake. Seals
   * the arena to Committed once the last seat fills.
   */
  commit_board: ({arena_id, player, commitment}: {arena_id: u32, player: string, commitment: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_arena transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Open a new arena. The creator does not auto join; they join through
   * commit_board like every other player. Arena ids start at 1.
   */
  create_arena: ({creator, stake, max_players}: {creator: string, stake: i128, max_players: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a reveal_board transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reveal your board within the reveal window. It must hash to your sealed
   * commitment (sha256 over the 25 board bytes followed by the 32 salt bytes)
   * and be a permutation of 1..=25.
   */
  reveal_board: ({arena_id, player, board, salt}: {arena_id: u32, player: string, board: Buffer, salt: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revealed_board_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The board a player revealed for an arena, if they have revealed.
   */
  revealed_board_of: ({arena_id, player}: {arena_id: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, token, fee_bps}: {admin: string, token: string, fee_bps: u32},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, token, fee_bps}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAC9UaGUgY29udHJhY3QgY29uZmlndXJhdGlvbiBzZXQgYXQgY29uc3RydWN0aW9uLgAAAAAGY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAAV9TZXR0bGUgYW4gYXJlbmEgYW5kIHNwbGl0IHRoZSBwcml6ZS4gQW55b25lIG1heSBjYWxsIG9uY2UgdGhlIHJldmVhbAp3aW5kb3cgY2xvc2VzLCBvciBlYXJsaWVyIGlmIGV2ZXJ5IHBsYXllciBoYXMgcmV2ZWFsZWQuIE5vbiByZXZlYWxlcnMKZm9yZmVpdC4gV2lubmVycyBhcmUgdGhlIHJldmVhbGVkIHBsYXllcnMgd2hvIHJlYWNoZWQgZml2ZSBsaW5lcyBhdCB0aGUKZWFybGllc3QgY2FsbCBpbmRleDsgaWYgbm9uZSBkaWQsIHRob3NlIHdpdGggdGhlIG1vc3QgY29tcGxldGVkIGxpbmVzIGF0CnRoZSBmaW5hbCBzdGF0ZTsgaWYgbm9ib2R5IHJldmVhbGVkLCB0aGUgd2hvbGUgcG90IGJlY29tZXMgdGhlIGZlZS4AAAAABnNldHRsZQAAAAAAAQAAAAAAAAAIYXJlbmFfaWQAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAIFXaXRoZHJhdyB5b3VyIGFjY3VtdWxhdGVkIGVhcm5pbmdzLiBUaGUgbGVkZ2VyIGVudHJ5IGlzIHplcm9lZCBiZWZvcmUgdGhlCnRva2VuIGxlYXZlcyB0aGUgY29udHJhY3QuIFJldHVybnMgdGhlIGFtb3VudCBwYWlkIG91dC4AAAAAAAAId2l0aGRyYXcAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAD9UaGUgc2VhbGVkIGJvYXJkIGNvbW1pdG1lbnQgYSBwbGF5ZXIgc3VibWl0dGVkLCBpZiB0aGV5IGpvaW5lZC4AAAAACWNvbW1pdF9vZgAAAAAAAAIAAAAAAAAACGFyZW5hX2lkAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+gAAAPuAAAAIA==",
        "AAAAAAAAAEJSZWFkIGEgc2luZ2xlIGFyZW5hLCBvciBBcmVuYU5vdEZvdW5kIGlmIHRoZSBpZCB3YXMgbmV2ZXIgY3JlYXRlZC4AAAAAAAlnZXRfYXJlbmEAAAAAAAABAAAAAAAAAAhhcmVuYV9pZAAAAAQAAAABAAAD6QAAB9AAAAAFQXJlbmEAAAAAAAAD",
        "AAAAAAAAAENOdW1iZXIgb2YgYXJlbmFzIGV2ZXIgY3JlYXRlZCAoYWxzbyB0aGUgaWQgb2YgdGhlIG1vc3QgcmVjZW50IG9uZSkuAAAAAAthcmVuYV9jb3VudAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAJBDYWxsIGEgbnVtYmVyIG9uIHlvdXIgdHVybi4gVGhlIGZpcnN0IGNhbGwgZmxpcHMgYSBDb21taXR0ZWQgYXJlbmEgdG8KUGxheWluZzsgdGhlIDI1dGggb3BlbnMgdGhlIHJldmVhbCBwaGFzZS4gRWFjaCBvZiAxLi49MjUgaXMgY2FsbGFibGUgb25jZS4AAAALY2FsbF9udW1iZXIAAAAAAwAAAAAAAAAIYXJlbmFfaWQAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAABm51bWJlcgAAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAIpDbGFpbSBCSU5HTyB0byBmcmVlemUgdGhlIGNhbGwgc2VxdWVuY2UgYW5kIG9wZW4gdGhlIHJldmVhbCBwaGFzZS4gVGhlCndpbm5lciBpcyBkZWNpZGVkIGJ5IHJlcGxheSBpbiBzZXR0bGUsIHNvIGEgZmFsc2UgY2xhaW0gY2Fubm90IHdpbi4AAAAAAAtjbGFpbV9iaW5nbwAAAAACAAAAAAAAAAhhcmVuYV9pZAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAD1BIHBsYXllcidzIHdpdGhkcmF3YWJsZSBiYWxhbmNlIGZyb20gY2FuY2VscyBhbmQgc2V0dGxlbWVudHMuAAAAAAAAC2Vhcm5pbmdzX29mAAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAedDYW5jZWwgYSBzdGFsbGVkIGFyZW5hIGFuZCByZWZ1bmQgZXZlcnkgam9pbmVkIHBsYXllciB0aHJvdWdoIHRoZQplYXJuaW5ncyBsZWRnZXIuIEF1dGhvcml6YXRpb24gbWF0cml4OiBhIENyZWF0ZWQgKHVuZmlsbGVkKSBhcmVuYSBtYXkgYmUKY2FuY2VsbGVkIGJ5IGl0cyBjcmVhdG9yIGFueXRpbWUsIG9yIGJ5IGFueW9uZSBvbmNlIHRoZSBqb2luIHdpbmRvdyBoYXMKZWxhcHNlZDsgYSBDb21taXR0ZWQgKGZ1bGwgYnV0IG5ldmVyIGNhbGxlZCkgYXJlbmEgbWF5IGJlIGNhbmNlbGxlZCBieQphbnlvbmUsIGNyZWF0b3IgaW5jbHVkZWQsIG9ubHkgYWZ0ZXIgdGhlIGpvaW4gd2luZG93LCBzbyBzdGFrZXMgY2Fubm90CnN0YXkgc3RyYW5kZWQgd2hlbiB0aGUgZmlyc3QgcGxheWVyIHRvIGFjdCBuZXZlciBjYWxscy4gRWFybHkgYXR0ZW1wdHMKZ2V0IENhbmNlbE5vdEFsbG93ZWQ7IGEgUGxheWluZyBvciBsYXRlciBhcmVuYSBnZXRzIFdyb25nU3RhdGUuAAAAAAxjYW5jZWxfYXJlbmEAAAACAAAAAAAAAAhhcmVuYV9pZAAAAAQAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAHlKb2luIGFuIGFyZW5hIHdpdGggYSBzZWFsZWQgYm9hcmQgY29tbWl0bWVudCBhbmQgZXNjcm93IHRoZSBzdGFrZS4gU2VhbHMKdGhlIGFyZW5hIHRvIENvbW1pdHRlZCBvbmNlIHRoZSBsYXN0IHNlYXQgZmlsbHMuAAAAAAAADGNvbW1pdF9ib2FyZAAAAAMAAAAAAAAACGFyZW5hX2lkAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAApjb21taXRtZW50AAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAH9PcGVuIGEgbmV3IGFyZW5hLiBUaGUgY3JlYXRvciBkb2VzIG5vdCBhdXRvIGpvaW47IHRoZXkgam9pbiB0aHJvdWdoCmNvbW1pdF9ib2FyZCBsaWtlIGV2ZXJ5IG90aGVyIHBsYXllci4gQXJlbmEgaWRzIHN0YXJ0IGF0IDEuAAAAAAxjcmVhdGVfYXJlbmEAAAADAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAABXN0YWtlAAAAAAAACwAAAAAAAAALbWF4X3BsYXllcnMAAAAABAAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAALFSZXZlYWwgeW91ciBib2FyZCB3aXRoaW4gdGhlIHJldmVhbCB3aW5kb3cuIEl0IG11c3QgaGFzaCB0byB5b3VyIHNlYWxlZApjb21taXRtZW50IChzaGEyNTYgb3ZlciB0aGUgMjUgYm9hcmQgYnl0ZXMgZm9sbG93ZWQgYnkgdGhlIDMyIHNhbHQgYnl0ZXMpCmFuZCBiZSBhIHBlcm11dGF0aW9uIG9mIDEuLj0yNS4AAAAAAAAMcmV2ZWFsX2JvYXJkAAAABAAAAAAAAAAIYXJlbmFfaWQAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAABWJvYXJkAAAAAAAADgAAAAAAAAAEc2FsdAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAJRJbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIHRoZSBmZWUgcmVjaXBpZW50LCB0aGUgc2V0dGxlbWVudCB0b2tlbiwgYW5kCnRoZSBwcm90b2NvbCBmZWUgaW4gYmFzaXMgcG9pbnRzLiBQYW5pY3Mgd2l0aCBGZWVUb29IaWdoIGlmIGZlZV9icHMgPiA1MDAuAAAADV9fY29uc3RydWN0b3IAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAA==",
        "AAAAAAAAAEBUaGUgYm9hcmQgYSBwbGF5ZXIgcmV2ZWFsZWQgZm9yIGFuIGFyZW5hLCBpZiB0aGV5IGhhdmUgcmV2ZWFsZWQuAAAAEXJldmVhbGVkX2JvYXJkX29mAAAAAAAAAgAAAAAAAAAIYXJlbmFfaWQAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAD6AAAAA4=",
        "AAAAAQAAALZBIHN0YWtlZCBwZWVyIHRvIHBlZXIgYmluZ28gYXJlbmEuIEdhbWVwbGF5IGZpZWxkcyAoY2FsbGVkX21hc2ssIGNhbGxfY291bnQsCnR1cm5faW5kZXgsIGNhbGxfc2VxdWVuY2UsIHJldmVhbF9kZWFkbGluZSkgYXJlIHNldCBieSBsYXRlciBnYW1lcGxheSBjYWxscwphbmQgc3RhcnQgemVyb2VkIGF0IGNyZWF0aW9uLgAAAAAAAAAAAAVBcmVuYQAAAAAAAAwAAAAAAAAACmNhbGxfY291bnQAAAAAAAQAAAAAAAAADWNhbGxfc2VxdWVuY2UAAAAAAAAOAAAAAAAAAAtjYWxsZWRfbWFzawAAAAAEAAAAAAAAAApjcmVhdGVkX2F0AAAAAAAGAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAttYXhfcGxheWVycwAAAAAEAAAAAAAAAAdwbGF5ZXJzAAAAA+oAAAATAAAAAAAAAA9yZXZlYWxfZGVhZGxpbmUAAAAABgAAAAAAAAAFc3Rha2UAAAAAAAALAAAAAAAAAAVzdGF0ZQAAAAAAB9AAAAAKQXJlbmFTdGF0ZQAAAAAAAAAAAAp0dXJuX2luZGV4AAAAAAAE",
        "AAAABAAAAJRDb250cmFjdCBlcnJvciBjb2Rlcy4gVGhlIG51bWVyaWMgdmFsdWVzIGFyZSBwYXJ0IG9mIHRoZSBBQkk6IHRoZSBmcm9udGVuZAplcnJvciBtYXBwZXIgZGVjb2RlcyB0aGVtIGJ5IGNvZGUsIHNvIG5ldmVyIHJlbnVtYmVyIGFuIGV4aXN0aW5nIHZhcmlhbnQuAAAAAAAAAAVFcnJvcgAAAAAAABIAAAAAAAAACkZlZVRvb0hpZ2gAAAAAAAEAAAAAAAAAEkludmFsaWRQbGF5ZXJDb3VudAAAAAAAAgAAAAAAAAALU3Rha2VUb29Mb3cAAAAAAwAAAAAAAAANQXJlbmFOb3RGb3VuZAAAAAAAAAQAAAAAAAAACldyb25nU3RhdGUAAAAAAAUAAAAAAAAADUFscmVhZHlKb2luZWQAAAAAAAAGAAAAAAAAAAlBcmVuYUZ1bGwAAAAAAAAHAAAAAAAAAApOb3RBUGxheWVyAAAAAAAIAAAAAAAAAAtOb3RZb3VyVHVybgAAAAAJAAAAAAAAABBOdW1iZXJPdXRPZlJhbmdlAAAACgAAAAAAAAATTnVtYmVyQWxyZWFkeUNhbGxlZAAAAAALAAAAAAAAAA5Db21taXRNaXNtYXRjaAAAAAAADAAAAAAAAAAPQWxyZWFkeVJldmVhbGVkAAAAAA0AAAAAAAAAElJldmVhbFdpbmRvd0Nsb3NlZAAAAAAADgAAAAAAAAAQUmV2ZWFsV2luZG93T3BlbgAAAA8AAAAAAAAADEludmFsaWRCb2FyZAAAABAAAAAAAAAAEU5vdGhpbmdUb1dpdGhkcmF3AAAAAAAAEQAAAAAAAAAQQ2FuY2VsTm90QWxsb3dlZAAAABI=",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAABXRva2VuAAAAAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAKQXJlbmFDb3VudAAAAAAAAQAAAAAAAAAFQXJlbmEAAAAAAAABAAAABAAAAAEAAAAAAAAABkNvbW1pdAAAAAAAAgAAAAQAAAATAAAAAQAAAAAAAAAFQm9hcmQAAAAAAAACAAAABAAAABMAAAABAAAAAAAAAAhFYXJuaW5ncwAAAAEAAAAT",
        "AAAAAgAAAEZMaWZlY3ljbGUgb2YgYSBzaW5nbGUgYXJlbmEsIGFkdmFuY2VkIG9ubHkgaW4gdGhlIG9yZGVyIGRlY2xhcmVkIGhlcmUuAAAAAAAAAAAACkFyZW5hU3RhdGUAAAAAAAYAAAAAAAAAAAAAAAdDcmVhdGVkAAAAAAAAAAAAAAAACUNvbW1pdHRlZAAAAAAAAAAAAAAAAAAAB1BsYXlpbmcAAAAAAAAAAAAAAAAJUmV2ZWFsaW5nAAAAAAAAAAAAAAAAAAAHU2V0dGxlZAAAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    config: this.txFromJSON<Config>,
        settle: this.txFromJSON<Result<void>>,
        withdraw: this.txFromJSON<Result<i128>>,
        commit_of: this.txFromJSON<Option<Buffer>>,
        get_arena: this.txFromJSON<Result<Arena>>,
        arena_count: this.txFromJSON<u32>,
        call_number: this.txFromJSON<Result<void>>,
        claim_bingo: this.txFromJSON<Result<void>>,
        earnings_of: this.txFromJSON<i128>,
        cancel_arena: this.txFromJSON<Result<void>>,
        commit_board: this.txFromJSON<Result<void>>,
        create_arena: this.txFromJSON<Result<u32>>,
        reveal_board: this.txFromJSON<Result<void>>,
        revealed_board_of: this.txFromJSON<Option<Buffer>>
  }
}