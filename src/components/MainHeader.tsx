import { useEffect, useState } from "react";
import type {
  AccessMode,
  ModelOption,
  SpeedMode,
  WorkspaceInfo,
  WorkspaceSettings,
} from "../types";
import { pickCodexBinaryPath } from "../services/tauri";

type MainHeaderProps = {
  workspace: WorkspaceInfo;
  models: ModelOption[];
  reasoningOptions: string[];
  selectedModelId: string | null;
  selectedEffort: string | null;
  accessMode: AccessMode;
  speedMode: SpeedMode;
  onSelectModel: (modelId: string) => void;
  onSelectEffort: (effort: string | null) => void;
  onSelectAccessMode: (mode: AccessMode) => void;
  onSelectSpeedMode: (mode: SpeedMode) => void;
  onUpdateWorkspaceSettings: (
    workspaceId: string,
    settings: WorkspaceSettings,
  ) => Promise<WorkspaceInfo>;
  onUpdateWorkspaceCodexBin: (
    workspaceId: string,
    codexBin: string | null,
  ) => Promise<WorkspaceInfo>;
  onReconnectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  uiScale: number;
  minUiScale: number;
  maxUiScale: number;
  onDecreaseUiScale: () => void;
  onIncreaseUiScale: () => void;
  onResetUiScale: () => void;
  onStartReviewPreset: (instructions: string) => Promise<void>;
};

