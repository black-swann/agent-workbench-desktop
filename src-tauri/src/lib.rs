use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkspaceEntry {
    id: String,
    name: String,
    path: String,
    codex_bin: Option<String>,
    #[serde(default)]
    settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkspaceInfo {
    id: String,
    name: String,
    path: String,
    connected: bool,
    codex_bin: Option<String>,
    #[serde(default)]
    settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct WorkspaceSettings {
    #[serde(default, rename = "sidebarCollapsed")]
    sidebar_collapsed: bool,
    #[serde(default = "default_access_mode", rename = "defaultAccessMode")]
    default_access_mode: String,
    #[serde(default = "default_speed_mode", rename = "defaultSpeedMode")]
    default_speed_mode: String,
    #[serde(default, rename = "defaultModel")]
    default_model: Option<String>,
    #[serde(default, rename = "defaultEffort")]
    default_effort: Option<String>,
}

fn default_access_mode() -> String {
    "current".to_string()
}

fn default_speed_mode() -> String {
    "standard".to_string()
}

#[derive(Serialize, Clone)]
struct AppServerEvent {
    workspace_id: String,
    message: Value,
}

struct WorkspaceSession {
    entry: WorkspaceEntry,
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
}

impl WorkspaceSession {
    async fn write_message(&self, value: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())
    }

    async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        self.write_message(json!({ "id": id, "method": method, "params": params }))
            .await?;
        rx.await.map_err(|_| "request canceled".to_string())
    }

    async fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        let value = if let Some(params) = params {
            json!({ "method": method, "params": params })
        } else {
            json!({ "method": method })
        };
        self.write_message(value).await
    }

    async fn send_response(&self, id: u64, result: Value) -> Result<(), String> {
        self.write_message(json!({ "id": id, "result": result }))
            .await
    }
}

struct AppState {
    workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: PathBuf,
}

impl AppState {
    fn load(app: &AppHandle) -> Self {
        let storage_path = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()))
            .join("workspaces.json");
        let workspaces = read_workspaces(&storage_path).unwrap_or_default();
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            storage_path,
        }
    }
}

fn read_workspaces(path: &PathBuf) -> Result<HashMap<String, WorkspaceEntry>, String> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let list: Vec<WorkspaceEntry> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(list
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect())
}

fn canonicalize_workspace_path(path: &str) -> Result<String, String> {
    let candidate = PathBuf::from(path);
    let canonical = std::fs::canonicalize(&candidate)
        .map_err(|e| format!("failed to resolve workspace path `{path}`: {e}"))?;
    if !canonical.is_dir() {
        return Err(format!("workspace path is not a directory: {path}"));
    }
    canonical
        .to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| "workspace path is not valid UTF-8".to_string())
}

fn validate_codex_bin_path(codex_bin: &str) -> Result<String, String> {
    let trimmed = codex_bin.trim();
    if trimmed.is_empty() {
        return Err("custom Codex binary path cannot be empty".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(
            "custom Codex binary must be an absolute file path; leave it blank to use `codex` from PATH"
                .to_string(),
        );
    }
    if !path.exists() {
        return Err(format!("custom Codex binary path not found: {trimmed}"));
    }
    if !path.is_file() {
        return Err(format!("custom Codex binary path is not a file: {trimmed}"));
    }
    validate_codex_bin_permissions(&path, trimmed)?;
    Ok(trimmed.to_string())
}

fn user_local_bin() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
        .map(|home| home.join(".local/bin"))
}

fn default_codex_bin() -> String {
    let mut candidates = vec![
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/usr/bin/codex"),
        PathBuf::from("/bin/codex"),
    ];
    if let Some(local_bin) = user_local_bin() {
        candidates.insert(1, local_bin.join("codex"));
    }
    candidates
        .iter()
        .find(|candidate| path_is_valid_codex_bin(candidate))
        .map(|candidate| candidate.to_string_lossy().into_owned())
        .unwrap_or_else(|| "codex".to_string())
}

fn path_is_valid_codex_bin(path: &Path) -> bool {
    path.is_file() && validate_codex_bin_permissions(path, &path.to_string_lossy()).is_ok()
}

fn desktop_child_path() -> String {
    let existing = std::env::var("PATH").unwrap_or_default();
    let mut common = vec![
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];
    if let Some(local_bin) = user_local_bin() {
        common.push(local_bin.to_string_lossy().into_owned());
    }
    let common = common.join(":");
    if existing.is_empty() {
        return common;
    }
    format!("{common}:{existing}")
}

