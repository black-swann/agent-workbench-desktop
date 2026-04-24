import { describe, expect, it } from "vitest";
import { formatRedactedPayload } from "./redact";
import { resolveWorkspacePath } from "./workspacePath";

describe("security helpers", () => {
  it("redacts sensitive keys and token-like strings", () => {
    const output = formatRedactedPayload({
      token: "sk-secret-value",
      nested: {
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz012345",
        message: "failed with sk-abcdefghijklmnopqrstuvwxyz",
      },
    });

    expect(output).toContain("[redacted]");
    expect(output).not.toContain("sk-secret-value");
    expect(output).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz012345");
  });

  it("keeps opened paths inside the active workspace", () => {
    expect(resolveWorkspacePath("src/App.tsx", "/home/example/project")).toBe(
      "/home/example/project/src/App.tsx",
    );
    expect(resolveWorkspacePath("/home/example/project/src/App.tsx", "/home/example/project")).toBe(
      "/home/example/project/src/App.tsx",
    );
    expect(resolveWorkspacePath("../.ssh/id_rsa", "/home/example/project")).toBeNull();
    expect(resolveWorkspacePath("/home/example/.ssh/id_rsa", "/home/example/project")).toBeNull();
  });
});
