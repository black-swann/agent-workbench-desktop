import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from "react";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approvals.css";
import "./styles/composer.css";
import "./styles/diff-viewer.css";
import "./styles/activity-panel.css";
import "./styles/debug.css";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { MainHeader } from "./components/MainHeader";
import { Messages } from "./components/Messages";
import { ActivityPanel } from "./components/ActivityPanel";
import { Composer } from "./components/Composer";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { useThreads } from "./hooks/useThreads";
import { useModels } from "./hooks/useModels";
import { useSkills } from "./hooks/useSkills";
import { useDebugLog } from "./hooks/useDebugLog";
import { useWorkspaceRefreshOnFocus } from "./hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "./hooks/useWorkspaceRestore";
import type { AccessMode, QueuedMessage } from "./types";
import {
  applyThreadPresentation,
  normalizeThreadOverride,
  resolveRestoredWorkspaceId,
  type ThreadOverrideSettings,
  type ThreadPresentationState,
} from "./utils/threadState";

type UiAlert = {
  id: string;
  title: string;
  detail: string;
  tone: "error" | "warning" | "info";
};

type ThreadCheckpoint = {
  itemId: string;
  label: string;
};

const LAST_ACTIVE_WORKSPACE_KEY = "agent-workbench:last-active-workspace";
const LAST_ACTIVE_THREADS_KEY = "agent-workbench:last-active-threads";
const THREAD_OVERRIDES_KEY = "agent-workbench:thread-overrides";
const THREAD_PRESENTATION_KEY = "agent-workbench:thread-presentation";
const THREAD_CHECKPOINTS_KEY = "agent-workbench:thread-checkpoints";
const SIDEBAR_WIDTH_KEY = "agent-workbench:sidebar-width";
const DEBUG_LOGGING_KEY = "agent-workbench:debug-logging-enabled";
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_SIDEBAR_WIDTH = 280;

function readStorageValue<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorageValue<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence failures and keep the UI usable.
  }
}

const DebugPanel = lazy(async () => {
  const module = await import("./components/DebugPanel");
  return { default: module.DebugPanel };
});

