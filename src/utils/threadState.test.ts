import { describe, expect, it } from "vitest";
import {
  applyThreadPresentation,
  normalizeThreadOverride,
  resolveRestoredWorkspaceId,
} from "./threadState";

describe("applyThreadPresentation", () => {
  it("applies custom names and moves pinned threads to the top", () => {
    const result = applyThreadPresentation(
      [
        { id: "a", name: "Alpha" },
        { id: "b", name: "Beta" },
        { id: "c", name: "Gamma" },
      ],
      {
        b: { customName: "Build Fix", pinned: true },
        c: { pinned: true },
      },
    );

    expect(result.map((thread) => thread.id)).toEqual(["b", "c", "a"]);
    expect(result[0].name).toBe("Build Fix");
    expect(result[0].isPinned).toBe(true);
  });
});

describe("normalizeThreadOverride", () => {
  it("returns null when a thread override matches defaults", () => {
    expect(
      normalizeThreadOverride(
        {
          model: "gpt-5.2-codex",
          effort: null,
          accessMode: "current",
          speedMode: "standard",
        },
        {
          model: "gpt-5.2-codex",
          effort: null,
          accessMode: "current",
          speedMode: "standard",
        },
      ),
    ).toBeNull();
  });

  it("keeps an override when any selection differs from defaults", () => {
    expect(
      normalizeThreadOverride(
        {
          model: "gpt-5.2-codex",
          effort: null,
          accessMode: "current",
          speedMode: "standard",
        },
        {
          model: "gpt-5.2-codex",
          effort: "high",
          accessMode: "current",
          speedMode: "standard",
        },
      ),
    ).toEqual({
      model: "gpt-5.2-codex",
      effort: "high",
      accessMode: "current",
      speedMode: "standard",
    });
  });
});

describe("resolveRestoredWorkspaceId", () => {
  it("restores only a workspace id that still exists", () => {
    expect(resolveRestoredWorkspaceId(["w1", "w2"], "w2")).toBe("w2");
    expect(resolveRestoredWorkspaceId(["w1", "w2"], "missing")).toBeNull();
    expect(resolveRestoredWorkspaceId(["w1", "w2"], null)).toBeNull();
  });
});
