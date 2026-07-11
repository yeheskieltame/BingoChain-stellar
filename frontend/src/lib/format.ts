// Small display-only formatting helpers shared by every card that renders a
// stake, a payout, or a Stellar address: Lobby, GameRoom, RevealPanel,
// EarningsCard. Kept dependency free (no Intl config, no bignumber lib) since
// stroops are always an exact multiple of 1e-7 XLM.

/** Stroops (1 XLM = 10_000_000 stroops) to a trimmed decimal XLM string. */
export function stroopsToXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / 10_000_000n;
  const frac = abs % 10_000_000n;
  const sign = negative ? "-" : "";
  if (frac === 0n) return `${sign}${whole}`;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fracStr}`;
}

/** A Stellar address shortened to its first and last four characters. */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
