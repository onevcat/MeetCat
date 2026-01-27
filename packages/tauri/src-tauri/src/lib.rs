//! MeetCat Tauri application (model wiring stage)

mod daemon;
mod settings;

use daemon::{DaemonState, Meeting};
use settings::Settings;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Application state shared across commands
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub daemon: Mutex<DaemonState>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings: Mutex::new(Settings::load().unwrap_or_default()),
            daemon: Mutex::new(DaemonState::default()),
        }
    }
}

/// Status response for frontend
#[derive(serde::Serialize)]
pub struct AppStatus {
    enabled: bool,
    next_meeting: Option<Meeting>,
    meetings: Vec<Meeting>,
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Get current application status
#[tauri::command]
fn get_status(state: State<AppState>) -> AppStatus {
    let daemon = state.daemon.lock().unwrap();
    AppStatus {
        enabled: daemon.is_running(),
        next_meeting: daemon.get_next_meeting(),
        meetings: daemon.get_meetings(),
    }
}

/// Get current settings
#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

/// Save settings
#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<(), String> {
    let mut current = state.settings.lock().unwrap();
    *current = settings.clone();
    current.save().map_err(|e| e.to_string())?;

    app.emit("settings_changed", &settings)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Receive meetings from WebView
#[tauri::command]
fn meetings_updated(state: State<AppState>, meetings: Vec<Meeting>) {
    let mut daemon = state.daemon.lock().unwrap();
    daemon.update_meetings(meetings);
}

/// Start the auto-join daemon
#[tauri::command]
fn start_daemon(state: State<AppState>) {
    let mut daemon = state.daemon.lock().unwrap();
    daemon.start();
}

/// Stop the auto-join daemon
#[tauri::command]
fn stop_daemon(state: State<AppState>) {
    let mut daemon = state.daemon.lock().unwrap();
    daemon.stop();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            // Start daemon by default
            let state = app.state::<AppState>();
            let mut daemon = state.daemon.lock().unwrap();
            daemon.start();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_settings,
            save_settings,
            meetings_updated,
            start_daemon,
            stop_daemon,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
