import { useCallback, useEffect, useMemo, useState } from "react";
import type { DebugEntry } from "../types";
import type { WorkspaceInfo, WorkspaceSettings } from "../types";
import {
  addWorkspace as addWorkspaceService,
  connectWorkspace as connectWorkspaceService,
  listWorkspaces,
  pickWorkspacePath,
  removeWorkspace as removeWorkspaceService,
  updateWorkspaceCodexBin as updateWorkspaceCodexBinService,
  updateWorkspaceSettings as updateWorkspaceSettingsService,
} from "../services/tauri";

type UseWorkspacesOptions = {
  onDebug?: (entry: DebugEntry) => void;
};

export function useWorkspaces(options: UseWorkspacesOptions = {}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const { onDebug } = options;

  const refreshWorkspaces = useCallback(async () => {
    try {
      const entries = await listWorkspaces();
      setWorkspaces(entries);
      setActiveWorkspaceId((prev) => {
        if (!prev) {
          return prev;
        }
        return entries.some((entry) => entry.id === prev) ? prev : null;
      });
      setHasLoaded(true);
      return entries;
    } catch (err) {
      console.error("Failed to load workspaces", err);
      setHasLoaded(true);
      throw err;
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((entry) => entry.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  async function addWorkspace() {
    const selection = await pickWorkspacePath();
    if (!selection) {
      return null;
    }
    onDebug?.({
      id: `${Date.now()}-client-add-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/add",
      payload: { path: selection },
    });
    try {
      const workspace = await addWorkspaceService(selection, null);
      setWorkspaces((prev) => [...prev, workspace]);
      setActiveWorkspaceId(workspace.id);
      return workspace;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function connectWorkspace(entry: WorkspaceInfo) {
    onDebug?.({
      id: `${Date.now()}-client-connect-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/connect",
      payload: { workspaceId: entry.id, path: entry.path },
    });
    setWorkspaces((prev) =>
      prev.map((workspace) =>
        workspace.id === entry.id ? { ...workspace, connected: false } : workspace,
      ),
    );
    try {
      await connectWorkspaceService(entry.id);
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-connect-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/connect error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  function markWorkspaceConnected(id: string) {
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, connected: true } : entry)),
    );
  }

  function markWorkspaceDisconnected(id: string) {
    setWorkspaces((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, connected: false } : entry)),
    );
  }

  async function updateWorkspaceSettings(
    workspaceId: string,
    settings: WorkspaceSettings,
  ) {
    onDebug?.({
      id: `${Date.now()}-client-update-workspace-settings`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/settings",
      payload: { workspaceId, settings },
    });
    let previous: WorkspaceInfo | null = null;
    setWorkspaces((prev) =>
      prev.map((entry) => {
        if (entry.id !== workspaceId) {
          return entry;
        }
        previous = entry;
        return { ...entry, settings };
      }),
    );
    try {
      const updated = await updateWorkspaceSettingsService(workspaceId, settings);
      setWorkspaces((prev) =>
        prev.map((entry) => (entry.id === workspaceId ? updated : entry)),
      );
      return updated;
    } catch (error) {
      if (previous) {
        setWorkspaces((prev) =>
          prev.map((entry) =>
            entry.id === workspaceId && previous ? previous : entry,
          ),
        );
      }
      onDebug?.({
        id: `${Date.now()}-client-update-workspace-settings-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/settings error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function updateWorkspaceCodexBin(
    workspaceId: string,
    codexBin: string | null,
  ) {
    onDebug?.({
      id: `${Date.now()}-client-update-workspace-codex-bin`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/codex-bin",
      payload: { workspaceId, codexBin },
    });
    let previous: WorkspaceInfo | null = null;
    setWorkspaces((prev) =>
      prev.map((entry) => {
        if (entry.id !== workspaceId) {
          return entry;
        }
        previous = entry;
        return { ...entry, codex_bin: codexBin };
      }),
    );
    try {
      const updated = await updateWorkspaceCodexBinService(workspaceId, codexBin);
      setWorkspaces((prev) =>
        prev.map((entry) => (entry.id === workspaceId ? updated : entry)),
      );
      return updated;
    } catch (error) {
      if (previous) {
        setWorkspaces((prev) =>
          prev.map((entry) =>
            entry.id === workspaceId && previous ? previous : entry,
          ),
        );
      }
      onDebug?.({
        id: `${Date.now()}-client-update-workspace-codex-bin-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/codex-bin error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function removeWorkspace(workspaceId: string) {
    onDebug?.({
      id: `${Date.now()}-client-remove-workspace`,
      timestamp: Date.now(),
      source: "client",
      label: "workspace/remove",
      payload: { workspaceId },
    });
    const existing = workspaces.find((entry) => entry.id === workspaceId) ?? null;
    setWorkspaces((prev) => prev.filter((entry) => entry.id !== workspaceId));
    setActiveWorkspaceId((prev) => (prev === workspaceId ? null : prev));
    try {
      await removeWorkspaceService(workspaceId);
    } catch (error) {
      if (existing) {
        setWorkspaces((prev) => [...prev, existing].sort((a, b) => a.name.localeCompare(b.name)));
      }
      onDebug?.({
        id: `${Date.now()}-client-remove-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/remove error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return {
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
  };
}
