import { useState, type ReactNode } from "react";
import type {
  ApprovalRequest,
  ConversationItem,
  DebugEntry,
  RateLimitSnapshot,
  ThreadSummary,
  WorkspaceInfo,
} from "../types";
import { Approvals } from "./Approvals";
import { formatRedactedPayload } from "../utils/redact";

type ThreadStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
};

type ActivityPanelProps = {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: Record<string, ThreadStatus>;
  approvals: ApprovalRequest[];
  rateLimits: RateLimitSnapshot | null;
  activeItems: ConversationItem[];
  debugEntries: DebugEntry[];
  onApprovalDecision: (
    request: ApprovalRequest,
    decision: "accept" | "decline",
  ) => void;
};

type PanelTab = "activity" | "approvals" | "changes" | "health";

export function ActivityPanel({
  workspaces,
  activeWorkspaceId,
  activeThreadId,
  threadsByWorkspace,
  threadStatusById,
  approvals,
  rateLimits,
  activeItems,
  debugEntries,
  onApprovalDecision,
}: ActivityPanelProps) {
  const [tab, setTab] = useState<PanelTab>("activity");
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeThreads = activeWorkspaceId
    ? threadsByWorkspace[activeWorkspaceId] ?? []
    : [];
  const activeThread =
    activeThreads.find((thread) => thread.id === activeThreadId) ?? null;
  const runningThreads = activeThreads.filter(
    (thread) => threadStatusById[thread.id]?.isProcessing,
  );
  const unreadThreads = activeThreads.filter(
    (thread) => threadStatusById[thread.id]?.hasUnread,
  );
  const reviewThreads = activeThreads.filter(
    (thread) => threadStatusById[thread.id]?.isReviewing,
  );
  const activeWorkspaceApprovals = approvals.filter(
    (approval) => approval.workspace_id === activeWorkspaceId,
  );
  const fileChanges = activeItems
    .filter((item): item is Extract<ConversationItem, { kind: "tool" }> =>
      item.kind === "tool" && item.toolType === "fileChange",
    )
    .flatMap((item) =>
      (item.changes ?? []).map((change) => ({
        ...change,
        itemId: item.id,
      })),
    )
    .slice(-8)
    .reverse();
  const diagnosticEntries = debugEntries
    .filter((entry) => entry.source === "error" || entry.source === "stderr")
    .slice(-5)
    .reverse();

  return (
    <aside className="activity-panel" aria-label="Workspace activity">
      <div className="activity-tabs" role="tablist" aria-label="Activity panel">
        <PanelTabButton current={tab} value="activity" onSelect={setTab}>
          Activity
        </PanelTabButton>
        <PanelTabButton current={tab} value="approvals" onSelect={setTab}>
          Approvals
          {activeWorkspaceApprovals.length > 0 && (
            <span className="activity-count">{activeWorkspaceApprovals.length}</span>
          )}
        </PanelTabButton>
        <PanelTabButton current={tab} value="changes" onSelect={setTab}>
          Changes
          {fileChanges.length > 0 && (
            <span className="activity-count">{fileChanges.length}</span>
          )}
        </PanelTabButton>
        <PanelTabButton current={tab} value="health" onSelect={setTab}>
          Health
          {diagnosticEntries.length > 0 && (
            <span className="activity-count">{diagnosticEntries.length}</span>
          )}
        </PanelTabButton>
      </div>

      {tab === "activity" && (
        <div className="activity-section">
          <div className="activity-card">
            <div className="activity-card-label">Workspace</div>
            <div className="activity-card-title">
              {activeWorkspace?.name ?? "No workspace"}
            </div>
            <div className="activity-card-meta">
              {activeWorkspace?.connected ? "Connected" : "Disconnected"}
            </div>
          </div>
          <div className="activity-grid">
            <Metric label="Threads" value={activeThreads.length} />
            <Metric label="Running" value={runningThreads.length} />
            <Metric label="Unread" value={unreadThreads.length} />
            <Metric label="Reviews" value={reviewThreads.length} />
          </div>
          <div className="activity-card">
            <div className="activity-card-label">Active thread</div>
            <div className="activity-card-title">
              {activeThread?.name ?? "No active thread"}
            </div>
            <div className="activity-card-meta">
              {activeThreadId ? formatThreadState(threadStatusById[activeThreadId]) : "Idle"}
            </div>
          </div>
          <div className="activity-card">
            <div className="activity-card-label">Usage</div>
            <div className="activity-usage-row">
              <span>Session</span>
              <strong>{formatPercent(rateLimits?.primary?.usedPercent)}</strong>
            </div>
            <div className="activity-usage-row">
              <span>Global</span>
              <strong>{formatPercent(rateLimits?.secondary?.usedPercent)}</strong>
            </div>
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <Approvals
          approvals={activeWorkspaceApprovals}
          onDecision={onApprovalDecision}
          emptyMessage="No approvals for this workspace."
        />
      )}

      {tab === "changes" && (
        <div className="activity-section">
          {fileChanges.length === 0 && (
            <div className="activity-empty">No file changes in this thread yet.</div>
          )}
          {fileChanges.map((change, index) => (
            <div key={`${change.itemId}-${change.path}-${index}`} className="activity-change">
              <span className="activity-change-kind">
                {(change.kind ?? "change").toUpperCase()}
              </span>
              <span className="activity-change-path">{change.path}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "health" && (
        <div className="activity-section">
          <div className="activity-card">
            <div className="activity-card-label">Session</div>
            <div className="activity-card-title">
              {activeWorkspace?.connected ? "App-server connected" : "App-server disconnected"}
            </div>
            <div className="activity-card-meta">
              {activeWorkspace?.connected
                ? "Workspace events are live."
                : "Reconnect from the workspace menu or Linux Settings."}
            </div>
          </div>
          {diagnosticEntries.length === 0 && (
            <div className="activity-empty">No recent stderr or error events.</div>
          )}
          {diagnosticEntries.map((entry) => (
            <div key={entry.id} className="activity-diagnostic">
              <div className="activity-diagnostic-meta">
                <span className={`activity-diagnostic-source ${entry.source}`}>
                  {entry.source}
                </span>
                <span>{entry.label}</span>
              </div>
              <pre>{formatDiagnosticPayload(entry.payload)}</pre>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function PanelTabButton({
  children,
  current,
  value,
  onSelect,
}: {
  children: ReactNode;
  current: PanelTab;
  value: PanelTab;
  onSelect: (value: PanelTab) => void;
}) {
  return (
    <button
      className={`activity-tab ${current === value ? "active" : ""}`}
      onClick={() => onSelect(value)}
      role="tab"
      aria-selected={current === value}
      type="button"
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="activity-metric">
      <div className="activity-metric-value">{value}</div>
      <div className="activity-metric-label">{label}</div>
    </div>
  );
}

function formatPercent(value: number | undefined) {
  if (typeof value !== "number") {
    return "--";
  }
  return `${Math.min(Math.max(Math.round(value), 0), 100)}%`;
}

function formatThreadState(status: ThreadStatus | undefined) {
  if (!status) {
    return "Idle";
  }
  if (status.isReviewing) {
    return "Reviewing";
  }
  if (status.isProcessing) {
    return "Running";
  }
  if (status.hasUnread) {
    return "Unread";
  }
  return "Idle";
}

function formatDiagnosticPayload(payload: unknown) {
  return formatRedactedPayload(payload);
}
