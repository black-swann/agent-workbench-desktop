type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    typeof (window as TauriWindow).__TAURI_INTERNALS__ !== "undefined"
  );
}
