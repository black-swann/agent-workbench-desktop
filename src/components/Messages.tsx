import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import type { ConversationItem } from "../types";
import { languageFromPath } from "../utils/syntax";

const Markdown = lazy(async () => {
  const module = await import("./Markdown");
  return { default: module.Markdown };
});

const DiffBlock = lazy(async () => {
  const module = await import("./DiffBlock");
  return { default: module.DiffBlock };
});

type MessagesProps = {
  items: ConversationItem[];
  isThinking: boolean;
  isLoading?: boolean;
  statusMessage?: string | null;
  workspacePath?: string | null;
  checkpoints?: Array<{ itemId: string; label: string }>;
  onToggleCheckpoint?: (itemId: string, label: string) => void;
};

export function Messages({
  items,
  isThinking,
  isLoading = false,
  statusMessage = null,
  workspacePath = null,
  checkpoints = [],
  onToggleCheckpoint,
}: MessagesProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const seenItems = useRef(new Set<string>());
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const maxVisibleItems = 30;

  async function handleOpenChangedPath(path: string) {
    const resolvedPath =
      path.startsWith("/") || !workspacePath
        ? path
        : `${workspacePath.replace(/\/$/, "")}/${path}`;
    await openPath(resolvedPath);
  }

  function jumpToItem(itemId: string) {
    const target = document.getElementById(`thread-item-${itemId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function checkpointLabelForItem(item: ConversationItem) {
    if (item.kind === "message") {
      const text = item.text.trim() || item.role;
      return text.length > 36 ? `${text.slice(0, 36)}…` : text;
    }
    if (item.kind === "reasoning") {
      const text = item.summary.trim() || item.content.trim() || "Reasoning";
      return text.length > 36 ? `${text.slice(0, 36)}…` : text;
    }
    if (item.kind === "review") {
      return item.text.trim() || "Review";
    }
    return item.title.length > 36 ? `${item.title.slice(0, 36)}…` : item.title;
  }

  const visibleItems =
    !showAll && items.length > maxVisibleItems
      ? items.slice(-maxVisibleItems)
      : items;

  useEffect(() => {
    setOpenItems((prev) => {
      let changed = false;
      const next = new Set(prev);
      items.forEach((item) => {
        if (seenItems.current.has(item.id)) {
          return;
        }
        seenItems.current.add(item.id);
        const shouldOpen =
          item.kind === "tool" && item.toolType === "fileChange";
        if (shouldOpen) {
          next.add(item.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [items]);

  useEffect(() => {
    if (!bottomRef.current) {
      return undefined;
    }
    let raf1 = 0;
    let raf2 = 0;
    const target = bottomRef.current;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    });
    return () => {
      if (raf1) {
        window.cancelAnimationFrame(raf1);
      }
      if (raf2) {
        window.cancelAnimationFrame(raf2);
      }
    };
  }, [items.length, isThinking]);

  return (
    <div
      ref={listRef}
      className="messages messages-full"
      onScroll={() => {
        const node = listRef.current;
        if (!node) {
          return;
        }
        const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
        if (!showAll && node.scrollTop <= 80) {
          setShowAll(true);
        } else if (showAll && distanceFromBottom <= 80) {
          setShowAll(false);
        }
      }}
    >
      {checkpoints.length > 0 && (
        <div className="thread-checkpoints">
          <div className="thread-checkpoints-title">Checkpoints</div>
          <div className="thread-checkpoints-list">
            {checkpoints.map((checkpoint) => (
              <button
                key={checkpoint.itemId}
                className="thread-checkpoint"
                onClick={() => jumpToItem(checkpoint.itemId)}
                type="button"
              >
                {checkpoint.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {visibleItems.map((item) => {
        const isCheckpoint = checkpoints.some(
          (checkpoint) => checkpoint.itemId === item.id,
        );
        if (item.kind === "message") {
          return (
            <div key={item.id} id={`thread-item-${item.id}`} className={`message ${item.role}`}>
              <button
                className={`item-checkpoint ${isCheckpoint ? "active" : ""}`}
                onClick={() =>
                  onToggleCheckpoint?.(item.id, checkpointLabelForItem(item))
                }
                type="button"
                title={isCheckpoint ? "Remove checkpoint" : "Save checkpoint"}
              >
                ★
              </button>
              <div className="bubble">
                <Suspense fallback={<div className="markdown-loading">Loading…</div>}>
                  <Markdown value={item.text} className="markdown" />
                </Suspense>
              </div>
            </div>
          );
        }
        if (item.kind === "reasoning") {
          const summaryText = item.summary || item.content;
          const summaryLines = summaryText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          const rawTitle =
            summaryLines.length > 0
              ? summaryLines[summaryLines.length - 1]
              : "Reasoning";
          const cleanTitle = rawTitle
            .replace(/[`*_~]/g, "")
            .replace(/\[(.*?)\]\(.*?\)/g, "$1")
            .trim();
          const summaryTitle =
            cleanTitle.length > 80
              ? `${cleanTitle.slice(0, 80)}…`
              : cleanTitle || "Reasoning";
          return (
            <details
              key={item.id}
              id={`thread-item-${item.id}`}
              className="item-card reasoning"
              open={openItems.has(item.id)}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenItems((prev) => {
                  const next = new Set(prev);
                  if (isOpen) {
                    next.add(item.id);
                  } else {
                    next.delete(item.id);
                  }
                  return next;
                });
              }}
            >
              <summary>
                <span className="item-summary-left">
                  <span className="item-chevron" aria-hidden>
                    ▸
                  </span>
                  <span className="item-title">{summaryTitle}</span>
                </span>
                <button
                  className={`item-checkpoint ${isCheckpoint ? "active" : ""}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleCheckpoint?.(item.id, checkpointLabelForItem(item));
                  }}
                  type="button"
                  title={isCheckpoint ? "Remove checkpoint" : "Save checkpoint"}
                >
                  ★
                </button>
              </summary>
              <div className="item-body">
                {item.summary && (
                  <Suspense fallback={<div className="markdown-loading">Loading…</div>}>
                    <Markdown value={item.summary} className="item-text markdown" />
                  </Suspense>
                )}
                {item.content && (
                  <Suspense fallback={<div className="markdown-loading">Loading…</div>}>
                    <Markdown value={item.content} className="item-text markdown" />
                  </Suspense>
                )}
              </div>
            </details>
          );
        }
        if (item.kind === "review") {
          const title =
            item.state === "started" ? "Review started" : "Review completed";
          return (
            <div key={item.id} id={`thread-item-${item.id}`} className="item-card review">
              <div className="review-header">
                <span className="review-title">{title}</span>
                <button
                  className={`item-checkpoint ${isCheckpoint ? "active" : ""}`}
                  onClick={() =>
                    onToggleCheckpoint?.(item.id, checkpointLabelForItem(item))
                  }
                  type="button"
                  title={isCheckpoint ? "Remove checkpoint" : "Save checkpoint"}
                >
                  ★
                </button>
                <span
                  className={`review-badge ${
                    item.state === "started" ? "active" : "done"
                  }`}
                >
                  Review
                </span>
              </div>
              {item.text && (
                <Suspense fallback={<div className="markdown-loading">Loading…</div>}>
                  <Markdown value={item.text} className="item-text markdown" />
                </Suspense>
              )}
            </div>
          );
        }
        if (item.kind !== "tool") {
          return null;
        }
        const isFileChange = item.toolType === "fileChange";
        return (
          <details
            key={item.id}
            id={`thread-item-${item.id}`}
            className="item-card tool"
            open={isFileChange ? openItems.has(item.id) : undefined}
            onToggle={
              isFileChange
                ? (event) => {
                    const isOpen = event.currentTarget.open;
                    setOpenItems((prev) => {
                      const next = new Set(prev);
                      if (isOpen) {
                        next.add(item.id);
                      } else {
                        next.delete(item.id);
                      }
                      return next;
                    });
                  }
                : undefined
            }
          >
            <summary>
              <span className="item-summary-left">
                <span className="item-chevron" aria-hidden>
                  ▸
                </span>
                <span className="item-title">{item.title}</span>
              </span>
              <button
                className={`item-checkpoint ${isCheckpoint ? "active" : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleCheckpoint?.(item.id, checkpointLabelForItem(item));
                }}
                type="button"
                title={isCheckpoint ? "Remove checkpoint" : "Save checkpoint"}
              >
                ★
              </button>
              {item.status && <span className="item-status">{item.status}</span>}
            </summary>
            <div className="item-body">
              {!isFileChange && item.detail && (
                <Suspense fallback={<div className="markdown-loading">Loading…</div>}>
                  <Markdown value={item.detail} className="item-text markdown" />
                </Suspense>
              )}
              {isFileChange && item.changes?.length ? (
                <div className="file-change-list">
                  {item.changes.map((change, index: number) => (
                    <div
                      key={`${change.path}-${index}`}
                      className="file-change"
                    >
                      <div className="file-change-header">
                        {change.kind && (
                          <span className="file-change-kind">
                            {change.kind.toUpperCase()}
                          </span>
                        )}
                        <button
                          className="file-change-path"
                          onClick={() => void handleOpenChangedPath(change.path)}
                          type="button"
                          title="Open changed file"
                        >
                          {change.path}
                        </button>
                      </div>
                      {change.diff && (
                        <div className="diff-viewer-output">
                          <Suspense fallback={<div className="markdown-loading">Loading diff…</div>}>
                            <DiffBlock
                              diff={change.diff}
                              language={languageFromPath(change.path)}
                            />
                          </Suspense>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              {isFileChange && !item.changes?.length && item.detail && (
                <Suspense fallback={<div className="markdown-loading">Loading…</div>}>
                  <Markdown value={item.detail} className="item-text markdown" />
                </Suspense>
              )}
              {item.output && (!isFileChange || !item.changes?.length) && (
                <Suspense fallback={<div className="markdown-loading">Loading…</div>}>
                  <Markdown
                    value={item.output}
                    className="item-output markdown"
                    codeBlock
                  />
                </Suspense>
              )}
            </div>
          </details>
        );
      })}
      {isThinking && (
        <div className="thinking">Codex is thinking...</div>
      )}
      {statusMessage && items.length > 0 && (
        <div className="messages-status">{statusMessage}</div>
      )}
      {isLoading && items.length > 0 && (
        <div className="messages-status">Refreshing thread history...</div>
      )}
      {!items.length && (
        <div className="empty messages-empty">
          {statusMessage ?? "Start a thread and send a prompt to the agent."}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
