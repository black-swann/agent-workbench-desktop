# Agent Workbench

Agent Workbench is a Tauri app for managing local workspaces and conversation threads on Ubuntu Linux. It provides a sidebar to manage projects, a home screen for quick actions, and a conversation view backed by the Codex app-server protocol.

This build currently targets Wayland-first Linux desktops, with X11 as a compatibility fallback through the normal GTK/WebKit stack.
Distribution is Debian-package only for now.

## Features

- Add and persist workspaces using the system folder picker.
- Spawn one `codex app-server` per workspace and stream events over JSON-RPC.
- Restore threads per workspace from the Codex rollout history (`thread/list`) and resume on selection.
- Start threads, send messages, show reasoning/tool call items, and handle approvals.
- Per-workspace defaults and per-thread overrides for model, reasoning effort, access mode, and custom Codex binary path.
- Search, rename, pin, and archive threads from the sidebar.
- Review presets, thread checkpoints, and lightweight keyboard shortcuts for common actions.
- Inline alerts, disconnect recovery state, and a resizable sidebar for denser workspaces.
- Skills menu that inserts `$skill` tokens into the composer.
- Standard desktop window shell suitable for Linux desktop use.

## Status

Local validation is complete in the repository environment:

- `npm test`
- `npm run build`
- `cargo test --lib`
- `npm run smoke:app-server`

The one remaining release-readiness item is a full clean-Ubuntu acceptance pass of the generated `.deb`.

## Requirements

- Node.js + npm
- Rust toolchain (stable)
- Codex installed on your system and available as `codex` in `PATH`
- Linux desktop libraries required by Tauri/WebKitGTK

If the `codex` binary is not in `PATH`, set a custom absolute binary path per workspace from `Linux Settings`.

Typical Ubuntu package set:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run frontend validation tests:

```bash
npm test
```

Run in dev mode:

```bash
npm run tauri dev
```

Build the Ubuntu/Debian package:

```bash
npm run build:deb
```

Write SHA-256 checksums for the generated Debian artifacts:

```bash
npm run release:checksums
```

Verify the Codex app-server handshake independently:

```bash
npm run smoke:app-server
```

Run backend validation tests:

```bash
cd src-tauri
cargo test --lib
```

## Project Structure

```
src/
  components/       UI building blocks
  hooks/            state + event wiring
  services/         Tauri IPC wrapper
  styles/           split CSS by area
  types.ts          shared types
src-tauri/
  src/lib.rs        Tauri backend + codex app-server client
  tauri.conf.json   window configuration
```

## Linux Notes

- Workspaces persist to `workspaces.json` under the app data directory.
- Threads are restored by filtering `thread/list` results using the workspace `cwd`.
- Selecting a thread always calls `thread/resume` to refresh messages from disk.
- CLI sessions appear if their `cwd` matches the workspace path; they are not live-streamed unless resumed.
- Each workspace launches its own `codex app-server` process with that workspace as the child process working directory.
- Each workspace can store its own default access mode, default model, default reasoning effort, and optional custom Codex binary path.
- Last active workspace and thread restore on relaunch, and per-thread overrides/checkpoints persist in local storage.
- The app uses `codex app-server` over stdio; see `src-tauri/src/lib.rs`.
- Release builds currently produce a `.deb` package only.
- Release checksum manifests are written next to the `.deb` as `SHA256SUMS`.

## Project Docs

- Security review: [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md)
- Smoke-test checklist: [docs/SMOKE-TEST-CHECKLIST.md](docs/SMOKE-TEST-CHECKLIST.md)

## Troubleshooting

- `workspace not connected`
  Reconnect the workspace from the sidebar or `Linux Settings`. The app now marks workspaces disconnected when the underlying `codex app-server` session exits.

- Custom Codex binary fails to save
  Custom binaries must be absolute file paths. Leave the field blank to use `codex` from `PATH`.

- Custom Codex binary saves but reconnect fails
  Confirm the selected file is executable and actually launches Codex. The workspace settings panel will show validation failures inline, and the main UI will show reconnect errors.

- Threads do not appear after adding a workspace
  Confirm the workspace connected successfully and that Codex has rollout history in that folder. Use the workspace refresh action to reload `thread/list`.

- Approval requests are missing
  Approval prompts only appear when the app-server emits a request. If a turn stalls, open the debug panel and inspect the latest stderr/error events.

- Packaging works locally but not on another machine
  Verify the target Ubuntu machine has the required WebKitGTK and GTK dependencies listed above before installing the `.deb`.
