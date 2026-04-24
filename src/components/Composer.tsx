import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { QueuedMessage, ThreadTokenUsage } from "../types";

type ComposerProps = {
  onSend: (text: string) => void;
  onStop: () => void;
  canStop: boolean;
  disabled?: boolean;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string | null) => void;
  accessMode: "read-only" | "current" | "full-access";
  onSelectAccessMode: (mode: "read-only" | "current" | "full-access") => void;
  skills: { name: string; description?: string }[];
  contextUsage?: ThreadTokenUsage | null;
  queuedMessages?: QueuedMessage[];
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
  sendLabel?: string;
  prefillDraft?: QueuedMessage | null;
  onPrefillHandled?: (id: string) => void;
  onResetToDefaults?: () => void;
  onComposerRef?: (element: HTMLTextAreaElement | null) => void;
  selectionStatus?: {
    model: { isOverride: boolean; currentLabel: string; defaultLabel: string };
    effort: { isOverride: boolean; currentLabel: string; defaultLabel: string };
    access: { isOverride: boolean; currentLabel: string; defaultLabel: string };
  } | null;
};

export function Composer({
  onSend,
  onStop,
  canStop,
  disabled = false,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  accessMode,
  onSelectAccessMode,
  skills,
  contextUsage = null,
  queuedMessages = [],
  onEditQueued,
  onDeleteQueued,
  sendLabel = "Send",
  prefillDraft = null,
  onPrefillHandled,
  onResetToDefaults,
  onComposerRef,
  selectionStatus = null,
}: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = useCallback(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, []);

  const contextFreePercent = useMemo(() => {
    const contextWindow = contextUsage?.modelContextWindow ?? null;
    if (!contextWindow || contextWindow <= 0) {
      return null;
    }
    const lastTokens = contextUsage?.last.totalTokens ?? 0;
    const totalTokens = contextUsage?.total.totalTokens ?? 0;
    const usedTokens = lastTokens > 0 ? lastTokens : totalTokens;
    if (usedTokens <= 0) {
      return null;
    }
    const usedPercent = Math.min(
      Math.max((usedTokens / contextWindow) * 100, 0),
      100,
    );
    return Math.max(0, 100 - usedPercent);
  }, [contextUsage]);

  const handleSend = useCallback(() => {
    if (disabled) {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
    setText("");
  }, [disabled, onSend, text]);

  const handleQueueMenu = useCallback(
    async (event: React.MouseEvent, item: QueuedMessage) => {
      event.preventDefault();
      event.stopPropagation();
      const { clientX, clientY } = event;
      const editItem = await MenuItem.new({
        text: "Edit",
        action: () => onEditQueued?.(item),
      });
      const deleteItem = await MenuItem.new({
        text: "Delete",
        action: () => onDeleteQueued?.(item.id),
      });
      const menu = await Menu.new({ items: [editItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(clientX, clientY);
      await menu.popup(position, window);
    },
    [onDeleteQueued, onEditQueued],
  );

  const handleSelectSkill = useCallback((name: string) => {
    const snippet = `$${name}`;
    setText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) {
        return snippet + " ";
      }
      if (trimmed.includes(snippet)) {
        return prev;
      }
      return `${prev.trim()} ${snippet} `;
    });
  }, []);

  useEffect(() => {
    if (!prefillDraft) {
      return;
    }
    setText(prefillDraft.text);
    onPrefillHandled?.(prefillDraft.id);
  }, [prefillDraft, onPrefillHandled]);

  useEffect(() => {
    onComposerRef?.(textareaRef.current);
    return () => {
      onComposerRef?.(null);
    };
  }, [onComposerRef]);

  useEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, text]);

  return (
    <footer className={`composer${disabled ? " is-disabled" : ""}`}>
      {queuedMessages.length > 0 && (
        <div className="composer-queue">
          <div className="composer-queue-title">Queued</div>
          <div className="composer-queue-list">
            {queuedMessages.map((item) => (
              <div key={item.id} className="composer-queue-item">
                <span className="composer-queue-text">{item.text}</span>
                <button
                  className="composer-queue-menu"
                  onClick={(event) => handleQueueMenu(event, item)}
                  aria-label="Queue item menu"
                >
                  ...
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="composer-input">
        <textarea
          ref={textareaRef}
          placeholder={
            disabled
              ? "Review in progress. Chat will re-enable when it completes."
              : "Ask Codex to do something..."
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
          onInput={resizeTextarea}
          disabled={disabled}
          onKeyDown={(event) => {
            if (disabled) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="composer-stop"
          onClick={onStop}
          disabled={disabled || !canStop}
          aria-label="Stop"
        >
          Stop
        </button>
        <button
          className="composer-send"
          onClick={handleSend}
          disabled={disabled}
        >
          {sendLabel}
        </button>
      </div>
      <div className="composer-bar">
        <div className="composer-meta">
          <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 8V6a5 5 0 0 1 10 0v2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <rect
                  x="4.5"
                  y="8"
                  width="15"
                  height="11"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <circle cx="9" cy="13" r="1" fill="currentColor" />
                <circle cx="15" cy="13" r="1" fill="currentColor" />
                <path
                  d="M9 16h6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <select
              className="composer-select composer-select--model"
              aria-label="Model"
              title={selectionStatus?.model.currentLabel ?? "Model"}
              value={selectedModelId ?? ""}
              onChange={(event) => onSelectModel(event.target.value)}
              disabled={disabled}
            >
              {models.length === 0 && <option value="">No models</option>}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName || model.model}
                </option>
              ))}
            </select>
          </div>
          <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M8.5 4.5a3.5 3.5 0 0 0-3.46 4.03A4 4 0 0 0 6 16.5h2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M15.5 4.5a3.5 3.5 0 0 1 3.46 4.03A4 4 0 0 1 18 16.5h-2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M9 12h6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M12 12v6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <select
              className="composer-select composer-select--effort"
              aria-label="Thinking mode"
              title={selectionStatus?.effort.currentLabel ?? "Thinking mode"}
              value={selectedEffort ?? ""}
              onChange={(event) => onSelectEffort(event.target.value || null)}
              disabled={disabled}
            >
              <option value="">Default</option>
              {reasoningOptions.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </div>
          <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V7l7-3z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.5 12.5l1.8 1.8 3.7-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <select
              className="composer-select composer-select--approval"
              aria-label="Agent access"
              title={selectionStatus?.access.currentLabel ?? "Agent access"}
              disabled={disabled}
              value={accessMode}
              onChange={(event) =>
                onSelectAccessMode(
                  event.target.value as "read-only" | "current" | "full-access",
                )
              }
            >
              <option value="read-only">Read only</option>
              <option value="current">Current</option>
              <option value="full-access">Full access, ask</option>
            </select>
          </div>
          <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v5m0 6v5M4 12h5m6 0h5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </span>
            <select
              className="composer-select composer-select--skill"
              aria-label="Skills"
              title="Insert skill"
              onChange={(event) => {
                const value = event.target.value;
                if (value) {
                  handleSelectSkill(value);
                  event.target.value = "";
                }
              }}
              disabled={disabled}
            >
              <option value="">Skill</option>
              {skills.map((skill) => (
                <option key={skill.name} value={skill.name}>
                  {skill.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {accessMode === "full-access" && (
          <div className="composer-security-warning" role="status">
            Full access can read and write outside this workspace. Approval prompts
            stay enabled before privileged actions run.
          </div>
        )}
        {selectionStatus && (
          <div className="composer-status" aria-live="polite">
            <span
              className={`composer-status-pill ${
                selectionStatus.model.isOverride ? "is-override" : ""
              }`}
              title={`Current: ${selectionStatus.model.currentLabel}. Workspace default: ${selectionStatus.model.defaultLabel}.`}
            >
              Model {selectionStatus.model.isOverride ? "override" : "default"}
            </span>
            <span
              className={`composer-status-pill ${
                selectionStatus.effort.isOverride ? "is-override" : ""
              }`}
              title={`Current: ${selectionStatus.effort.currentLabel}. Workspace default: ${selectionStatus.effort.defaultLabel}.`}
            >
              Thinking {selectionStatus.effort.isOverride ? "override" : "default"}
            </span>
            <span
              className={`composer-status-pill ${
                selectionStatus.access.isOverride ? "is-override" : ""
              }`}
              title={`Current: ${selectionStatus.access.currentLabel}. Workspace default: ${selectionStatus.access.defaultLabel}.`}
            >
              Access {selectionStatus.access.isOverride ? "override" : "default"}
            </span>
            {(selectionStatus.model.isOverride ||
              selectionStatus.effort.isOverride ||
              selectionStatus.access.isOverride) &&
              onResetToDefaults && (
                <button
                  className="composer-reset"
                  onClick={onResetToDefaults}
                  type="button"
                >
                  Reset to defaults
                </button>
              )}
          </div>
        )}
        <div className="composer-context">
          <div
            className="composer-context-ring"
            data-tooltip={
              contextFreePercent === null
                ? "Context free --"
                : `Context free ${Math.round(contextFreePercent)}%`
            }
            aria-label={
              contextFreePercent === null
                ? "Context free --"
                : `Context free ${Math.round(contextFreePercent)}%`
            }
            style={
              {
                "--context-free": contextFreePercent ?? 0,
              } as React.CSSProperties
            }
          >
            <span className="composer-context-value">●</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