#[cfg(unix)]
fn validate_codex_bin_permissions(path: &Path, display: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let mode = path
        .metadata()
        .map_err(|e| format!("failed to inspect custom Codex binary permissions `{display}`: {e}"))?
        .permissions()
        .mode();
    if mode & 0o111 == 0 {
        return Err(format!(
            "custom Codex binary path is not executable: {display}"
        ));
    }
    if mode & 0o002 != 0 {
        return Err(format!(
            "custom Codex binary path is world-writable and will not be used: {display}"
        ));
    }
    Ok(())
}

#[cfg(not(unix))]
fn validate_codex_bin_permissions(_path: &Path, _display: &str) -> Result<(), String> {
    Ok(())
}

fn build_turn_start_params(
    thread_id: &str,
    text: &str,
    cwd: &str,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    speed_mode: Option<String>,
) -> Value {
    let access_mode = access_mode.unwrap_or_else(|| "current".to_string());
    let sandbox_policy = match access_mode.as_str() {
        "full-access" | "yolo" => json!({
            "type": "dangerFullAccess"
        }),
        "read-only" => json!({
            "type": "readOnly"
        }),
        _ => json!({
            "type": "workspaceWrite",
            "writableRoots": [cwd],
            "networkAccess": true
        }),
    };

    let approval_policy = if access_mode == "yolo" {
        "never"
    } else {
        "on-request"
    };

    let mut params = json!({
        "threadId": thread_id,
        "input": [{ "type": "text", "text": text }],
        "cwd": cwd,
        "approvalPolicy": approval_policy,
        "sandboxPolicy": sandbox_policy,
        "model": model,
        "effort": effort,
    });

    if speed_mode.as_deref() == Some("fast") {
        if let Some(params) = params.as_object_mut() {
            params.insert("serviceTier".to_string(), json!("fast"));
        }
    }

    params
}

fn write_workspaces(path: &PathBuf, entries: &[WorkspaceEntry]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    file.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn spawn_workspace_session(
    entry: WorkspaceEntry,
    app_handle: AppHandle,
) -> Result<Arc<WorkspaceSession>, String> {
    let cwd = PathBuf::from(&entry.path);
    if !cwd.is_dir() {
        return Err(format!("workspace path is not available: {}", entry.path));
    }

    let codex_bin = entry.codex_bin.clone().unwrap_or_else(default_codex_bin);
    let mut command = Command::new(&codex_bin);
    command.arg("app-server");
    command.current_dir(&entry.path);
    command.env("PATH", desktop_child_path());
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("failed to start Codex app-server with `{codex_bin}`: {e}"))?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let session = Arc::new(WorkspaceSession {
        entry: entry.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
    });

    let session_clone = Arc::clone(&session);
    let workspace_id = entry.id.clone();
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let value: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(err) => {
                    let payload = AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "codex/parseError",
                            "params": { "error": err.to_string(), "raw": line },
                        }),
                    };
                    let _ = app_handle_clone.emit("app-server-event", payload);
                    continue;
                }
            };

            let maybe_id = value.get("id").and_then(|id| id.as_u64());
            let has_method = value.get("method").is_some();
            let has_result_or_error = value.get("result").is_some() || value.get("error").is_some();
            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                        let _ = tx.send(value);
                    }
                } else if has_method {
                    let payload = AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: value,
                    };
                    let _ = app_handle_clone.emit("app-server-event", payload);
                } else if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                    let _ = tx.send(value);
                }
            } else if has_method {
                let payload = AppServerEvent {
                    workspace_id: workspace_id.clone(),
                    message: value,
                };
                let _ = app_handle_clone.emit("app-server-event", payload);
            }
        }

        let removed = {
            let state = app_handle_clone.state::<AppState>();
            let mut sessions = state.sessions.lock().await;
            match sessions.get(&workspace_id) {
                Some(existing) if Arc::ptr_eq(existing, &session_clone) => {
                    sessions.remove(&workspace_id);
                    true
                }
                _ => false,
            }
        };
        if removed {
            let payload = AppServerEvent {
                workspace_id: workspace_id.clone(),
                message: json!({
                    "method": "codex/disconnected",
                    "params": {
                        "workspaceId": workspace_id.clone(),
                        "reason": "The workspace session ended. Reconnect to continue."
                    },
                }),
            };
            let _ = app_handle_clone.emit("app-server-event", payload);
        }
    });

    let workspace_id = entry.id.clone();
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let payload = AppServerEvent {
                workspace_id: workspace_id.clone(),
                message: json!({
                    "method": "codex/stderr",
                    "params": { "message": line },
                }),
            };
            let _ = app_handle_clone.emit("app-server-event", payload);
        }
    });

    let init_params = json!({
        "clientInfo": {
            "name": "agent_workbench",
            "title": "Agent Workbench",
            "version": "0.1.0"
        }
    });
    session.send_request("initialize", init_params).await?;
    session.send_notification("initialized", None).await?;

    let payload = AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": entry.id.clone() }
        }),
    };
    let _ = app_handle.emit("app-server-event", payload);

    Ok(session)
}

