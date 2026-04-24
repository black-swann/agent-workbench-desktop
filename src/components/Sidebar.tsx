import type {
  ApprovalRequest,
  RateLimitSnapshot,
  ThreadSummary,
  WorkspaceInfo,
} from "../types";
import { useState } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

type SidebarProps = {
  width: number;
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  isListingByWorkspace: Record<string, boolean>;
  threadStatusById: Record<
    string,
    { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
  >;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  accountRateLimits: RateLimitSnapshot | null;
  approvals: ApprovalRequest[];
  onAddWorkspace: () => void;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onRefreshWorkspace: (workspace: WorkspaceInfo) => void;
  onRemoveWorkspace: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onTogglePinThread: (threadId: string) => void;
  onResizeSidebar: (width: number) => void;
};

export function Sidebar({
  width,
  workspaces,
  threadsByWorkspace,
  isListingByWorkspace,
  threadStatusById,
  activeWorkspaceId,
  activeThreadId,
  accountRateLimits,
  approvals,
  onAddWorkspace,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddAgent,
  onRefreshWorkspace,
  onRemoveWorkspace,
  onToggleWorkspaceCollapse,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  onTogglePinThread,
  onResizeSidebar,
}: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    new Set<string>(),
  );
  const [threadSearch, setThreadSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<
    "all" | "running" | "unread" | "approval" | "pinned"
  >("all");

  function startSidebarResize(event: React.MouseEvent) {
    event.preventDefault();
    const handleMove = (moveEvent: MouseEvent) => {
      onResizeSidebar(moveEvent.clientX);
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  async function showWorkspaceMenu(
    event: React.MouseEvent,
    workspace: WorkspaceInfo,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const refreshItem = await MenuItem.new({
      text: "Refresh",
      action: () => onRefreshWorkspace(workspace),
    });
    const revealItem = await MenuItem.new({
      text: "Reveal in Files",
      action: async () => {
        await revealItemInDir(workspace.path);
      },
    });
    const removeItem = await MenuItem.new({
      text: "Remove Workspace",
      action: async () => {
        const yes = await confirm(
          `Remove ${workspace.name} from Agent Workbench? This does not delete files on disk.`,
          {
            title: "Remove Workspace",
            kind: "warning",
          },
        );
        if (yes) {
          onRemoveWorkspace(workspace);
        }
      },
    });
    const menu = await Menu.new({ items: [refreshItem, revealItem, removeItem] });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  async function showThreadMenu(
    event: React.MouseEvent,
    thread: ThreadSummary,
    workspaceId: string,
    threadId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const renameItem = await MenuItem.new({
      text: "Rename",
      action: () => onRenameThread(workspaceId, threadId),
    });
    const pinItem = await MenuItem.new({
      text: thread.isPinned ? "Unpin" : "Pin",
      action: () => onTogglePinThread(threadId),
    });
    const archiveItem = await MenuItem.new({
      text: "Archive",
      action: () => onDeleteThread(workspaceId, threadId),
    });
    const copyItem = await MenuItem.new({
      text: "Copy ID",
      action: async () => {
        await navigator.clipboard.writeText(threadId);
      },
    });
    const menu = await Menu.new({ items: [renameItem, pinItem, copyItem, archiveItem] });
    const window = getCurrentWindow();
    const position = new LogicalPosition(event.clientX, event.clientY);
    await menu.popup(position, window);
  }

  const usagePercent = accountRateLimits?.primary?.usedPercent;
  const globalUsagePercent = accountRateLimits?.secondary?.usedPercent;
  const credits = accountRateLimits?.credits ?? null;
  const creditsLabel = credits?.hasCredits
    ? credits.unlimited
      ? "Credits: unlimited"
      : credits.balance
        ? `Credits: ${credits.balance}`
        : "Credits"
    : null;

  const primaryWindowLabel = (() => {
    const minutes = accountRateLimits?.primary?.windowDurationMins ?? null;
    if (!minutes || minutes <= 0) {
      return "Session";
    }
    if (minutes % 60 === 0) {
      return `${minutes / 60}H session`;
    }
    return `${minutes}m session`;
  })();

  const secondaryWindowLabel = (() => {
    const minutes = accountRateLimits?.secondary?.windowDurationMins ?? null;
    if (!minutes || minutes <= 0) {
      return "Global session";
    }
    return "Global session";
  })();

  const primaryUsageLabel =
    typeof usagePercent === "number"
      ? `${primaryWindowLabel}: ${Math.min(Math.max(Math.round(usagePercent), 0), 100)}%`
      : `${primaryWindowLabel}: --`;
  const secondaryUsageLabel =
    typeof globalUsagePercent === "number"
      ? `${secondaryWindowLabel}: ${Math.min(Math.max(Math.round(globalUsagePercent), 0), 100)}%`
      : `${secondaryWindowLabel}: --`;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-copy">
          <div className="subtitle">Projects</div>
        </div>
        <div className="sidebar-header-actions">
          <button
            className="ghost sidebar-size-button"
            onClick={() => onResizeSidebar(width - 40)}
            data-tauri-drag-region="false"
            aria-label="Reduce sidebar width"
            title="Reduce sidebar width"
          >
            -
          </button>
          <button
            className="ghost sidebar-size-button"
            onClick={() => onResizeSidebar(width + 40)}
            data-tauri-drag-region="false"
            aria-label="Expand sidebar width"
            title="Expand sidebar width"
          >
            +
          </button>
          <button
            className="ghost workspace-add"
            onClick={onAddWorkspace}
            data-tauri-drag-region="false"
            aria-label="Add workspace"
          >
            +
          </button>
        </div>
      </div>
      <div className="sidebar-body">
        <div className="workspace-list">
          {workspaces.length > 0 && (
            <div className="thread-search">
              <input
                className="thread-search-input"
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                placeholder="Search agents across projects"
                aria-label="Search threads"
              />
              <select
                className="thread-filter-select"
                value={threadFilter}
                onChange={(event) =>
                  setThreadFilter(
                    event.target.value as
                      | "all"
                      | "running"
                      | "unread"
                      | "approval"
                      | "pinned",
                  )
                }
                aria-label="Filter threads"
              >
                <option value="all">All</option>
                <option value="running">Running</option>
                <option value="unread">Unread</option>
                <option value="approval">Approvals</option>
                <option value="pinned">Pinned</option>
              </select>
            </div>
          )}
          {workspaces.map((entry) => {
            const threads = threadsByWorkspace[entry.id] ?? [];
            const normalizedSearch = threadSearch.trim().toLowerCase();
            const approvalCount = approvals.filter(
              (approval) => approval.workspace_id === entry.id,
            ).length;
            const filteredThreads = threads.filter((thread) => {
              const matchesSearch =
                !normalizedSearch ||
                thread.name.toLowerCase().includes(normalizedSearch);
              const status = threadStatusById[thread.id];
              const matchesFilter =
                threadFilter === "all" ||
                (threadFilter === "running" && status?.isProcessing) ||
                (threadFilter === "unread" && status?.hasUnread) ||
                (threadFilter === "approval" && approvalCount > 0) ||
                (threadFilter === "pinned" && thread.isPinned);
              return matchesSearch && matchesFilter;
            });
            const workspaceMatchesFilter =
              threadFilter === "all" ||
              (threadFilter === "approval" && approvalCount > 0) ||
              filteredThreads.length > 0;
            const workspaceMatchesSearch =
              !normalizedSearch ||
              entry.name.toLowerCase().includes(normalizedSearch) ||
              filteredThreads.length > 0;
            const isListing = isListingByWorkspace[entry.id] ?? false;
            const isCollapsed = entry.settings.sidebarCollapsed;
            const hasGlobalSearch = Boolean(normalizedSearch) || threadFilter !== "all";
            const showThreads = !isCollapsed || hasGlobalSearch;
            const processingCount = threads.filter(
              (thread) => threadStatusById[thread.id]?.isProcessing,
            ).length;
            const unreadCount = threads.filter(
              (thread) => threadStatusById[thread.id]?.hasUnread,
            ).length;

            if (!workspaceMatchesSearch || !workspaceMatchesFilter) {
              return null;
            }

            return (
              <div key={entry.id} className="workspace-card">
                <div
                  className={`workspace-row ${
                    entry.id === activeWorkspaceId ? "active" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectWorkspace(entry.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectWorkspace(entry.id);
                    }
                  }}
                  onContextMenu={(event) => showWorkspaceMenu(event, entry)}
                >
                  <div>
                    <div className="workspace-name-row">
                      <div className="workspace-title">
                        <span className="workspace-name">{entry.name}</span>
                        {(processingCount > 0 || unreadCount > 0 || approvalCount > 0) && (
                          <span className="workspace-activity">
                            {processingCount > 0 && (
                              <span className="workspace-activity-pill">
                                {processingCount} running
                              </span>
                            )}
                            {unreadCount > 0 && (
                              <span className="workspace-activity-pill unread">
                                {unreadCount} unread
                              </span>
                            )}
                            {approvalCount > 0 && (
                              <span className="workspace-activity-pill approval">
                                {approvalCount} approval
                              </span>
                            )}
                          </span>
                        )}
                        <button
                          className={`workspace-toggle ${
                            isCollapsed ? "" : "expanded"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleWorkspaceCollapse(entry.id, !isCollapsed);
                          }}
                          data-tauri-drag-region="false"
                          aria-label={
                            isCollapsed ? "Show agents" : "Hide agents"
                          }
                          aria-expanded={!isCollapsed}
                        >
                          <span className="workspace-toggle-icon">›</span>
                        </button>
                      </div>
                      <button
                        className="ghost workspace-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAddAgent(entry);
                        }}
                        data-tauri-drag-region="false"
                        aria-label="Add agent"
                      >
                        +
                      </button>
                      <button
                        className="ghost workspace-action workspace-menu-trigger"
                        onClick={(event) => showWorkspaceMenu(event, entry)}
                        data-tauri-drag-region="false"
                        aria-label="Workspace menu"
                      >
                        ...
                      </button>
                    </div>
                  </div>
                  {!entry.connected && (
                    <span
                      className="connect"
                      onClick={(event) => {
                        event.stopPropagation();
                        onConnectWorkspace(entry);
                      }}
                    >
                      connect
                    </span>
                  )}
                </div>
                {showThreads && (
                  <div className="thread-list">
                    {isListing && (
                      <div className="thread-placeholder">Loading agents...</div>
                    )}
                    {!isListing && !entry.connected && (
                      <div className="thread-placeholder">Connect to load agents.</div>
                    )}
                    {!isListing && entry.connected && threads.length === 0 && (
                      <div className="thread-placeholder">No agents yet.</div>
                    )}
                    {!isListing &&
                      entry.connected &&
                      threads.length > 0 &&
                      filteredThreads.length === 0 && (
                        <div className="thread-placeholder">No agents match the filters.</div>
                      )}
                    {(expandedWorkspaces.has(entry.id)
                      ? filteredThreads
                      : filteredThreads.slice(0, 3)
                    ).map((thread) => (
                      <div
                        key={thread.id}
                        className={`thread-row ${
                          entry.id === activeWorkspaceId &&
                          thread.id === activeThreadId
                            ? "active"
                            : ""
                        }`}
                        onClick={() => onSelectThread(entry.id, thread.id)}
                        onContextMenu={(event) =>
                          showThreadMenu(event, thread, entry.id, thread.id)
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectThread(entry.id, thread.id);
                          }
                        }}
                      >
                        <span
                          className={`thread-status ${
                            threadStatusById[thread.id]?.isReviewing
                              ? "reviewing"
                              : threadStatusById[thread.id]?.isProcessing
                                ? "processing"
                                : threadStatusById[thread.id]?.hasUnread
                                  ? "unread"
                                  : "ready"
                          }`}
                          aria-hidden
                        />
                        {thread.isPinned && (
                          <span className="thread-pin" aria-label="Pinned thread">
                            ★
                          </span>
                        )}
                        <span className="thread-name">{thread.name}</span>
                        <div className="thread-menu">
                          <button
                            className="thread-menu-trigger"
                            aria-label="Thread menu"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) =>
                              showThreadMenu(event, thread, entry.id, thread.id)
                            }
                          >
                            ...
                          </button>
                        </div>
                      </div>
                    ))}
                    {filteredThreads.length > 3 && (
                      <button
                        className="thread-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedWorkspaces((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.id)) {
                              next.delete(entry.id);
                            } else {
                              next.add(entry.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {expandedWorkspaces.has(entry.id)
                          ? "Show less"
                          : `${filteredThreads.length - 3} more...`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!workspaces.length && (
            <div className="empty">Add a workspace to start.</div>
          )}
        </div>
      </div>
      <div className="sidebar-footer">
        <div className="usage-stack">
          <span className="usage-row">{primaryUsageLabel}</span>
          {accountRateLimits?.secondary && (
            <span className="usage-row">{secondaryUsageLabel}</span>
          )}
        </div>
        {creditsLabel && <div className="usage-meta">{creditsLabel}</div>}
      </div>
      <div
        className="sidebar-resize-handle"
        onMouseDown={startSidebarResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize sidebar"
      />
    </aside>
  );
}
