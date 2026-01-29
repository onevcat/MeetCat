//! MeetCat Tauri Application
//!
//! Main application logic with WebView script injection, IPC communication,
//! and background daemon for meeting scheduling.

mod daemon;
mod settings;
mod tray;

use daemon::{DaemonState, Meeting};
use settings::Settings;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Listener, Manager, State, WebviewWindowBuilder, WebviewUrl,
};
use tauri::webview::PageLoadEvent;
use tauri_plugin_notification::NotificationExt;
use tauri::async_runtime::JoinHandle;

/// Application state shared across commands
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub daemon: Mutex<DaemonState>,
    /// Handle to cancel the current join trigger timer
    pub join_trigger_handle: Mutex<Option<JoinHandle<()>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings: Mutex::new(Settings::load().unwrap_or_default()),
            daemon: Mutex::new(DaemonState::default()),
            join_trigger_handle: Mutex::new(None),
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

    // Notify WebView of settings change
    app.emit("settings_changed", &settings)
        .map_err(|e| e.to_string())?;

    Ok(())
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

/// Schedule a precise join trigger for the next meeting
fn schedule_join_trigger(app: &AppHandle, state: &State<AppState>) {
    let settings = state.settings.lock().unwrap().clone();
    let daemon = state.daemon.lock().unwrap();

    // Cancel any existing trigger
    {
        let mut handle = state.join_trigger_handle.lock().unwrap();
        if let Some(h) = handle.take() {
            h.abort();
            println!("[MeetCat] Cancelled previous join trigger");
        }
    }

    // Calculate next trigger time
    if let Some(trigger) = daemon.calculate_next_trigger(&settings) {
        let meeting = trigger.meeting.clone();
        let delay_ms = trigger.delay_ms;
        let app_handle = app.clone();
        let settings_for_join = settings.clone();
        let call_id = meeting.call_id.clone();

        println!(
            "[MeetCat] Scheduling join for \"{}\" in {}ms ({:.1} minutes)",
            meeting.title,
            delay_ms,
            delay_ms as f64 / 60000.0
        );

        // Spawn a task to trigger the join at the exact time
        let join_handle = tauri::async_runtime::spawn(async move {
            // Wait for the precise time
            if delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }

            println!("[MeetCat] Triggering join for: {}", meeting.title);

            // Mark the meeting as "triggered" BEFORE navigating
            // This prevents re-triggering if user cancels and goes back to homepage
            if let Some(state) = app_handle.try_state::<AppState>() {
                let mut daemon = state.daemon.lock().unwrap();
                daemon.mark_joined(&call_id);
                println!("[MeetCat] Marked meeting as triggered: {}", call_id);
            }

            // Emit navigate-and-join command to WebView
            let cmd = NavigateAndJoinCommand {
                url: meeting.url.clone(),
                settings: settings_for_join,
            };

            if let Err(e) = app_handle.emit("navigate-and-join", &cmd) {
                eprintln!("[MeetCat] Failed to emit navigate-and-join: {}", e);
            }
        });

        // Store the handle so we can cancel it later
        let mut handle = state.join_trigger_handle.lock().unwrap();
        *handle = Some(join_handle);
    } else {
        println!("[MeetCat] No meeting to schedule trigger for");
    }
}

/// Receive meetings from WebView
#[tauri::command]
fn meetings_updated(app: AppHandle, state: State<AppState>, meetings: Vec<Meeting>) {
    {
        let mut daemon = state.daemon.lock().unwrap();
        daemon.update_meetings(meetings);
    }

    // Schedule precise join trigger (this will cancel any existing trigger)
    schedule_join_trigger(&app, &state);

    // Update tray with next meeting info
    let daemon = state.daemon.lock().unwrap();
    if let Some(next) = daemon.get_next_meeting() {
        tray::update_tray_status(&app, Some(&next));
    } else {
        tray::update_tray_status(&app, None);
    }
}

/// Mark a meeting as joined
#[tauri::command]
fn meeting_joined(app: AppHandle, state: State<AppState>, call_id: String) {
    {
        let mut daemon = state.daemon.lock().unwrap();
        daemon.mark_joined(&call_id);
    }

    // Re-schedule trigger for the next meeting
    schedule_join_trigger(&app, &state);
}

/// Show a notification
#[tauri::command]
fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

/// Open the settings window
#[tauri::command]
fn open_settings_window(app: AppHandle) -> Result<(), String> {
    // Check if settings window already exists
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Create new settings window
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("index.html".into()))
        .title("MeetCat Settings")
        .inner_size(420.0, 640.0)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

// =============================================================================
// Command payload types
// =============================================================================

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NavigateAndJoinCommand {
    url: String,
    settings: Settings,
}

// =============================================================================
// Application setup
// =============================================================================

/// Get the injectable script content
fn get_inject_script() -> &'static str {
    include_str!("../../../core/dist/meetcat-inject.global.js")
}

/// Set up script injection for the main window
fn setup_script_injection(app: &AppHandle) {
    let app_handle = app.clone();

    // Listen for page load events to inject script
    app.listen("tauri://webview-created", move |event| {
        let payload = event.payload();
        // Only inject into main window (Google Meet)
        if payload.contains("\"main\"") || payload.contains("main") {
            if let Some(window) = app_handle.get_webview_window("main") {
                let script = get_inject_script();
                // Inject after a short delay to ensure page is ready
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(1000)).await;
                    if let Err(e) = window_clone.eval(script) {
                        eprintln!("Failed to inject script: {}", e);
                    }
                });
            }
        }
    });
}

/// Set up the background daemon that triggers meeting checks
fn setup_daemon(app: &AppHandle) {
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));

        loop {
            interval.tick().await;

            // Emit check-meetings event to WebView
            if let Err(e) = app_handle.emit("check-meetings", ()) {
                eprintln!("Failed to emit check-meetings: {}", e);
            }
        }
    });
}

