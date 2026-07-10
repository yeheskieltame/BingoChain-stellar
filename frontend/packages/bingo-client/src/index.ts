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
    contractId: "CBMENYQVO6SC3AQEKB3EZFII6TSWBFD4IBMF5JXHNZ7TKY6WKKFH2YLA",
  }
} as const


export interface Game {
  drawn: Array<u32>;
  host: string;
  id: u32;
  players: Array<Player>;
  status: Status;
  winner: Option<string>;
}


export interface Player {
  addr: string;
  /**
 * 25 numbers, row-major. The center cell (index 12) is 0 = free space.
 */
card: Array<u32>;
}

export type Status = {tag: "Open", values: void} | {tag: "Playing", values: void} | {tag: "Finished", values: void};

export interface Client {
  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a single game.
   */
  get_game: ({game_id}: {game_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Game>>

  /**
   * Construct and simulate a get_games transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read all games (lobby view).
   */
  get_games: (options?: MethodOptions) => Promise<AssembledTransaction<Array<Game>>>

  /**
   * Construct and simulate a join_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Join an existing game with a freshly generated card.
   */
  join_game: ({game_id, player}: {game_id: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u32>>>

  /**
   * Construct and simulate a claim_bingo transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim BINGO. The contract verifies the caller's card against drawn numbers.
   * Returns true and ends the game on a valid win; false otherwise.
   */
  claim_bingo: ({game_id, player}: {game_id: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a create_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a new game. The host auto-joins with a fresh card. Returns the game id.
   */
  create_game: ({host}: {host: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a draw_number transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Draw the next random number for a game. Permissionless — anyone may call.
   */
  draw_number: ({game_id}: {game_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAGAAAAAAAAAAVkcmF3bgAAAAAAA+oAAAAEAAAAAAAAAARob3N0AAAAEwAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB3BsYXllcnMAAAAD6gAAB9AAAAAGUGxheWVyAAAAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAZTdGF0dXMAAAAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAABlBsYXllcgAAAAAAAgAAAAAAAAAEYWRkcgAAABMAAABEMjUgbnVtYmVycywgcm93LW1ham9yLiBUaGUgY2VudGVyIGNlbGwgKGluZGV4IDEyKSBpcyAwID0gZnJlZSBzcGFjZS4AAAAEY2FyZAAAA+oAAAAE",
        "AAAAAgAAAAAAAAAAAAAABlN0YXR1cwAAAAAAAwAAAAAAAAAAAAAABE9wZW4AAAAAAAAAAAAAAAdQbGF5aW5nAAAAAAAAAAAAAAAACEZpbmlzaGVk",
        "AAAAAAAAABNSZWFkIGEgc2luZ2xlIGdhbWUuAAAAAAhnZXRfZ2FtZQAAAAEAAAAAAAAAB2dhbWVfaWQAAAAABAAAAAEAAAfQAAAABEdhbWU=",
        "AAAAAAAAABxSZWFkIGFsbCBnYW1lcyAobG9iYnkgdmlldykuAAAACWdldF9nYW1lcwAAAAAAAAAAAAABAAAD6gAAB9AAAAAER2FtZQ==",
        "AAAAAAAAADRKb2luIGFuIGV4aXN0aW5nIGdhbWUgd2l0aCBhIGZyZXNobHkgZ2VuZXJhdGVkIGNhcmQuAAAACWpvaW5fZ2FtZQAAAAAAAAIAAAAAAAAAB2dhbWVfaWQAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+oAAAAE",
        "AAAAAAAAAItDbGFpbSBCSU5HTy4gVGhlIGNvbnRyYWN0IHZlcmlmaWVzIHRoZSBjYWxsZXIncyBjYXJkIGFnYWluc3QgZHJhd24gbnVtYmVycy4KUmV0dXJucyB0cnVlIGFuZCBlbmRzIHRoZSBnYW1lIG9uIGEgdmFsaWQgd2luOyBmYWxzZSBvdGhlcndpc2UuAAAAAAtjbGFpbV9iaW5nbwAAAAACAAAAAAAAAAdnYW1lX2lkAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAE5DcmVhdGUgYSBuZXcgZ2FtZS4gVGhlIGhvc3QgYXV0by1qb2lucyB3aXRoIGEgZnJlc2ggY2FyZC4gUmV0dXJucyB0aGUgZ2FtZSBpZC4AAAAAAAtjcmVhdGVfZ2FtZQAAAAABAAAAAAAAAARob3N0AAAAEwAAAAEAAAAE",
        "AAAAAAAAAEtEcmF3IHRoZSBuZXh0IHJhbmRvbSBudW1iZXIgZm9yIGEgZ2FtZS4gUGVybWlzc2lvbmxlc3Mg4oCUIGFueW9uZSBtYXkgY2FsbC4AAAAAC2RyYXdfbnVtYmVyAAAAAAEAAAAAAAAAB2dhbWVfaWQAAAAABAAAAAEAAAAE" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_game: this.txFromJSON<Game>,
        get_games: this.txFromJSON<Array<Game>>,
        join_game: this.txFromJSON<Array<u32>>,
        claim_bingo: this.txFromJSON<boolean>,
        create_game: this.txFromJSON<u32>,
        draw_number: this.txFromJSON<u32>
  }
}