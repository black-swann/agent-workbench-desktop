type HomeProps = {
  onOpenProject: () => void;
  onAddWorkspace: () => void;
};

export function Home({ onOpenProject, onAddWorkspace }: HomeProps) {
  return (
    <div className="home">
      <div className="home-title">Agent Workbench</div>
      <div className="home-subtitle">
        Orchestrate Codex agents across local projects from one Linux desktop app.
      </div>
      <div className="home-notes">
        <div className="home-note">
          Add a project folder as a workspace. Agent Workbench will start one
          `codex app-server` session for that folder.
        </div>
        <div className="home-note">
          `codex` must already be installed on this machine. You can also set a
          per-workspace custom binary path later in Linux Settings.
        </div>
      </div>
      <div className="home-actions">
        <button
          className="home-button primary"
          onClick={onOpenProject}
          data-tauri-drag-region="false"
        >
          <span className="home-icon" aria-hidden>
            /
          </span>
          Open Project
        </button>
        <button
          className="home-button secondary"
          onClick={onAddWorkspace}
          data-tauri-drag-region="false"
        >
          <span className="home-icon" aria-hidden>
            +
          </span>
          Add Workspace
        </button>
      </div>
    </div>
  );
}
