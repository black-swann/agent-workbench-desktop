export function resolveWorkspacePath(path: string, workspacePath?: string | null) {
  if (!workspacePath) {
    return null;
  }
  const workspaceRoot = workspacePath.replace(/\/+$/, "");
  if (path.startsWith("/")) {
    return path === workspaceRoot || path.startsWith(`${workspaceRoot}/`) ? path : null;
  }
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${workspaceRoot}/${parts.join("/")}`;
}
