# Security Review

Date: 2026-04-24

## Scope

Reviewed the local desktop security surface for AI-account use:

- Tauri capability permissions and CSP
- app-server process spawning and approval policy
- workspace and custom binary persistence
- debug/health logging
- changed-file opening
- package install and runtime launch behavior
- npm dependency advisory state

## Fixes Applied

- Kept approval prompts enabled even when the selected access mode uses Codex `dangerFullAccess`.
- Redacted sensitive keys and common token formats before rendering or copying debug and health diagnostics.
- Added an explicit debug logging pause control that clears retained diagnostics and stops new entries from being stored while paused.
- Added visible full-access warnings in the composer and workspace defaults panel.
- Restricted changed-file opening to paths inside the active workspace.
- Required selected workspaces to resolve to directories.
- Required custom Codex binary paths to be absolute, regular files, executable on Unix, and not world-writable.
- Wrote `workspaces.json` with user-only permissions on Unix.
- Narrowed Tauri opener/dialog permissions to the commands the UI actually uses.
- Replaced broad `core:default` with the specific core event, menu, and resource permissions used by the frontend.
- Added a release checksum script that writes `SHA256SUMS` beside the generated `.deb`.
- Kept packaged devtools disabled and retained a restrictive CSP.

## Validation

- `npm audit` reported 0 vulnerabilities.
- `npm test` passed with 4 test files and 9 tests.
- `npm run build` passed.
- `cargo test --lib` passed with 5 tests.
- `cargo audit` completed without vulnerability failures; it reported 19 warning advisories from transitive Tauri/GTK dependencies, mostly unmaintained GTK3 bindings plus `glib` and `rand` unsoundness warnings.
- `npm run smoke:app-server` passed.
- `npm run build:deb` passed.
- `npm run release:checksums` passed, and `sha256sum -c SHA256SUMS` verified the generated `.deb`.
- Reinstalled the rebuilt `.deb` and confirmed the installed app starts without an immediate crash.

## Residual Risks

- The app still intentionally delegates real work to `codex app-server`; account-level safety ultimately depends on Codex authentication, model/tool behavior, and user approval decisions.
- Rust dependency advisory warnings remain in the transitive Tauri/GTK stack. They are not direct application code, but they should be monitored during Tauri/wry upgrades.
- Debug diagnostics are redacted on a best-effort basis, not a formal secret scanner. Users should still avoid sharing full debug logs from sensitive workspaces.
- The custom Codex binary option is powerful by design. It is now validated for executable permissions, but users should only point it at trusted binaries.
- Release artifacts have checksums but are not cryptographically signed yet. Signing requires choosing and protecting a signing key.
- Full clean-machine GUI acceptance remains manual, especially prompt send, approvals, review presets, diff opening, checkpoints, and restart persistence.

## Recommended Next Hardening

- Keep focused tests for debug redaction and workspace-path constrained file opening current as those helpers evolve.
- Re-run `cargo audit` after Tauri, wry, WebKitGTK, or Ubuntu runtime updates and remove transitive warnings when upstream paths are available.
- Sign release artifacts before public distribution once a signing key is available.