export function MainHeader({
  workspace,
  models,
  reasoningOptions,
  selectedModelId,
  selectedEffort,
  accessMode,
  speedMode,
  onSelectModel,
  onSelectEffort,
  onSelectAccessMode,
  onSelectSpeedMode,
  onUpdateWorkspaceSettings,
  onUpdateWorkspaceCodexBin,
  onReconnectWorkspace,
  uiScale,
  minUiScale,
  maxUiScale,
  onDecreaseUiScale,
  onIncreaseUiScale,
  onResetUiScale,
  onStartReviewPreset,
}: MainHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [codexBinInput, setCodexBinInput] = useState(workspace.codex_bin ?? "");
  const [isSavingCodexBin, setIsSavingCodexBin] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [codexBinError, setCodexBinError] = useState<string | null>(null);
  const hasCodexBinChanges = codexBinInput.trim() !== (workspace.codex_bin ?? "");

  useEffect(() => {
    setCodexBinInput(workspace.codex_bin ?? "");
    setCodexBinError(null);
  }, [workspace.codex_bin, workspace.id]);

  async function handleSaveCodexBin() {
    setIsSavingCodexBin(true);
    try {
      setCodexBinError(null);
      const updatedWorkspace = await onUpdateWorkspaceCodexBin(
        workspace.id,
        codexBinInput.trim() || null,
      );
      if (workspace.connected) {
        setIsReconnecting(true);
        try {
          await onReconnectWorkspace(updatedWorkspace);
        } finally {
          setIsReconnecting(false);
        }
      }
    } catch (error) {
      setCodexBinError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingCodexBin(false);
    }
  }

  async function handleReconnect() {
    setIsReconnecting(true);
    try {
      await onReconnectWorkspace(workspace);
    } finally {
      setIsReconnecting(false);
    }
  }

  async function handleDefaultAccessModeChange(mode: AccessMode) {
    const updated = await onUpdateWorkspaceSettings(workspace.id, {
      ...workspace.settings,
      defaultAccessMode: mode,
    });
    onSelectAccessMode(updated.settings.defaultAccessMode);
  }

  async function handleDefaultSpeedModeChange(mode: SpeedMode) {
    const updated = await onUpdateWorkspaceSettings(workspace.id, {
      ...workspace.settings,
      defaultSpeedMode: mode,
    });
    onSelectSpeedMode(updated.settings.defaultSpeedMode);
  }

  async function handleDefaultModelChange(modelId: string) {
    const selected = models.find((model) => model.id === modelId) ?? null;
    const updated = await onUpdateWorkspaceSettings(workspace.id, {
      ...workspace.settings,
      defaultModel: selected?.model ?? modelId,
      defaultEffort: null,
    });
    onSelectModel(selected?.id ?? modelId);
    onSelectEffort(updated.settings.defaultEffort);
  }

  async function handleDefaultEffortChange(effort: string | null) {
    const updated = await onUpdateWorkspaceSettings(workspace.id, {
      ...workspace.settings,
      defaultEffort: effort,
    });
    onSelectEffort(updated.settings.defaultEffort);
  }

  async function handleCopyPath(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <header className="main-header">
      <div className="workspace-header">
        <div className="workspace-header-stack">
          <div className="workspace-title-line">
            <span className="workspace-title">{workspace.name}</span>
            <span
              className={`workspace-connection-badge ${
                workspace.connected ? "connected" : "disconnected"
              }`}
            >
              {workspace.connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="workspace-path">{workspace.path}</div>
        </div>
      </div>
      <div className="workspace-header-actions">
        <button
          className="ghost header-button"
          onClick={() => void handleCopyPath(workspace.path)}
          title="Copy workspace path"
        >
          Copy Path
        </button>
        <button
          className="ghost header-button"
          onClick={() => setSettingsOpen((prev) => !prev)}
          aria-expanded={settingsOpen}
        >
          Linux Settings
        </button>
      </div>
      {settingsOpen && (
        <div className="workspace-settings-panel">
          <div className="workspace-settings-card workspace-settings-card-wide">
            <div className="workspace-settings-card-header">
              <div>
                <div className="workspace-settings-heading">Runtime</div>
                <div className="workspace-settings-help">
                  Wayland-first desktop session with per-workspace Codex execution.
                </div>
              </div>
              <div className="workspace-settings-actions">
                <button
                  className="ghost header-button"
                  onClick={() => void handleReconnect()}
                  disabled={isReconnecting}
                >
                  {isReconnecting ? "Reconnecting..." : "Reconnect"}
                </button>
              </div>
            </div>

            <label className="workspace-settings-field">
              <span className="workspace-settings-label">Codex binary</span>
              <div className="workspace-settings-input-row">
                <input
                  className="workspace-settings-input"
                  value={codexBinInput}
                  onChange={(event) => setCodexBinInput(event.target.value)}
                  placeholder="codex"
                />
                <button
                  className="ghost header-button"
                  onClick={() =>
                    void (async () => {
                      const selection = await pickCodexBinaryPath();
                      if (selection) {
                        setCodexBinInput(selection);
                      }
                    })()
                  }
                >
                  Browse
                </button>
                <button
                  className="ghost header-button"
                  onClick={() => setCodexBinInput("")}
                  disabled={!codexBinInput}
                >
                  Reset
                </button>
                <button
                  className="ghost header-button"
                  onClick={() => void handleCopyPath(codexBinInput || "codex")}
                >
                  Copy
                </button>
              </div>
              <span className="workspace-settings-help">
                Leave blank to use `codex` from PATH. Saving while connected restarts
                the workspace session onto the new binary.
              </span>
              {codexBinError && (
                <span className="workspace-settings-help workspace-settings-error">
                  {codexBinError}
                </span>
              )}
            </label>

            <div className="workspace-settings-actions workspace-settings-actions-right">
              <button
                className="ghost header-button"
                onClick={() => void handleSaveCodexBin()}
                disabled={isSavingCodexBin || isReconnecting || !hasCodexBinChanges}
              >
                {isSavingCodexBin
                  ? "Saving..."
                  : isReconnecting
                    ? "Reconnecting..."
                    : workspace.connected
                      ? "Save & reconnect"
                      : "Save binary"}
              </button>
            </div>
          </div>

          <div className="workspace-settings-card">
            <div className="workspace-settings-heading">Review</div>
            <div className="workspace-settings-actions">
              <button
                className="ghost header-button"
                onClick={() =>
                  void onStartReviewPreset("Review the current diff in this workspace.")
                }
              >
                Review Diff
              </button>
              <button
                className="ghost header-button"
                onClick={() =>
                  void onStartReviewPreset("Review only the last completed turn in this thread.")
                }
              >
                Review Last Turn
              </button>
              <button
                className="ghost header-button"
                onClick={() =>
                  void onStartReviewPreset("Review the current thread from top to bottom.")
                }
              >
                Review Thread
              </button>
              <button
                className="ghost header-button"
                onClick={() =>
                  void onStartReviewPreset("Review the broader workspace state and current work in progress.")
                }
              >
                Review Workspace
              </button>
            </div>
            <div className="workspace-settings-help">
              Preset review actions use the existing inline review flow with scoped instructions.
            </div>
          </div>

          <div className="workspace-settings-card">
            <div className="workspace-settings-heading">Appearance</div>
            <div className="workspace-settings-actions">
              <div className="display-scale-controls" aria-label="Display scale">
                <button
                  className="ghost icon-button"
                  onClick={onDecreaseUiScale}
                  disabled={uiScale <= minUiScale}
                  aria-label="Decrease display scale"
                  title="Decrease display scale"
                >
                  -
                </button>
                <button
                  className="ghost display-scale-value"
                  onClick={onResetUiScale}
                  title="Reset display scale"
                >
                  {Math.round(uiScale * 100)}%
                </button>
                <button
                  className="ghost icon-button"
                  onClick={onIncreaseUiScale}
                  disabled={uiScale >= maxUiScale}
                  aria-label="Increase display scale"
                  title="Increase display scale"
                >
                  +
                </button>
              </div>
            </div>
            <div className="workspace-settings-help">
              Display scale is saved for this desktop app and applies after the settings panel closes.
            </div>
          </div>

          <div className="workspace-settings-card">
            <div className="workspace-settings-heading">Defaults</div>
            <label className="workspace-settings-field">
              <span className="workspace-settings-label">Default model</span>
              <select
                className="workspace-settings-select"
                value={selectedModelId ?? ""}
                onChange={(event) =>
                  void handleDefaultModelChange(event.target.value)
                }
              >
                {models.length === 0 && <option value="">No models</option>}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName || model.model}
                  </option>
                ))}
              </select>
            </label>
            <label className="workspace-settings-field">
              <span className="workspace-settings-label">Default thinking</span>
              <select
                className="workspace-settings-select"
                value={selectedEffort ?? ""}
                onChange={(event) =>
                  void handleDefaultEffortChange(event.target.value || null)
                }
              >
                <option value="">Model default</option>
                {reasoningOptions.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </label>
            <label className="workspace-settings-field">
              <span className="workspace-settings-label">Default access</span>
              <select
                className="workspace-settings-select"
                value={accessMode}
                onChange={(event) =>
                  void handleDefaultAccessModeChange(event.target.value as AccessMode)
                }
              >
                <option value="read-only">Read only</option>
                <option value="current">Current workspace</option>
                <option value="full-access">Full access, ask</option>
                <option value="yolo">YOLO, no prompts</option>
              </select>
            </label>
            <label className="workspace-settings-field">
              <span className="workspace-settings-label">Default speed</span>
              <select
                className="workspace-settings-select"
                value={speedMode}
                onChange={(event) =>
                  void handleDefaultSpeedModeChange(event.target.value as SpeedMode)
                }
              >
                <option value="standard">Standard</option>
                <option value="fast">Fast mode</option>
              </select>
            </label>
            {accessMode === "full-access" && (
              <div className="workspace-settings-warning">
                Full access gives agents filesystem access beyond this workspace.
                Approval prompts remain enabled, but this default should only be used
                for trusted repos.
              </div>
            )}
            {accessMode === "yolo" && (
              <div className="workspace-settings-warning">
                YOLO disables approval prompts and removes workspace filesystem
                limits. Use it only for trusted repos and disposable environments.
              </div>
            )}
            {speedMode === "fast" && (
              <div className="workspace-settings-help">
                Fast mode is a speed and credit setting. It does not change filesystem
                access or approval behavior.
              </div>
            )}
            <div className="workspace-settings-help">
              These defaults load whenever this workspace becomes active. The composer
              can still be changed per thread without rewriting saved workspace defaults.
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
