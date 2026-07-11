import { describe, expect, it } from "vitest";
import { mapError } from "./errors";
import { TxSubmitError } from "./tx";
import { WrongNetworkError } from "./wallet";

describe("mapError", () => {
  it("classifies a WrongNetworkError instance as wrong-network", () => {
    const result = mapError(new WrongNetworkError("Public Global Stellar Network ; September 2015"));
    expect(result.kind).toBe("wrong-network");
  });

  it("classifies a Freighter decline string as wallet-declined", () => {
    const result = mapError(new Error("User declined access"));
    expect(result.kind).toBe("wallet-declined");
  });

  it("recognizes the other Freighter decline wordings DECLINE_RE targets", () => {
    expect(mapError(new Error("The user rejected this request")).kind).toBe("wallet-declined");
    expect(mapError(new Error("Request was denied by the user")).kind).toBe("wallet-declined");
    expect(mapError(new Error("user cancelled the signing request")).kind).toBe("wallet-declined");
  });

  it("extracts a contract error code from an Error(Contract, #N) string", () => {
    const result = mapError(new Error("simulation failed: Error(Contract, #9)"));
    expect(result).toMatchObject({ kind: "contract", code: 9, name: "NotYourTurn" });
    if (result.kind === "contract") {
      expect(result.hint.length).toBeGreaterThan(0);
    }
  });

  it("falls back to an Unknown contract name for an unmapped code", () => {
    const result = mapError(new Error("Error(Contract, #999)"));
    expect(result).toMatchObject({ kind: "contract", code: 999, name: "Unknown" });
  });

  it("maps a TypeError from a failed fetch to the network kind", () => {
    const result = mapError(new TypeError("Failed to fetch"));
    expect(result.kind).toBe("network");
  });

  it("routes a TxSubmitError with op_underfunded to unknown, never wallet-declined", () => {
    const err = new TxSubmitError(null, ["op_underfunded"]);
    const result = mapError(err);
    expect(result.kind).toBe("unknown");
    expect(result.kind).not.toBe("wallet-declined");
  });

  it("never renders an object-with-message throw as [object Object]", () => {
    const result = mapError({ message: "Something odd happened" });
    expect(result.kind).toBe("unknown");
    if (result.kind === "unknown") {
      expect(result.detail).toBe("Something odd happened");
      expect(result.detail).not.toContain("[object Object]");
    }
  });
});
