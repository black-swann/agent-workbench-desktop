# Security Policy

Agent Workbench is a local Linux desktop app that launches a configured `codex app-server` process for each workspace. It can operate on local project files, so only use trusted binaries and review approval prompts before allowing sensitive actions.

## Reporting Issues

If you find a security issue, please avoid posting exploit details publicly. Use GitHub private vulnerability reporting if it is available for this repository, or open a minimal issue asking for a private contact path.

## Current Notes

- The app keeps Tauri permissions narrow and does not enable packaged devtools.
- Custom binary paths are validated before being stored.
- Debug diagnostics are redacted on a best-effort basis before display or copy.
- Rust advisory scans currently include warning advisories from transitive Tauri/GTK dependencies. See [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) for the latest review notes.
