const COLS = ["B", "I", "N", "G", "O"] as const;

interface Props {
  card: number[];
  drawn: Set<number>;
  /** Highlight the most recently called number on the card. */
  latest?: number | null;
}

/** A 5x5 Bingo card with B-I-N-G-O headers; cells "dab" when their number is called. */
export default function CardGrid({ card, drawn, latest = null }: Props) {
  return (
    <div className="card">
      <div className="card-cols">
        {COLS.map((c) => (
          <span key={c} className="card-col">
            {c}
          </span>
        ))}
      </div>
      <div className="card-grid">
        {card.map((n, i) => {
          const free = n === 0;
          const marked = free || drawn.has(n);
          const isLatest = latest !== null && n === latest;
          return (
            <div
              key={i}
              className={`cell ${marked ? "cell--marked" : ""} ${free ? "cell--free" : ""} ${
                isLatest ? "cell--latest" : ""
              }`}
            >
              <span className="cell-num">{free ? "★" : n}</span>
              {marked && <span className="cell-dab" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