#[tauri::command]
async fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceInfo>, String> {
    let workspaces = state.workspaces.lock().await;
    let sessions = state.sessions.lock().await;
    let mut result = Vec::new();
    for entry in workspaces.values() {
        result.push(WorkspaceInfo {
            id: entry.id.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            codex_bin: entry.codex_bin.clone(),
            connected: sessions.contains_key(&entry.id),
            settings: entry.settings.clone(),
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
async fn add_workspace(
    path: String,
    codex_bin: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    let normalized_codex_bin = match codex_bin {
        Some(value) => Some(validate_codex_bin_path(&value)?),
        None => None,
    };
    let canonical_path = canonicalize_workspace_path(&path)?;
    let name = PathBuf::from(&canonical_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Workspace")
        .to_string();
    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        path: canonical_path.clone(),
        codex_bin: normalized_codex_bin,
        settings: WorkspaceSettings::default(),
    };

    let session = spawn_workspace_session(entry.clone(), app).await?;
    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }
    state
        .sessions
        .lock()
        .await
        .insert(entry.id.clone(), session);

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        settings: entry.settings,
    })
}

#[tauri::command]
async fn remove_workspace(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.remove(&id);
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }

    if let Some(session) = state.sessions.lock().await.remove(&id) {
        let mut child = session.child.lock().await;
        let _ = child.kill().await;
    }

    Ok(())
}

#[tauri::command]
async fn update_workspace_settings(
    id: String,
    settings: WorkspaceSettings,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
    let (entry_snapshot, list) = {
        let mut workspaces = state.workspaces.lock().await;
        let entry_snapshot = match workspaces.get_mut(&id) {
            Some(entry) => {
                entry.settings = settings.clone();
                entry.clone()
            }
            None => return Err("workspace not found".to_string()),
        };
        let list: Vec<_> = workspaces.values().cloned().collect();
        (entry_snapshot, list)
    };
    write_workspaces(&state.storage_path, &list)?;

    let connected = state.sessions.lock().await.contains_key(&id);
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        settings: entry_snapshot.settings,
    })
}

#[tauri::command]
async fn update_workspace_codex_bin(
    id: String,
    codex_bin: Option<String>,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
    let normalized = codex_bin.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let normalized = match normalized {
        Some(value) => Some(validate_codex_bin_path(&value)?),
        None => None,
    };

    let (entry_snapshot, list) = {
        let mut workspaces = state.workspaces.lock().await;
        let entry_snapshot = match workspaces.get_mut(&id) {
            Some(entry) => {
                entry.codex_bin = normalized.clone();
                entry.clone()
            }
            None => return Err("workspace not found".to_string()),
        };
        let list: Vec<_> = workspaces.values().cloned().collect();
        (entry_snapshot, list)
    };
    write_workspaces(&state.storage_path, &list)?;

    let connected = state.sessions.lock().await.contains_key(&id);
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        settings: entry_snapshot.settings,
    })
}

#[tauri::command]
async fn start_thread(workspace_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "cwd": session.entry.path,
        "approvalPolicy": "on-request"
    });
    session.send_request("thread/start", params).await
}

#[tauri::command]
async fn resume_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "threadId": thread_id
    });
    session.send_request("thread/resume", params).await
}

#[tauri::command]
async fn list_threads(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "cursor": cursor,
        "limit": limit,
    });
    session.send_request("thread/list", params).await
}

#[tauri::command]
async fn archive_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "threadId": thread_id
    });
    session.send_request("thread/archive", params).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn send_user_message(
    workspace_id: String,
    thread_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    speed_mode: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = build_turn_start_params(
        &thread_id,
        &text,
        &session.entry.path,
        model,
        effort,
        access_mode,
        speed_mode,
    );
    session.send_request("turn/start", params).await
}

#[tauri::command]
async fn turn_interrupt(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "threadId": thread_id,
        "turnId": turn_id,
    });
    session.send_request("turn/interrupt", params).await
}

#[tauri::command]
async fn start_review(
    workspace_id: String,
    thread_id: String,
    target: Value,
    delivery: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let mut params = Map::new();
    params.insert("threadId".to_string(), json!(thread_id));
    params.insert("target".to_string(), target);
    if let Some(delivery) = delivery {
        params.insert("delivery".to_string(), json!(delivery));
    }
    session
        .send_request("review/start", Value::Object(params))
        .await
}
#[tauri::command]
async fn model_list(workspace_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({});
    session.send_request("model/list", params).await
}

#[tauri::command]
async fn account_rate_limits(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    session
        .send_request("account/rateLimits/read", Value::Null)
        .await
}

#[tauri::command]
async fn skills_list(workspace_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "cwd": session.entry.path
    });
    session.send_request("skills/list", params).await
}

