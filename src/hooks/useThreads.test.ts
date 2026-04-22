import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThreads } from "./useThreads";
import type { ApprovalRequest, WorkspaceInfo } from "../types";

const startThreadMock = vi.fn();
const sendUserMessageMock = vi.fn();
const resumeThreadMock = vi.fn();
const listThreadsMock = vi.fn();
const archiveThreadMock = vi.fn();
const interruptTurnMock = vi.fn();
const startReviewMock = vi.fn();
const respondToServerRequestMock = vi.fn();
const getAccountRateLimitsMock = vi.fn();

let eventHandlers: Record<string, (...args: any[]) => void> = {};

vi.mock("../services/tauri", () => ({
  startThread: (...args: any[]) => startThreadMock(...args),
  sendUserMessage: (...args: any[]) => sendUserMessageMock(...args),
  resumeThread: (...args: any[]) => resumeThreadMock(...args),
  listThreads: (...args: any[]) => listThreadsMock(...args),
  archiveThread: (...args: any[]) => archiveThreadMock(...args),
  interruptTurn: (...args: any[]) => interruptTurnMock(...args),
  startReview: (...args: any[]) => startReviewMock(...args),
  respondToServerRequest: (...args: any[]) => respondToServerRequestMock(...args),
  getAccountRateLimits: (...args: any[]) => getAccountRateLimitsMock(...args),
}));

vi.mock("./useAppServerEvents", () => ({
  useAppServerEvents: (handlers: Record<string, (...args: any[]) => void>) => {
    eventHandlers = handlers;
  },
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
    defaultModel: null,
    defaultEffort: null,
  },
};

describe("useThreads", () => {
  beforeEach(() => {
    eventHandlers = {};
    startThreadMock.mockReset();
    sendUserMessageMock.mockReset();
    resumeThreadMock.mockReset();
    listThreadsMock.mockReset();
    archiveThreadMock.mockReset();
    interruptTurnMock.mockReset();
    startReviewMock.mockReset();
    respondToServerRequestMock.mockReset();
    getAccountRateLimitsMock.mockReset();
    getAccountRateLimitsMock.mockResolvedValue({});
  });

  it("clears stale workspace session state after disconnect", async () => {
    startThreadMock.mockResolvedValue({
      result: { thread: { id: "thread-1" } },
    });
    sendUserMessageMock.mockResolvedValue({
      result: { turn: { id: "turn-1" } },
    });

    const onWorkspaceDisconnected = vi.fn();
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        onWorkspaceDisconnected,
        onError: vi.fn(),
        onDebug: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessage("Investigate disconnect handling");
    });

    await waitFor(() => {
      expect(result.current.activeThreadId).toBe("thread-1");
    });

    act(() => {
      eventHandlers.onTurnStarted?.("workspace-1", "thread-1", "turn-1");
      eventHandlers.onApprovalRequest?.({
        workspace_id: "workspace-1",
        request_id: 7,
        method: "workspace/requestApproval",
        params: { command: "rm -rf /tmp/demo" },
      } satisfies ApprovalRequest);
      eventHandlers.onAccountRateLimitsUpdated?.("workspace-1", {
        primary: { usedPercent: 42, windowDurationMins: 5, resetsAt: 1234 },
      });
    });

    expect(result.current.threadStatusById["thread-1"]).toMatchObject({
      isProcessing: true,
    });
    expect(result.current.approvals).toHaveLength(1);
    expect(result.current.activeTurnIdByThread["thread-1"]).toBe("turn-1");
    expect(result.current.rateLimitsByWorkspace["workspace-1"]?.primary?.usedPercent).toBe(
      42,
    );

    act(() => {
      eventHandlers.onWorkspaceDisconnected?.(
        "workspace-1",
        "The workspace session ended. Reconnect to continue.",
      );
    });

    expect(result.current.threadStatusById["thread-1"]).toMatchObject({
      isProcessing: false,
      isReviewing: false,
    });
    expect(result.current.activeTurnIdByThread["thread-1"]).toBeNull();
    expect(result.current.approvals).toEqual([]);
    expect(result.current.rateLimitsByWorkspace["workspace-1"]).toBeNull();
    expect(onWorkspaceDisconnected).toHaveBeenCalledWith(
      "workspace-1",
      "The workspace session ended. Reconnect to continue.",
    );
  });
});
