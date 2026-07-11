import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CBCW77BY44FCNXB2BKMKDNRP3QBWYKZ25NCLHHIFSBDJFHTSILLBD4MJ";
    };
};
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
export declare const Errors: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
    7: {
        message: string;
    };
    8: {
        message: string;
    };
    9: {
        message: string;
    };
    10: {
        message: string;
    };
    11: {
        message: string;
    };
    12: {
        message: string;
    };
    13: {
        message: string;
    };
    14: {
        message: string;
    };
    15: {
        message: string;
    };
    16: {
        message: string;
    };
    17: {
        message: string;
    };
    18: {
        message: string;
    };
};
export interface Config {
    admin: string;
    fee_bps: u32;
    token: string;
}
export type DataKey = {
    tag: "Config";
    values: void;
} | {
    tag: "ArenaCount";
    values: void;
} | {
    tag: "Arena";
    values: readonly [u32];
} | {
    tag: "Commit";
    values: readonly [u32, string];
} | {
    tag: "Board";
    values: readonly [u32, string];
} | {
    tag: "Earnings";
    values: readonly [string];
};
/**
 * Lifecycle of a single arena, advanced only in the order declared here.
 */
export type ArenaState = {
    tag: "Created";
    values: void;
} | {
    tag: "Committed";
    values: void;
} | {
    tag: "Playing";
    values: void;
} | {
    tag: "Revealing";
    values: void;
} | {
    tag: "Settled";
    values: void;
} | {
    tag: "Cancelled";
    values: void;
};
export interface Client {
    /**
     * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The contract configuration set at construction.
     */
    config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>;
    /**
     * Construct and simulate a settle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Settle an arena and split the prize. Anyone may call once the reveal
     * window closes, or earlier if every player has revealed. Non revealers
     * forfeit. Winners are the revealed players who reached five lines at the
     * earliest call index; if none did, those with the most completed lines at
     * the final state; if nobody revealed, the whole pot becomes the fee.
     */
    settle: ({ arena_id }: {
        arena_id: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Withdraw your accumulated earnings. The ledger entry is zeroed before the
     * token leaves the contract. Returns the amount paid out.
     */
    withdraw: ({ account }: {
        account: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>;
    /**
     * Construct and simulate a commit_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The sealed board commitment a player submitted, if they joined.
     */
    commit_of: ({ arena_id, player }: {
        arena_id: u32;
        player: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>;
    /**
     * Construct and simulate a get_arena transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Read a single arena, or ArenaNotFound if the id was never created.
     */
    get_arena: ({ arena_id }: {
        arena_id: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Arena>>>;
    /**
     * Construct and simulate a arena_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Number of arenas ever created (also the id of the most recent one).
     */
    arena_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;
    /**
     * Construct and simulate a call_number transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Call a number on your turn. The first call flips a Committed arena to
     * Playing; the 25th opens the reveal phase. Each of 1..=25 is callable once.
     */
    call_number: ({ arena_id, player, number }: {
        arena_id: u32;
        player: string;
        number: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a claim_bingo transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Claim BINGO to freeze the call sequence and open the reveal phase. The
     * winner is decided by replay in settle, so a false claim cannot win.
     */
    claim_bingo: ({ arena_id, player }: {
        arena_id: u32;
        player: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a earnings_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * A player's withdrawable balance from cancels and settlements.
     */
    earnings_of: ({ player }: {
        player: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a cancel_arena transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Cancel an unfilled (Created) arena and refund every joined player through
     * the earnings ledger. The creator may cancel anytime; anyone may cancel
     * once the join window has elapsed.
     */
    cancel_arena: ({ arena_id, caller }: {
        arena_id: u32;
        caller: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a commit_board transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Join an arena with a sealed board commitment and escrow the stake. Seals
     * the arena to Committed once the last seat fills.
     */
    commit_board: ({ arena_id, player, commitment }: {
        arena_id: u32;
        player: string;
        commitment: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a create_arena transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Open a new arena. The creator does not auto join; they join through
     * commit_board like every other player. Arena ids start at 1.
     */
    create_arena: ({ creator, stake, max_players }: {
        creator: string;
        stake: i128;
        max_players: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>;
    /**
     * Construct and simulate a reveal_board transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Reveal your board within the reveal window. It must hash to your sealed
     * commitment (sha256 over the 25 board bytes followed by the 32 salt bytes)
     * and be a permutation of 1..=25.
     */
    reveal_board: ({ arena_id, player, board, salt }: {
        arena_id: u32;
        player: string;
        board: Buffer;
        salt: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a revealed_board_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The board a player revealed for an arena, if they have revealed.
     */
    revealed_board_of: ({ arena_id, player }: {
        arena_id: u32;
        player: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, token, fee_bps }: {
        admin: string;
        token: string;
        fee_bps: u32;
    }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        config: (json: string) => AssembledTransaction<Config>;
        settle: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        withdraw: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        commit_of: (json: string) => AssembledTransaction<Option<Buffer>>;
        get_arena: (json: string) => AssembledTransaction<Result<Arena, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        arena_count: (json: string) => AssembledTransaction<number>;
        call_number: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        claim_bingo: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        earnings_of: (json: string) => AssembledTransaction<bigint>;
        cancel_arena: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        commit_board: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        create_arena: (json: string) => AssembledTransaction<Result<number, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        reveal_board: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        revealed_board_of: (json: string) => AssembledTransaction<Option<Buffer>>;
    };
}
