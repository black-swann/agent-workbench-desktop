import { useCallback, useState } from "react";
import type { DebugEntry } from "../types";
import { formatRedactedPayload, redactSensitive } from "../utils/redact";

const MAX_DEBUG_ENTRIES = 200;

export function useDebugLog({ enabled = true }: { enabled?: boolean } = {}) {
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [hasDebugAlerts, setHasDebugAlerts] = useState(false);

  const shouldLogEntry = useCallback((entry: DebugEntry) => {
    if (entry.source === "error" || entry.source === "stderr") {
      return true;
    }
    const label = entry.label.toLowerCase();
    if (label.includes("warn") || label.includes("warning")) {
      return true;
    }
    if (typeof entry.payload === "string") {
      const payload = entry.payload.toLowerCase();
      return payload.includes("warn") || payload.includes("warning");
    }
    return false;
  }, []);

  const addDebugEntry = useCallback(
    (entry: DebugEntry) => {
      if (!enabled) {
        return;
      }
      if (!shouldLogEntry(entry)) {
        return;
      }
      setHasDebugAlerts(true);
      setDebugEntries((prev) => [
        ...prev,
        { ...entry, payload: redactSensitive(entry.payload) },
      ].slice(-MAX_DEBUG_ENTRIES));
    },
    [enabled, shouldLogEntry],
  );

  const handleCopyDebug = useCallback(async () => {
    const text = debugEntries
      .map((entry) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        const payload = formatRedactedPayload(entry.payload);
        return [entry.source.toUpperCase(), timestamp, entry.label, payload]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  }, [debugEntries]);

  const clearDebugEntries = useCallback(() => {
    setDebugEntries([]);
    setHasDebugAlerts(false);
  }, []);

  return {
    debugOpen,
    setDebugOpen,
    debugEntries,
    hasDebugAlerts,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  };
}
