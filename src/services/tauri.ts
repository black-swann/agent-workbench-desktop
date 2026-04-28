import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AccessMode, SpeedMode, WorkspaceInfo, WorkspaceSettings } from "../types";
import type { ReviewTarget } from "../types";
import { isTauriRuntime } from "../utils/tauriRuntime";

function requireTauriRuntime(command: string): never {
  throw new Error(`${command} requires the Agent Workbench desktop runtime.`);
}

export async function pickWorkspacePath(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const selection = await open({ directory: true, multiple: false });
  if (!selection || Array.isArray(selection)) {
    return null;
  }
  return selection;
}

export async function pickCodexBinaryPath(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const selection = await open({ directory: false, multiple: false });
  if (!selection || Array.isArray(selection)) {
    return null;
  }
  return selection;
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<WorkspaceInfo[]>("list_workspaces");
}

export async function addWorkspace(
  path: string,
  codex_bin: string | null,
): Promise<WorkspaceInfo> {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Adding a workspace");
  }
  return invoke<WorkspaceInfo>("add_workspace", { path, codex_bin });
}

export async function updateWorkspaceSettings(
  id: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceInfo> {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Updating workspace settings");
  }
  return invoke<WorkspaceInfo>("update_workspace_settings", { id, settings });
}

export async function updateWorkspaceCodexBin(
  id: string,
  codex_bin: string | null,
): Promise<WorkspaceInfo> {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Updating the custom binary path");
  }
  return invoke<WorkspaceInfo>("update_workspace_codex_bin", { id, codex_bin });
}

export async function removeWorkspace(id: string): Promise<void> {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Removing a workspace");
  }
  return invoke("remove_workspace", { id });
}

export async function connectWorkspace(id: string): Promise<void> {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Connecting a workspace");
  }
  return invoke("connect_workspace", { id });
}

export async function startThread(workspaceId: string) {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Starting a thread");
  }
  return invoke<any>("start_thread", { workspaceId });
}

export async function sendUserMessage(
  workspaceId: string,
  threadId: string,
  text: string,
  options?: {
    model?: string | null;
    effort?: string | null;
    accessMode?: AccessMode;
    speedMode?: SpeedMode;
  },
) {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Sending a message");
  }
  return invoke("send_user_message", {
    workspaceId,
    threadId,
    text,
    model: options?.model ?? null,
    effort: options?.effort ?? null,
    accessMode: options?.accessMode ?? null,
    speedMode: options?.speedMode ?? null,
  });
}

export async function interruptTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
) {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Interrupting a turn");
  }
  return invoke("turn_interrupt", { workspaceId, threadId, turnId });
}

export async function startReview(
  workspaceId: string,
  threadId: string,
  target: ReviewTarget,
  delivery?: "inline" | "detached",
) {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Starting a review");
  }
  const payload: Record<string, unknown> = { workspaceId, threadId, target };
  if (delivery) {
    payload.delivery = delivery;
  }
  return invoke("start_review", payload);
}

export async function respondToServerRequest(
  workspaceId: string,
  requestId: number,
  decision: "accept" | "decline",
) {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Responding to an approval request");
  }
  return invoke("respond_to_server_request", {
    workspaceId,
    requestId,
    result: { decision },
  });
}

export async function getModelList(workspaceId: string) {
  if (!isTauriRuntime()) {
    return { models: [] };
  }
  return invoke<any>("model_list", { workspaceId });
}

export async function getAccountRateLimits(workspaceId: string) {
  if (!isTauriRuntime()) {
    return {};
  }
  return invoke<any>("account_rate_limits", { workspaceId });
}

export async function getSkillsList(workspaceId: string) {
  if (!isTauriRuntime()) {
    return { skills: [] };
  }
  return invoke<any>("skills_list", { workspaceId });
}

export async function listThreads(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  if (!isTauriRuntime()) {
    return { items: [], nextCursor: null };
  }
  return invoke<any>("list_threads", { workspaceId, cursor, limit });
}

export async function resumeThread(workspaceId: string, threadId: string) {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Resuming a thread");
  }
  return invoke<any>("resume_thread", { workspaceId, threadId });
}

export async function archiveThread(workspaceId: string, threadId: string) {
  if (!isTauriRuntime()) {
    requireTauriRuntime("Archiving a thread");
  }
  return invoke<any>("archive_thread", { workspaceId, threadId });
}