/// Set up window lifecycle (hide instead of close)
fn setup_window_lifecycle(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();

        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent close, hide instead
                api.prevent_close();
                let _ = window_clone.hide();
            }
        });
    }
}

/// Script to request media permissions early
const REQUEST_MEDIA_SCRIPT: &str = r#"
(function() {
    if (window.__meetcatMediaRequested) return;
    window.__meetcatMediaRequested = true;

    // Request media permissions proactively
    navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(stream => {
            console.log('[MeetCat] Media permissions granted');
            // Stop the tracks immediately, we just needed the permission
            stream.getTracks().forEach(track => track.stop());
        })
        .catch(err => {
            console.warn('[MeetCat] Media permission request:', err.name);
        });
})();
"#;

/// Initial script injection for main window
fn setup_new_window_handler(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        let inject_script = get_inject_script();
        tauri::async_runtime::spawn(async move {
            // Wait for page to be ready
            tokio::time::sleep(Duration::from_millis(2000)).await;

            // Request media permissions
            if let Err(e) = window_clone.eval(REQUEST_MEDIA_SCRIPT) {
                eprintln!("Failed to request media permissions: {}", e);
            }

            // Inject intercept script
            if let Err(e) = window_clone.eval(INTERCEPT_SCRIPT) {
                eprintln!("Failed to inject intercept script: {}", e);
            }

            // Inject MeetCat script
            if let Err(e) = window_clone.eval(inject_script) {
                eprintln!("Failed to inject MeetCat script: {}", e);
            } else {
                println!("MeetCat script injected successfully");
            }
        });
    }
}

/// Script to intercept new window requests
const INTERCEPT_SCRIPT: &str = r#"
(function() {
    if (window.__meetcatInterceptInstalled) return;
    window.__meetcatInterceptInstalled = true;

    document.addEventListener('click', function(e) {
        const link = e.target.closest('a[target="_blank"], a[target="blank"]');
        if (link && link.href) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = link.href;
        }
    }, true);

    const originalOpen = window.open;
    window.open = function(url, target, features) {
        if (url) {
            try {
                const parsedUrl = new URL(url, window.location.origin);
                window.location.href = parsedUrl.href;
                return null;
            } catch (e) {}
        }
        return originalOpen.call(window, url, target, features);
    };
    console.log('[MeetCat] Intercept script installed');
})();
"#;

/// Inject script when navigating to Google pages
fn setup_navigation_injection(app: &AppHandle) {
    let app_handle = app.clone();

    // Use periodic URL check as Tauri 2.x navigation events may not fire reliably
    tauri::async_runtime::spawn(async move {
        let mut last_url = String::new();
        let mut interval = tokio::time::interval(Duration::from_millis(500));

        loop {
            interval.tick().await;

            if let Some(window) = app_handle.get_webview_window("main") {
                if let Ok(url) = window.url() {
                    let url_str = url.to_string();

                    // Check if URL changed
                    if url_str != last_url {
                        println!("[MeetCat] URL changed: {} -> {}", last_url, url_str);
                        last_url = url_str.clone();

                        // Re-inject scripts on meet.google.com
                        if url.host_str().map_or(false, |h| h == "meet.google.com") {
                            let window_clone = window.clone();
                            // Wait for page to load
                            tokio::time::sleep(Duration::from_millis(1500)).await;

                            // Inject intercept script
                            if let Err(e) = window_clone.eval(INTERCEPT_SCRIPT) {
                                eprintln!("Failed to inject intercept script: {}", e);
                            }

                            // Inject MeetCat script
                            let script = get_inject_script();
                            if let Err(e) = window_clone.eval(script) {
                                eprintln!("Failed to inject MeetCat script: {}", e);
                            } else {
                                println!("[MeetCat] Script injected for: {}", url_str);
                            }
                        }
                    }
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState::default())
        .on_page_load(|webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }

            if webview.label() != "main" {
                return;
            }

            let url = payload.url();
            if url.host_str() != Some("meet.google.com") {
                return;
            }

            let webview = webview.clone();
            let url_str = url.to_string();

            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(500)).await;

                if let Err(e) = webview.eval(INTERCEPT_SCRIPT) {
                    eprintln!("Failed to inject intercept script: {}", e);
                }

                let script = get_inject_script();
                if let Err(e) = webview.eval(script) {
                    eprintln!("Failed to inject MeetCat script: {}", e);
                } else {
                    println!("[MeetCat] Script injected on page load: {}", url_str);
                }
            });
        })
        .setup(|app| {
            // Set up system tray
            tray::setup_tray(app)?;

            // Set up script injection
            setup_script_injection(app.handle());

            // Set up navigation injection
            setup_navigation_injection(app.handle());

            // Create main window with a custom new-window handler
            let main_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "Missing main window config",
                    )
                })?;

            let app_handle = app.handle().clone();
            WebviewWindowBuilder::from_config(app.handle(), main_config)?
                .on_new_window(move |url, features| {
                    if matches!(url.scheme(), "http" | "https") {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.navigate(url.clone());
                        }
                    }

                    let _ = features;
                    tauri::webview::NewWindowResponse::Deny
                })
                .build()?;

            // Set up window lifecycle
            setup_window_lifecycle(app.handle());

            // Set up new window handler
            setup_new_window_handler(app.handle());

            // Set up background daemon
            setup_daemon(app.handle());

            // Start daemon by default
            {
                let state = app.state::<AppState>();
                let mut daemon = state.daemon.lock().unwrap();
                daemon.start();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_settings,
            save_settings,
            start_daemon,
            stop_daemon,
            meetings_updated,
            meeting_joined,
            show_notification,
            open_settings_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}
