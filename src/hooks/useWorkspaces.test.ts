import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaces } from "./useWorkspaces";
import type { WorkspaceInfo } from "../types";

const listWorkspacesMock = vi.fn();
const updateWorkspaceSettingsMock = vi.fn();
const updateWorkspaceCodexBinMock = vi.fn();
const addWorkspaceMock = vi.fn();
const connectWorkspaceMock = vi.fn();
const pickWorkspacePathMock = vi.fn();
const removeWorkspaceMock = vi.fn();

vi.mock("../services/tauri", () => ({
  addWorkspace: (...args: any[]) => addWorkspaceMock(...args),
  connectWorkspace: (...args: any[]) => connectWorkspaceMock(...args),
  listWorkspaces: (...args: any[]) => listWorkspacesMock(...args),
  pickWorkspacePath: (...args: any[]) => pickWorkspacePathMock(...args),
  removeWorkspace: (...args: any[]) => removeWorkspaceMock(...args),
  updateWorkspaceCodexBin: (...args: any[]) => updateWorkspaceCodexBinMock(...args),
  updateWorkspaceSettings: (...args: any[]) => updateWorkspaceSettingsMock(...args),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workbench",
  path: "/tmp/workbench",
  connected: true,
  codex_bin: null,
  settings: {
    sidebarCollapsed: false,
    defaultAccessMode: "current",
    defaultSpeedMode: "standard",
    defaultModel: null,
    defaultEffort: null,
  },
};

describe("useWorkspaces", () => {
  beforeEach(() => {
    listWorkspacesMock.mockReset();
    updateWorkspaceSettingsMock.mockReset();
    updateWorkspaceCodexBinMock.mockReset();
    addWorkspaceMock.mockReset();
    connectWorkspaceMock.mockReset();
    pickWorkspacePathMock.mockReset();
    removeWorkspaceMock.mockReset();
    listWorkspacesMock.mockResolvedValue([workspace]);
  });

  it("reverts optimistic workspace settings when save fails", async () => {
    updateWorkspaceSettingsMock.mockRejectedValue(new Error("save failed"));

    const { result } = renderHook(() =>
      useWorkspaces({
        onDebug: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.hasLoaded).toBe(true);
      expect(result.current.workspaces).toHaveLength(1);
    });

    await expect(
      act(async () => {
        await result.current.updateWorkspaceSettings("workspace-1", {
          ...workspace.settings,
          defaultEffort: "high",
        });
      }),
    ).rejects.toThrow("save failed");

    expect(result.current.workspaces[0].settings.defaultEffort).toBeNull();
  });
});
