import type { AccessMode, SpeedMode, ThreadSummary } from "../types";

export type ThreadPresentationState = {
  customName?: string | null;
  pinned?: boolean;
};

export type ThreadOverrideSettings = {
  model: string | null;
  effort: string | null;
  accessMode: AccessMode;
  speedMode: SpeedMode;
};

export function applyThreadPresentation(
  threads: ThreadSummary[],
  presentationById: Record<string, ThreadPresentationState>,
): ThreadSummary[] {
  return [...threads]
    .map((thread, index) => {
      const presentation = presentationById[thread.id] ?? {};
      return {
        ...thread,
        name: presentation.customName?.trim() || thread.name,
        isPinned: Boolean(presentation.pinned),
        sortIndex: index,
      };
    })
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return a.sortIndex - b.sortIndex;
    })
    .map(({ sortIndex: _sortIndex, ...thread }) => thread);
}

export function normalizeThreadOverride(
  defaults: ThreadOverrideSettings,
  next: ThreadOverrideSettings,
): ThreadOverrideSettings | null {
  return next.model === defaults.model &&
    next.effort === defaults.effort &&
    next.accessMode === defaults.accessMode &&
    next.speedMode === defaults.speedMode
    ? null
    : next;
}

export function resolveRestoredWorkspaceId(
  workspaceIds: string[],
  restoredWorkspaceId: string | null,
): string | null {
  if (!restoredWorkspaceId) {
    return null;
  }
  return workspaceIds.includes(restoredWorkspaceId) ? restoredWorkspaceId : null;
}
