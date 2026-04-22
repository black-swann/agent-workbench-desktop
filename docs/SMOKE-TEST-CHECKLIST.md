# Prototype Smoke Test Checklist

Use this checklist before calling the prototype ready for a review build.

## Preconditions

- `codex` is installed and available in `PATH`, or you have a known-good absolute custom binary path.
- Rust, Node.js, and the required Tauri/WebKitGTK Linux libraries are installed.
- You can launch the app with `npm run tauri dev` or install a built `.deb`.

## Workspace Flow

- [ ] Launch the app and confirm the home screen explains what a workspace is.
- [ ] Add a workspace from the system folder picker.
- [ ] Confirm the workspace appears in the sidebar and connects automatically.
- [ ] Open `Linux Settings` and verify the default model, thinking, and access controls render.
- [ ] Save a valid custom Codex binary path and confirm the workspace reconnects successfully.
- [ ] Save an invalid custom Codex binary path and confirm the settings panel shows a clear validation error.

## Thread Flow

- [ ] Create a new agent thread from the sidebar.
- [ ] Send a normal prompt and confirm user + assistant messages render.
- [ ] Confirm reasoning/tool items stream into the conversation as the turn runs.
- [ ] Stop a running turn and confirm the UI exits the processing state cleanly.
- [ ] Select another thread, confirm the app shows a loading state, then renders restored history.
- [ ] Archive a thread and confirm it disappears from the sidebar.

## Approval Flow

- [ ] Trigger an approval request.
- [ ] Confirm the approvals panel shows a readable summary, structured fields, and raw payload.
- [ ] Decline one approval and confirm it disappears.
- [ ] Approve one approval and confirm the turn continues.

## Defaults And Overrides

- [ ] Change workspace defaults in `Linux Settings` and confirm the composer updates immediately.
- [ ] Change the live composer selections and confirm the status pills show `override`.
- [ ] Click `Reset to defaults` and confirm model, thinking, and access snap back to workspace defaults.

## Disconnect And Recovery

- [ ] Kill or break a workspace session externally if possible.
- [ ] Confirm the UI shows a disconnect warning and marks the workspace disconnected.
- [ ] Reconnect the workspace and confirm the warning clears and thread listing works again.

## Packaging

- [ ] Run `npm run build`.
- [ ] Run `cargo test --lib` in `src-tauri/`.
- [ ] Run `npm run build:deb`.
- [ ] Install the generated `.deb` on a clean Ubuntu environment and confirm the app launches.

## Local Verification Notes

Last local verification from this repo snapshot:

- `npm run build`: passed
- `cargo check`: passed
- `cargo test --lib`: passed
- `npm run build:deb`: passed

Still recommended before release review:

- Full GUI smoke pass on Linux desktop
- `.deb` install test on a clean Ubuntu machine