#[tauri::command]
async fn respond_to_server_request(
    workspace_id: String,
    request_id: u64,
    result: Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    session.send_response(request_id, result).await
}

#[tauri::command]
async fn connect_workspace(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces.get(&id).cloned().ok_or("workspace not found")?
    };

    if let Some(existing) = state.sessions.lock().await.remove(&id) {
        let mut child = existing.child.lock().await;
        let _ = child.kill().await;
    }

    let session = spawn_workspace_session(entry.clone(), app).await?;
    state.sessions.lock().await.insert(entry.id, session);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = AppState::load(app.handle());
            app.manage(state);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_workspaces,
            add_workspace,
            remove_workspace,
            update_workspace_settings,
            update_workspace_codex_bin,
            start_thread,
            send_user_message,
            turn_interrupt,
            start_review,
            respond_to_server_request,
            resume_thread,
            list_threads,
            archive_thread,
            connect_workspace,
            model_list,
            account_rate_limits,
            skills_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        build_turn_start_params, default_codex_bin, desktop_child_path, validate_codex_bin_path,
    };
    use serde_json::json;
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        std::env::temp_dir().join(format!("agent-workbench-{name}-{suffix}"))
    }

    #[test]
    fn validate_codex_bin_path_rejects_non_absolute_paths() {
        let error = validate_codex_bin_path("codex").expect_err("expected validation error");
        assert!(error.contains("absolute file path"));
    }

    #[test]
    fn validate_codex_bin_path_accepts_existing_absolute_file() {
        let path = unique_temp_path("codex-bin");
        fs::write(&path, "#!/bin/sh\nexit 0\n").expect("failed to create temp file");
        #[cfg(unix)]
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
            .expect("failed to make temp file executable");
        let validated =
            validate_codex_bin_path(path.to_str().expect("temp path should be valid utf-8"))
                .expect("expected temp file path to validate");
        assert_eq!(
            validated,
            path.to_str().expect("temp path should be valid utf-8")
        );
        let _ = fs::remove_file(path);
    }

    #[test]
    #[cfg(unix)]
    fn validate_codex_bin_path_rejects_non_executable_file() {
        let path = unique_temp_path("codex-bin-not-executable");
        fs::write(&path, "#!/bin/sh\nexit 0\n").expect("failed to create temp file");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .expect("failed to set temp permissions");
        let error =
            validate_codex_bin_path(path.to_str().expect("temp path should be valid utf-8"))
                .expect_err("expected validation error");
        assert!(error.contains("not executable"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn default_codex_bin_prefers_absolute_executable_when_available() {
        let resolved = default_codex_bin();
        assert!(resolved == "codex" || resolved.starts_with('/'));
    }

    #[test]
    fn desktop_child_path_includes_usr_local_bin() {
        let path = desktop_child_path();
        assert!(path.split(':').any(|entry| entry == "/usr/local/bin"));
    }

    #[test]
    fn build_turn_start_params_keeps_approval_for_full_access() {
        let params = build_turn_start_params(
            "thread-1",
            "hello",
            "/workspace",
            Some("gpt-5.2-codex".to_string()),
            Some("high".to_string()),
            Some("full-access".to_string()),
            None,
        );
        assert_eq!(params["approvalPolicy"], json!("on-request"));
        assert_eq!(params["sandboxPolicy"]["type"], json!("dangerFullAccess"));
    }

    #[test]
    fn build_turn_start_params_uses_no_approval_for_yolo() {
        let params = build_turn_start_params(
            "thread-1",
            "hello",
            "/workspace",
            None,
            None,
            Some("yolo".to_string()),
            None,
        );
        assert_eq!(params["approvalPolicy"], json!("never"));
        assert_eq!(params["sandboxPolicy"]["type"], json!("dangerFullAccess"));
    }

    #[test]
    fn build_turn_start_params_sends_fast_service_tier() {
        let params = build_turn_start_params(
            "thread-1",
            "hello",
            "/workspace",
            None,
            None,
            Some("current".to_string()),
            Some("fast".to_string()),
        );
        assert_eq!(params["serviceTier"], json!("fast"));
    }

    #[test]
    fn build_turn_start_params_uses_workspace_write_for_current_access() {
        let params = build_turn_start_params(
            "thread-1",
            "hello",
            "/workspace",
            None,
            None,
            Some("current".to_string()),
            None,
        );
        assert_eq!(params["approvalPolicy"], json!("on-request"));
        assert_eq!(params["sandboxPolicy"]["type"], json!("workspaceWrite"));
        assert_eq!(
            params["sandboxPolicy"]["writableRoots"],
            json!(["/workspace"])
        );
        assert_eq!(params["sandboxPolicy"]["networkAccess"], json!(true));
    }
}