function App() {
  const [accessMode, setAccessMode] = useState<AccessMode>("current");
  const [queuedByThread, setQueuedByThread] = useState<
    Record<string, QueuedMessage[]>
  >({});
  const [prefillDraft, setPrefillDraft] = useState<QueuedMessage | null>(null);
  const [flushingByThread, setFlushingByThread] = useState<Record<string, boolean>>(
    {},
  );
  const [alerts, setAlerts] = useState<UiAlert[]>([]);
  const [threadOverridesById, setThreadOverridesById] = useState<
    Record<string, ThreadOverrideSettings>
  >(() => readStorageValue<Record<string, ThreadOverrideSettings>>(THREAD_OVERRIDES_KEY, {}));
  const [threadPresentationById, setThreadPresentationById] = useState<
    Record<string, ThreadPresentationState>
  >(() => readStorageValue<Record<string, ThreadPresentationState>>(THREAD_PRESENTATION_KEY, {}));
  const [threadCheckpointsById, setThreadCheckpointsById] = useState<
    Record<string, ThreadCheckpoint[]>
  >(() => readStorageValue<Record<string, ThreadCheckpoint[]>>(THREAD_CHECKPOINTS_KEY, {}));
  const [debugLoggingEnabled, setDebugLoggingEnabled] = useState<boolean>(() =>
    readStorageValue<boolean>(DEBUG_LOGGING_KEY, true),
  );
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const raw = readStorageValue<number>(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH);
    if (typeof raw !== "number" || Number.isNaN(raw)) {
      return DEFAULT_SIDEBAR_WIDTH;
    }
    return Math.min(Math.max(Math.round(raw), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
  });
  const [pendingThreadOverridesByWorkspace, setPendingThreadOverridesByWorkspace] =
    useState<Record<string, Partial<ThreadOverrideSettings>>>({});
  const composerElementRef = useRef<HTMLTextAreaElement | null>(null);
  const restoredWorkspaceIdRef = useRef<string | null>(
    (() => {
      try {
        return window.localStorage.getItem(LAST_ACTIVE_WORKSPACE_KEY);
      } catch {
        return null;
      }
    })(),
  );
  const restoredThreadsByWorkspaceRef = useRef<Record<string, string | null>>(
    readStorageValue<Record<string, string | null>>(LAST_ACTIVE_THREADS_KEY, {}),
  );
  const hasRestoredWorkspaceRef = useRef(false);
  const restoredThreadWorkspacesRef = useRef(new Set<string>());
  const {
    debugOpen,
    setDebugOpen,
    debugEntries,
    hasDebugAlerts,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  } = useDebugLog({ enabled: debugLoggingEnabled });

  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    connectWorkspace,
    markWorkspaceConnected,
    markWorkspaceDisconnected,
    updateWorkspaceSettings,
    updateWorkspaceCodexBin,
    removeWorkspace,
    hasLoaded,
    refreshWorkspaces,
  } = useWorkspaces({ onDebug: addDebugEntry });

  const {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
    workspaceDefaultModel,
    workspaceDefaultEffort,
  } = useModels({ activeWorkspace, onDebug: addDebugEntry });
  const { skills } = useSkills({ activeWorkspace, onDebug: addDebugEntry });

  const resolvedModel = selectedModel?.model ?? null;

  const {
    setActiveThreadId,
    activeThreadId,
    activeItems,
    approvals,
    threadsByWorkspace,
    isListingByWorkspace,
    isResumingByThread,
    threadStatusById,
    activeTurnIdByThread,
    tokenUsageByThread,
    rateLimitsByWorkspace,
    interruptTurn,
    removeThread,
    startThreadForWorkspace,
    listThreadsForWorkspace,
    sendUserMessage,
    startReview,
    handleApprovalDecision,
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onWorkspaceDisconnected: (workspaceId, reason) => {
      markWorkspaceDisconnected(workspaceId);
      pushAlert("warning", "Workspace disconnected", reason);
    },
    onDebug: addDebugEntry,
    onError: (title, detail) => {
      pushAlert("error", title, detail);
    },
    model: resolvedModel,
    effort: selectedEffort,
    accessMode,
  });

  const activeRateLimits = activeWorkspaceId
    ? rateLimitsByWorkspace[activeWorkspaceId] ?? null
    : null;
  const activeTokenUsage = activeThreadId
    ? tokenUsageByThread[activeThreadId] ?? null
    : null;
  const canInterrupt = activeThreadId
    ? Boolean(
        threadStatusById[activeThreadId]?.isProcessing &&
          activeTurnIdByThread[activeThreadId],
      )
    : false;
  const isProcessing = activeThreadId
    ? threadStatusById[activeThreadId]?.isProcessing ?? false
    : false;
  const isReviewing = activeThreadId
    ? threadStatusById[activeThreadId]?.isReviewing ?? false
    : false;
  const activeQueue = activeThreadId
    ? queuedByThread[activeThreadId] ?? []
    : [];
  const activeIsResuming = activeThreadId
    ? isResumingByThread[activeThreadId] ?? false
    : false;
  const visibleThreadsByWorkspace = Object.fromEntries(
    Object.entries(threadsByWorkspace).map(([workspaceId, threads]) => [
      workspaceId,
      applyThreadPresentation(threads, threadPresentationById),
    ]),
  ) as typeof threadsByWorkspace;
  const defaultModelLabel = (() => {
    return (
      workspaceDefaultModel?.displayName ||
      workspaceDefaultModel?.model ||
      "Workspace default"
    );
  })();
  const currentModelLabel =
    selectedModel?.displayName || selectedModel?.model || "No model";
  const defaultEffortLabel = workspaceDefaultEffort ?? "Model default";
  const currentEffortLabel = selectedEffort ?? "Model default";
  const defaultAccessLabel = activeWorkspace?.settings.defaultAccessMode ?? "current";
  const activeThreadOverride = activeThreadId
    ? threadOverridesById[activeThreadId] ?? null
    : null;
  const currentSelectionStatus = activeWorkspace
    ? {
        model: {
          isOverride:
            (selectedModel?.model ?? null) !== (workspaceDefaultModel?.model ?? null),
          currentLabel: currentModelLabel,
          defaultLabel: defaultModelLabel,
        },
        effort: {
          isOverride:
            (selectedEffort ?? null) !== (workspaceDefaultEffort ?? null),
          currentLabel: currentEffortLabel,
          defaultLabel: defaultEffortLabel,
        },
        access: {
          isOverride: accessMode !== activeWorkspace.settings.defaultAccessMode,
          currentLabel: accessMode,
          defaultLabel: defaultAccessLabel,
        },
      }
    : null;

  function pushAlert(
    tone: UiAlert["tone"],
    title: string,
    detail: string,
  ) {
    const next: UiAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tone,
      title,
      detail,
    };
    setAlerts((prev) => [...prev, next].slice(-4));
  }

  function dismissAlert(id: string) {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }

  function focusComposer() {
    const element = composerElementRef.current;
    if (!element) {
      return;
    }
    element.focus();
    const length = element.value.length;
    element.setSelectionRange(length, length);
  }

  function cycleWorkspace(direction: 1 | -1) {
    if (workspaces.length === 0) {
      return;
    }
    const currentIndex = activeWorkspaceId
      ? workspaces.findIndex((workspace) => workspace.id === activeWorkspaceId)
      : -1;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + direction + workspaces.length) % workspaces.length;
    selectWorkspace(workspaces[nextIndex].id);
  }

  useEffect(() => {
    if (hasLoaded && !hasRestoredWorkspaceRef.current) {
      hasRestoredWorkspaceRef.current = true;
      const nextWorkspaceId = resolveRestoredWorkspaceId(
        workspaces.map((workspace) => workspace.id),
        restoredWorkspaceIdRef.current,
      );
      if (nextWorkspaceId) {
        setActiveWorkspaceId(nextWorkspaceId);
      }
    }
  }, [hasLoaded, setActiveWorkspaceId, workspaces]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    try {
      window.localStorage.setItem(LAST_ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
    } catch {
      // Ignore persistence failures.
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    writeStorageValue(THREAD_OVERRIDES_KEY, threadOverridesById);
  }, [threadOverridesById]);

  useEffect(() => {
    writeStorageValue(THREAD_PRESENTATION_KEY, threadPresentationById);
  }, [threadPresentationById]);

  useEffect(() => {
    writeStorageValue(THREAD_CHECKPOINTS_KEY, threadCheckpointsById);
  }, [threadCheckpointsById]);

  useEffect(() => {
    writeStorageValue(SIDEBAR_WIDTH_KEY, sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    writeStorageValue(DEBUG_LOGGING_KEY, debugLoggingEnabled);
    if (!debugLoggingEnabled) {
      clearDebugEntries();
    }
  }, [clearDebugEntries, debugLoggingEnabled]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    const next = {
      ...restoredThreadsByWorkspaceRef.current,
      [activeWorkspaceId]: activeThreadId ?? null,
    };
    restoredThreadsByWorkspaceRef.current = next;
    writeStorageValue(LAST_ACTIVE_THREADS_KEY, next);
  }, [activeThreadId, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }
    const targetAccess =
      activeThreadOverride?.accessMode ??
      activeWorkspace.settings.defaultAccessMode ??
      "current";
    if (accessMode !== targetAccess) {
      setAccessMode(targetAccess);
    }
  }, [accessMode, activeThreadOverride?.accessMode, activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace || models.length === 0) {
      return;
    }
    const targetModelKey =
      activeThreadOverride?.model ?? workspaceDefaultModel?.model ?? null;
    const targetModel =
      models.find(
        (model) => model.model === targetModelKey || model.id === targetModelKey,
      ) ?? workspaceDefaultModel;
    if (targetModel && selectedModelId !== targetModel.id) {
      setSelectedModelId(targetModel.id);
    }
  }, [
    activeThreadOverride?.model,
    activeWorkspace,
    models,
    selectedModelId,
    setSelectedModelId,
    workspaceDefaultModel,
  ]);

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }
    const targetEffort = activeThreadOverride?.effort ?? workspaceDefaultEffort ?? null;
    if (selectedEffort !== targetEffort) {
      setSelectedEffort(targetEffort);
    }
  }, [
    activeThreadOverride?.effort,
    activeWorkspace,
    selectedEffort,
    setSelectedEffort,
    workspaceDefaultEffort,
  ]);

  useEffect(() => {
    if (
      !activeWorkspaceId ||
      !activeWorkspace?.connected ||
      restoredThreadWorkspacesRef.current.has(activeWorkspaceId)
    ) {
      return;
    }
    if (isListingByWorkspace[activeWorkspaceId]) {
      return;
    }
    const restoredThreadId = restoredThreadsByWorkspaceRef.current[activeWorkspaceId];
    const threads = threadsByWorkspace[activeWorkspaceId] ?? [];
    restoredThreadWorkspacesRef.current.add(activeWorkspaceId);
    if (
      restoredThreadId &&
      threads.some((thread) => thread.id === restoredThreadId) &&
      activeThreadId !== restoredThreadId
    ) {
      setActiveThreadId(restoredThreadId, activeWorkspaceId);
    }
  }, [
    activeThreadId,
    activeWorkspace?.connected,
    activeWorkspaceId,
    isListingByWorkspace,
    setActiveThreadId,
    threadsByWorkspace,
  ]);

  useEffect(() => {
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    const pending = pendingThreadOverridesByWorkspace[activeWorkspaceId];
    if (!pending) {
      return;
    }
    const existing = threadOverridesById[activeThreadId] ?? null;
    updateThreadOverride(activeThreadId, {
      model: pending.model ?? existing?.model ?? workspaceDefaultModel?.model ?? null,
      effort: pending.effort ?? existing?.effort ?? workspaceDefaultEffort ?? null,
      accessMode:
        pending.accessMode ??
        existing?.accessMode ??
        activeWorkspace?.settings.defaultAccessMode ??
        "current",
    });
    setPendingThreadOverridesByWorkspace((prev) => {
      const next = { ...prev };
      delete next[activeWorkspaceId];
      return next;
    });
  }, [
    activeThreadId,
    activeWorkspace?.settings.defaultAccessMode,
    activeWorkspaceId,
    pendingThreadOverridesByWorkspace,
    threadOverridesById,
    workspaceDefaultEffort,
    workspaceDefaultModel?.model,
  ]);

  useWorkspaceRestore({
    workspaces,
    hasLoaded,
    connectWorkspace,
    listThreadsForWorkspace,
  });
  useWorkspaceRefreshOnFocus({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspace,
  });

  async function handleAddWorkspace() {
    try {
      const workspace = await addWorkspace();
      if (workspace) {
        setActiveThreadId(null, workspace.id);
        pushAlert("info", "Workspace added", `${workspace.name} is ready to use.`);
      }
    } catch (error) {
      pushAlert(
        "error",
        "Workspace add failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function ensureWorkspaceExpanded(workspaceId: string) {
    const target = workspaces.find((entry) => entry.id === workspaceId);
    if (!target?.settings.sidebarCollapsed) {
      return;
    }
    void updateWorkspaceSettings(workspaceId, {
      ...target.settings,
      sidebarCollapsed: false,
    });
  }

  function selectWorkspace(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);
  }

  function setClampedSidebarWidth(nextWidth: number) {
    setSidebarWidth(
      Math.min(Math.max(Math.round(nextWidth), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH),
    );
  }

  function updateThreadOverride(
    threadId: string,
    nextEffective: ThreadOverrideSettings,
  ) {
    const normalized = normalizeThreadOverride(
      {
        model: workspaceDefaultModel?.model ?? null,
        effort: workspaceDefaultEffort ?? null,
        accessMode: activeWorkspace?.settings.defaultAccessMode ?? "current",
      },
      nextEffective,
    );
    setThreadOverridesById((prev) => {
      const next = { ...prev };
      if (normalized == null) {
        delete next[threadId];
      } else {
        next[threadId] = normalized;
      }
      return next;
    });
  }

  function queuePendingThreadOverride(
    workspaceId: string,
    partial: Partial<ThreadOverrideSettings>,
  ) {
    setPendingThreadOverridesByWorkspace((prev) => ({
      ...prev,
      [workspaceId]: {
        ...prev[workspaceId],
        ...partial,
      },
    }));
  }

  async function handleAddAgent(workspace: (typeof workspaces)[number]) {
    selectWorkspace(workspace.id);
    ensureWorkspaceExpanded(workspace.id);
    try {
      if (!workspace.connected) {
        await connectWorkspace(workspace);
      }
      await startThreadForWorkspace(workspace.id);
      pushAlert("info", "Agent created", `Started a new agent in ${workspace.name}.`);
    } catch (error) {
      pushAlert(
        "error",
        "Agent start failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function handleRefreshWorkspace(workspace: (typeof workspaces)[number]) {
    selectWorkspace(workspace.id);
    try {
      if (!workspace.connected) {
        await connectWorkspace(workspace);
      }
      await listThreadsForWorkspace(workspace);
      pushAlert("info", "Workspace refreshed", `Reloaded threads for ${workspace.name}.`);
    } catch (error) {
      pushAlert(
        "error",
        "Workspace refresh failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function handleConnectWorkspace(workspace: (typeof workspaces)[number]) {
    try {
      await connectWorkspace(workspace);
      pushAlert("info", "Workspace connected", `${workspace.name} reconnected successfully.`);
    } catch (error) {
      pushAlert(
        "error",
        "Workspace connect failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function handleRemoveWorkspace(workspace: (typeof workspaces)[number]) {
    try {
      await removeWorkspace(workspace.id);
      pushAlert("info", "Workspace removed", `${workspace.name} was removed from the sidebar.`);
    } catch (error) {
      pushAlert(
        "error",
        "Workspace remove failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleRenameThread(workspaceId: string, threadId: string) {
    const thread =
      visibleThreadsByWorkspace[workspaceId]?.find((entry) => entry.id === threadId) ?? null;
    const nextName = window.prompt("Rename agent thread", thread?.name ?? "");
    if (nextName === null) {
      return;
    }
    const trimmed = nextName.trim();
    setThreadPresentationById((prev) => ({
      ...prev,
      [threadId]: {
        ...prev[threadId],
        customName: trimmed || null,
      },
    }));
    pushAlert(
      "info",
      "Thread renamed",
      trimmed ? `Thread is now named "${trimmed}".` : "Thread name reset to automatic preview.",
    );
  }

  function handleTogglePinThread(threadId: string) {
    const nextPinned = !threadPresentationById[threadId]?.pinned;
    setThreadPresentationById((prev) => ({
      ...prev,
      [threadId]: {
        ...prev[threadId],
        pinned: nextPinned,
      },
    }));
    pushAlert(
      "info",
      nextPinned ? "Thread pinned" : "Thread unpinned",
      nextPinned
        ? "Pinned threads stay at the top of the workspace list."
        : "Thread returned to normal sorting.",
    );
  }

  function toggleCheckpoint(threadId: string, itemId: string, label: string) {
    setThreadCheckpointsById((prev) => {
      const existing = prev[threadId] ?? [];
      const hasCheckpoint = existing.some((checkpoint) => checkpoint.itemId === itemId);
      const next = hasCheckpoint
        ? existing.filter((checkpoint) => checkpoint.itemId !== itemId)
        : [...existing, { itemId, label }];
      return {
        ...prev,
        [threadId]: next,
      };
    });
    const hasCheckpoint = (threadCheckpointsById[threadId] ?? []).some(
      (checkpoint) => checkpoint.itemId === itemId,
    );
    pushAlert(
      "info",
      hasCheckpoint ? "Checkpoint removed" : "Checkpoint saved",
      hasCheckpoint
        ? "Removed the saved jump point from this thread."
        : `Saved "${label}" as a quick jump point.`,
    );
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (activeThreadId && threadStatusById[activeThreadId]?.isReviewing) {
      return;
    }
    if (isProcessing && activeThreadId) {
      const item: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        createdAt: Date.now(),
      };
      setQueuedByThread((prev) => ({
        ...prev,
        [activeThreadId]: [...(prev[activeThreadId] ?? []), item],
      }));
      return;
    }
    if (activeWorkspace && !activeWorkspace.connected) {
      try {
        await connectWorkspace(activeWorkspace);
      } catch (error) {
        pushAlert(
          "error",
          "Reconnect failed",
          error instanceof Error ? error.message : String(error),
        );
        return;
      }
    }
    if (trimmed.startsWith("/review")) {
      await startReview(trimmed);
      return;
    }
    await sendUserMessage(trimmed);
  }

  function handleSelectModel(modelId: string) {
    setSelectedModelId(modelId);
    const selected = models.find((model) => model.id === modelId) ?? null;
    const nextModel = selected?.model ?? null;
    if (activeThreadId) {
      updateThreadOverride(activeThreadId, {
        model: nextModel,
        effort: activeThreadOverride?.effort ?? workspaceDefaultEffort ?? null,
        accessMode:
          activeThreadOverride?.accessMode ??
          activeWorkspace?.settings.defaultAccessMode ??
          "current",
      });
      return;
    }
    if (activeWorkspaceId) {
      queuePendingThreadOverride(activeWorkspaceId, { model: nextModel });
    }
  }

  function handleSelectEffort(effort: string | null) {
    setSelectedEffort(effort);
    if (activeThreadId) {
      updateThreadOverride(activeThreadId, {
        model: activeThreadOverride?.model ?? workspaceDefaultModel?.model ?? null,
        effort,
        accessMode:
          activeThreadOverride?.accessMode ??
          activeWorkspace?.settings.defaultAccessMode ??
          "current",
      });
      return;
    }
    if (activeWorkspaceId) {
      queuePendingThreadOverride(activeWorkspaceId, { effort });
    }
  }

  function handleSelectAccessMode(mode: AccessMode) {
    if (mode === "full-access" && accessMode !== "full-access") {
      pushAlert(
        "warning",
        "Full access selected",
        "Agents can read and write outside this workspace. Approval prompts remain enabled before privileged actions run.",
      );
    }
    setAccessMode(mode);
    if (activeThreadId) {
      updateThreadOverride(activeThreadId, {
        model: activeThreadOverride?.model ?? workspaceDefaultModel?.model ?? null,
        effort: activeThreadOverride?.effort ?? workspaceDefaultEffort ?? null,
        accessMode: mode,
      });
      return;
    }
    if (activeWorkspaceId) {
      queuePendingThreadOverride(activeWorkspaceId, { accessMode: mode });
    }
  }

  function toggleDebugLogging() {
    setDebugLoggingEnabled((prev) => !prev);
  }

  useEffect(() => {
    if (!activeThreadId || isProcessing || isReviewing) {
      return;
    }
    if (flushingByThread[activeThreadId]) {
      return;
    }
    const queue = queuedByThread[activeThreadId] ?? [];
    if (queue.length === 0) {
      return;
    }
    const threadId = activeThreadId;
    const nextItem = queue[0];
    setFlushingByThread((prev) => ({ ...prev, [threadId]: true }));
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));
    (async () => {
      try {
        if (nextItem.text.trim().startsWith("/review")) {
          await startReview(nextItem.text);
        } else {
          await sendUserMessage(nextItem.text);
        }
      } catch {
        setQueuedByThread((prev) => ({
          ...prev,
          [threadId]: [nextItem, ...(prev[threadId] ?? [])],
        }));
      } finally {
        setFlushingByThread((prev) => ({ ...prev, [threadId]: false }));
      }
    })();
  }, [
    activeThreadId,
    flushingByThread,
    isProcessing,
    isReviewing,
    queuedByThread,
    sendUserMessage,
  ]);

  useEffect(() => {
    function shouldIgnoreForShortcuts(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const ignoreForTyping = shouldIgnoreForShortcuts(event.target);

      if (isMod && key === "k") {
        event.preventDefault();
        focusComposer();
        return;
      }

      if (isMod && key === "n" && activeWorkspace) {
        event.preventDefault();
        void handleAddAgent(activeWorkspace);
        return;
      }

      if (isMod && key === "." && canInterrupt) {
        event.preventDefault();
        void interruptTurn();
        return;
      }

      if (isMod && event.shiftKey && key === "d") {
        event.preventDefault();
        setDebugOpen((prev) => !prev);
        return;
      }

      if (ignoreForTyping) {
        return;
      }

      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        cycleWorkspace(-1);
        return;
      }

      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        cycleWorkspace(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeWorkspace,
    handleAddAgent,
    canInterrupt,
    interruptTurn,
    setDebugOpen,
    workspaces,
    activeWorkspaceId,
  ]);

  return (
    <div
      className="app"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <Sidebar
        width={sidebarWidth}
        workspaces={workspaces}
        threadsByWorkspace={visibleThreadsByWorkspace}
        isListingByWorkspace={isListingByWorkspace}
        threadStatusById={threadStatusById}
        activeWorkspaceId={activeWorkspaceId}
        activeThreadId={activeThreadId}
        accountRateLimits={activeRateLimits}
        approvals={approvals}
        onAddWorkspace={handleAddWorkspace}
        onSelectWorkspace={(workspaceId) => {
          selectWorkspace(workspaceId);
        }}
        onConnectWorkspace={handleConnectWorkspace}
        onAddAgent={handleAddAgent}
        onRefreshWorkspace={handleRefreshWorkspace}
        onRemoveWorkspace={(workspace) => {
          void handleRemoveWorkspace(workspace);
        }}
        onToggleWorkspaceCollapse={(workspaceId, collapsed) => {
          const target = workspaces.find((entry) => entry.id === workspaceId);
          if (!target) {
            return;
          }
          void updateWorkspaceSettings(workspaceId, {
            ...target.settings,
            sidebarCollapsed: collapsed,
          });
        }}
        onSelectThread={(workspaceId, threadId) => {
          selectWorkspace(workspaceId);
          setActiveThreadId(threadId, workspaceId);
        }}
        onDeleteThread={(workspaceId, threadId) => {
          removeThread(workspaceId, threadId);
        }}
        onRenameThread={handleRenameThread}
        onTogglePinThread={handleTogglePinThread}
        onResizeSidebar={setClampedSidebarWidth}
      />

      <section className="main">
        {alerts.length > 0 && (
          <div className="app-alerts" aria-live="polite">
            {alerts.map((alert) => (
              <div key={alert.id} className={`app-alert ${alert.tone}`}>
                <div className="app-alert-copy">
                  <div className="app-alert-title">{alert.title}</div>
                  <div className="app-alert-detail">{alert.detail}</div>
                </div>
                <button
                  className="ghost app-alert-dismiss"
                  onClick={() => dismissAlert(alert.id)}
                  aria-label="Dismiss alert"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
        {!activeWorkspace && (
          <Home
            onOpenProject={handleAddWorkspace}
            onAddWorkspace={handleAddWorkspace}
          />
        )}

        {activeWorkspace && (
          <>
            <div className="main-topbar">
              <div className="main-topbar-left">
                <MainHeader
                  workspace={activeWorkspace}
                  models={models}
                  reasoningOptions={reasoningOptions}
                  selectedModelId={selectedModelId}
                  selectedEffort={selectedEffort}
                  accessMode={accessMode}
                  onSelectModel={handleSelectModel}
                  onSelectEffort={handleSelectEffort}
                  onSelectAccessMode={handleSelectAccessMode}
                  onUpdateWorkspaceSettings={updateWorkspaceSettings}
                  onUpdateWorkspaceCodexBin={updateWorkspaceCodexBin}
                  onReconnectWorkspace={handleConnectWorkspace}
                  onStartReviewPreset={async (instructions) => {
                    await startReview(`/review ${instructions}`);
                    pushAlert("info", "Review started", instructions);
                  }}
                />
              </div>
              <div className="actions">
                <button
                  className={`ghost icon-button debug-button ${
                    hasDebugAlerts ? "has-alerts" : ""
                  } ${debugLoggingEnabled ? "" : "is-paused"}`}
                  onClick={() => setDebugOpen((prev) => !prev)}
                  aria-label={debugLoggingEnabled ? "Debug" : "Debug logging paused"}
                  title={
                    debugLoggingEnabled
                      ? "Open debug diagnostics"
                      : "Debug logging is paused"
                  }
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M9 7.5V6.5a3 3 0 0 1 6 0v1"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <rect
                      x="7"
                      y="7.5"
                      width="10"
                      height="9"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M4 12h3m10 0h3M6 8l2 2m8-2-2 2M6 16l2-2m8 2-2-2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <circle cx="10" cy="12" r="0.8" fill="currentColor" />
                    <circle cx="14" cy="12" r="0.8" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="content">
              <Messages
                items={activeItems}
                isLoading={activeIsResuming}
                workspacePath={activeWorkspace.path}
                checkpoints={
                  activeThreadId ? threadCheckpointsById[activeThreadId] ?? [] : []
                }
                onToggleCheckpoint={(itemId, label) => {
                  if (!activeThreadId) {
                    return;
                  }
                  toggleCheckpoint(activeThreadId, itemId, label);
                }}
                isThinking={
                  activeThreadId
                    ? threadStatusById[activeThreadId]?.isProcessing ?? false
                    : false
                }
                statusMessage={
                  !activeWorkspace.connected
                    ? "This workspace is disconnected. Reconnect to load threads and continue."
                    : activeIsResuming
                      ? "Loading thread history..."
                      : null
                }
              />
            </div>

            <div className="right-panel">
              <ActivityPanel
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                activeThreadId={activeThreadId}
                threadsByWorkspace={visibleThreadsByWorkspace}
                threadStatusById={threadStatusById}
                approvals={approvals}
                rateLimits={activeRateLimits}
                activeItems={activeItems}
                debugEntries={debugEntries}
                onApprovalDecision={handleApprovalDecision}
              />
            </div>

            <Composer
              onSend={handleSend}
              onStop={interruptTurn}
              canStop={canInterrupt}
              disabled={
                activeThreadId
                  ? threadStatusById[activeThreadId]?.isReviewing ?? false
                  : false
              }
              contextUsage={activeTokenUsage}
              queuedMessages={activeQueue}
              sendLabel={isProcessing ? "Queue" : "Send"}
              prefillDraft={prefillDraft}
              onPrefillHandled={(id) => {
                if (prefillDraft?.id === id) {
                  setPrefillDraft(null);
                }
              }}
              onEditQueued={(item) => {
                if (!activeThreadId) {
                  return;
                }
                setQueuedByThread((prev) => ({
                  ...prev,
                  [activeThreadId]: (prev[activeThreadId] ?? []).filter(
                    (entry) => entry.id !== item.id,
                  ),
                }));
                setPrefillDraft(item);
              }}
              onDeleteQueued={(id) => {
                if (!activeThreadId) {
                  return;
                }
                setQueuedByThread((prev) => ({
                  ...prev,
                  [activeThreadId]: (prev[activeThreadId] ?? []).filter(
                    (entry) => entry.id !== id,
                  ),
                }));
              }}
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={handleSelectModel}
              reasoningOptions={reasoningOptions}
              selectedEffort={selectedEffort}
              onSelectEffort={handleSelectEffort}
              accessMode={accessMode}
              onSelectAccessMode={handleSelectAccessMode}
              skills={skills}
              selectionStatus={currentSelectionStatus}
              onComposerRef={(element) => {
                composerElementRef.current = element;
              }}
              onResetToDefaults={() => {
                if (!activeWorkspace) {
                  return;
                }
                if (workspaceDefaultModel?.id) {
                  setSelectedModelId(workspaceDefaultModel.id);
                }
                setSelectedEffort(workspaceDefaultEffort ?? null);
                setAccessMode(activeWorkspace.settings.defaultAccessMode ?? "current");
                if (activeThreadId) {
                  setThreadOverridesById((prev) => {
                    const next = { ...prev };
                    delete next[activeThreadId];
                    return next;
                  });
                  pushAlert("info", "Defaults restored", "Thread settings now match workspace defaults.");
                } else if (activeWorkspaceId) {
                  setPendingThreadOverridesByWorkspace((prev) => {
                    const next = { ...prev };
                    delete next[activeWorkspaceId];
                    return next;
                  });
                  pushAlert("info", "Defaults restored", "New threads in this workspace will use the workspace defaults.");
                }
              }}
            />
            <Suspense fallback={null}>
              <DebugPanel
                entries={debugEntries}
                isOpen={debugOpen}
                loggingEnabled={debugLoggingEnabled}
                onClear={clearDebugEntries}
                onCopy={handleCopyDebug}
                onToggleLogging={toggleDebugLogging}
              />
            </Suspense>
          </>
        )}
      </section>
    </div>
  );
}

export default App;
