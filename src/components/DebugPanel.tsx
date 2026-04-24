import type { DebugEntry } from "../types";
import { formatRedactedPayload } from "../utils/redact";

type DebugPanelProps = {
  entries: DebugEntry[];
  isOpen: boolean;
  loggingEnabled: boolean;
  onClear: () => void;
  onCopy: () => void;
  onToggleLogging: () => void;
};

export function DebugPanel({
  entries,
  isOpen,
  loggingEnabled,
  onClear,
  onCopy,
  onToggleLogging,
}: DebugPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="debug-panel open">
      <div className="debug-header">
        <div>
          <div className="debug-title">Debug</div>
          <div className="debug-subtitle">
            {loggingEnabled
              ? "Sensitive values are redacted before display and copy."
              : "Logging is paused. New diagnostics are not retained."}
          </div>
        </div>
        <div className="debug-actions">
          <button
            className={`ghost ${loggingEnabled ? "" : "debug-toggle-off"}`}
            onClick={onToggleLogging}
          >
            {loggingEnabled ? "Logging On" : "Logging Off"}
          </button>
          <button className="ghost" onClick={onCopy}>
            Copy
          </button>
          <button className="ghost" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      {isOpen && (
        <div className="debug-list">
          {entries.length === 0 && (
            <div className="debug-empty">No debug events yet.</div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="debug-row">
              <div className="debug-meta">
                <span className={`debug-source ${entry.source}`}>
                  {entry.source}
                </span>
                <span className="debug-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="debug-label">{entry.label}</span>
              </div>
              {entry.payload !== undefined && (
                <pre className="debug-payload">
                  {formatRedactedPayload(entry.payload)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
