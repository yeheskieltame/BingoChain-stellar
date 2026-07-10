import { useToasts } from "../hooks/useToasts";
import { AlertIcon, CheckIcon, LinkIcon, Spinner, SparkleIcon } from "./Icons";

export default function Toasts() {
  const { toasts, dismiss } = useToasts();

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast-glyph">
            {t.kind === "success" && <CheckIcon size={16} />}
            {t.kind === "error" && <AlertIcon size={16} />}
            {t.kind === "pending" && <Spinner size={16} />}
            {t.kind === "info" && <SparkleIcon size={14} />}
          </span>
          <div className="toast-body">
            <p className="toast-title">{t.title}</p>
            {t.message && <p className="toast-msg">{t.message}</p>}
            {t.href && (
              <a className="toast-link" href={t.href} target="_blank" rel="noreferrer">
                {t.hrefLabel ?? "View on explorer"} <LinkIcon size={12} />
              </a>
            )}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
