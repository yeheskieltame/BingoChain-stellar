import { ballColumn } from "../lib/stellar";

interface Props {
  n: number;
  size?: number;
  /** Dim style for numbers not yet called (used on the full 1-75 board). */
  muted?: boolean;
  /** Extra emphasis for the most recent draw. */
  latest?: boolean;
}

/** Column index 0-4 → CSS class so each B-I-N-G-O column gets its own neon hue. */
function colClass(n: number): string {
  const idx = Math.floor((n - 1) / 15);
  return ["ball--b", "ball--i", "ball--n", "ball--g", "ball--o"][idx] ?? "";
}

export default function BingoBall({ n, size = 56, muted = false, latest = false }: Props) {
  return (
    <div
      className={`ball ${colClass(n)} ${muted ? "ball--muted" : ""} ${latest ? "ball--latest" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      <span className="ball-col">{ballColumn(n)}</span>
      <span className="ball-num">{n}</span>
      <span className="ball-shine" />
    </div>
  );
}
