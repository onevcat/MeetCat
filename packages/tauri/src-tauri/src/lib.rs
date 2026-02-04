//! MeetCat Tauri Application
//!
//! Main application logic with WebView script injection, IPC communication,
//! and background daemon for meeting scheduling.

mod daemon;
mod logging;
mod settings;
mod tray;

use daemon::{DaemonState, Meeting};
use logging::{now_ms, LogEventInput, LogManager};
use settings::{LogLevel, Settings, TAURI_DEFAULT_CHECK_INTERVAL_SECONDS};
use serde::Serialize;
use serde_json::json;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Listener, Manager, State, WebviewWindowBuilder, WebviewUrl, Url,
};
#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::webview::PageLoadEvent;
use tauri_plugin_opener::OpenerExt;
use tauri::async_runtime::JoinHandle;

const MEET_HOME_URL: &str = "https://meet.google.com/";

/// Application state shared across commands
pub struct AppState {
    pub settings: Mutex<Settings>,
    pub daemon: Mutex<DaemonState>,
    /// Handle to cancel the current join trigger timer
    pub join_trigger_handle: Mutex<Option<JoinHandle<()>>>,
    pub logger: Mutex<LogManager>,
}

impl Default for AppState {
    fn default() -> Self {
        let settings = Settings::load().unwrap_or_default();
        let logger = LogManager::new(&settings);
        Self {
            settings: Mutex::new(settings),
            daemon: Mutex::new(DaemonState::default()),
            join_trigger_handle: Mutex::new(None),
            logger: Mutex::new(logger),
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
    let settings = state.settings.lock().unwrap();
    AppStatus {
        enabled: daemon.is_running(),
        next_meeting: daemon.get_next_meeting(&settings),
        meetings: daemon.get_meetings(),
    }
}

/// Get joined meeting call IDs
#[tauri::command]
fn get_joined_meetings(state: State<AppState>) -> Vec<String> {
    let daemon = state.daemon.lock().unwrap();
    daemon.get_joined_meetings()
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
    let previous_settings = state.settings.lock().unwrap().clone();

    {
        let mut current = state.settings.lock().unwrap();
        *current = settings.clone();
        current.save().map_err(|e| e.to_string())?;
    }

    // Notify WebView of settings change
    app.emit("settings_changed", &settings)
        .map_err(|e| e.to_string())?;

    {
        let (changed_keys, changes) =
            build_settings_change_summary(&previous_settings, &settings);
        let mut logger = state.logger.lock().unwrap();
        logger.configure(&settings);
        logger.log_internal(
            LogLevel::Info,
            "settings",
            "settings.saved",
            None,
            Some(json!({
                "logCollectionEnabled": settings
                    .tauri
                    .as_ref()
                    .map(|t| t.log_collection_enabled)
                    .unwrap_or(false),
                "logLevel": settings
                    .tauri
                    .as_ref()
                    .map(|t| format!("{:?}", t.log_level).to_lowercase())
                    .unwrap_or("info".to_string()),
                "changedKeys": changed_keys,
                "changes": changes,
            })),
        );
    }

    // Refresh tray display with new settings
    let settings = state.settings.lock().unwrap().clone();
    let next_meeting = state.daemon.lock().unwrap().get_next_meeting(&settings);
    tray::update_tray_status(&app, next_meeting.as_ref());

    Ok(())
}

/// Start the auto-join daemon
#[tauri::command]
fn start_daemon(state: State<AppState>) {
    let mut daemon = state.daemon.lock().unwrap();
    daemon.start();

    let mut logger = state.logger.lock().unwrap();
    logger.log_internal(LogLevel::Info, "daemon", "daemon.start", None, None);
}

/// Stop the auto-join daemon
#[tauri::command]
fn stop_daemon(state: State<AppState>) {
    let mut daemon = state.daemon.lock().unwrap();
    daemon.stop();

    let mut logger = state.logger.lock().unwrap();
    logger.log_internal(LogLevel::Info, "daemon", "daemon.stop", None, None);
}

/// Log event from WebView
#[tauri::command]
fn log_event(state: State<AppState>, input: LogEventInput) {
    if let Ok(mut logger) = state.logger.lock() {
        logger.log_from_input(input, "webview");
    }
}

/// Schedule a precise join trigger for the next meeting
fn schedule_join_trigger(app: &AppHandle, state: &State<AppState>) {
    let settings = state.settings.lock().unwrap().clone();
    let daemon = state.daemon.lock().unwrap();
    let joined_count = daemon.get_joined_meetings().len();
    let suppressed_count = daemon.get_suppressed_meetings().len();

    // Cancel any existing trigger
    {
        let mut handle = state.join_trigger_handle.lock().unwrap();
        if let Some(h) = handle.take() {
            h.abort();
            println!("[MeetCat] Cancelled previous join trigger");
            log_app_event(
                app,
                LogLevel::Debug,
                "join",
                "trigger.cancelled",
                None,
                Some(json!({ "reason": "reschedule" })),
            );
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
        log_app_event(
            app,
            LogLevel::Info,
            "join",
            "trigger.scheduled",
            None,
            Some(json!({
                "callId": meeting.call_id,
                "title": meeting.title,
                "delayMs": delay_ms,
                "startsInMinutes": meeting.starts_in_minutes,
                "joinedCount": joined_count,
                "suppressedCount": suppressed_count,
            })),
        );

        // Spawn a task to trigger the join at the exact time
        let join_handle = tauri::async_runtime::spawn(async move {
            // Wait for the precise time
            if delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }

            println!("[MeetCat] Triggering join for: {}", meeting.title);
            log_app_event(
                &app_handle,
                LogLevel::Info,
                "join",
                "trigger.fired",
                None,
                Some(json!({
                    "callId": meeting.call_id,
                    "title": meeting.title,
                })),
            );

            // Mark the meeting as "triggered" BEFORE navigating
            // This prevents re-triggering if user cancels and goes back to homepage
            if let Some(state) = app_handle.try_state::<AppState>() {
                let mut daemon = state.daemon.lock().unwrap();
                daemon.mark_joined(&call_id);
                println!("[MeetCat] Marked meeting as triggered: {}", call_id);
                log_app_event(
                    &app_handle,
                    LogLevel::Debug,
                    "join",
                    "meeting.marked_joined",
                    None,
                    Some(json!({ "callId": call_id })),
                );
            }

            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
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
        log_app_event(
            app,
            LogLevel::Debug,
            "join",
            "trigger.none",
            None,
            None,
        );
    }
}

/// Receive meetings from WebView
#[tauri::command]
fn meetings_updated(app: AppHandle, state: State<AppState>, meetings: Vec<Meeting>) {
    let meeting_count = meetings.len();
    let first_meeting = meetings.first().cloned();
    {
        let mut daemon = state.daemon.lock().unwrap();
        daemon.update_meetings(meetings);
    }

    log_app_event(
        &app,
        LogLevel::Debug,
        "meetings",
        "meetings.updated",
        None,
        Some(json!({
            "count": meeting_count,
            "firstMeeting": first_meeting.as_ref().map(|m| {
                json!({
                    "callId": m.call_id,
                    "title": m.title,
                    "startsInMinutes": m.starts_in_minutes,
                })
            }),
        })),
    );

    // Schedule precise join trigger (this will cancel any existing trigger)
    schedule_join_trigger(&app, &state);

    // Update tray with next meeting info
    let settings = state.settings.lock().unwrap().clone();
    let next_meeting = state.daemon.lock().unwrap().get_next_meeting(&settings);
    tray::update_tray_status(&app, next_meeting.as_ref());
}

/// Mark a meeting as joined
#[tauri::command]
fn meeting_joined(app: AppHandle, state: State<AppState>, call_id: String) {
    {
        let mut daemon = state.daemon.lock().unwrap();
        daemon.mark_joined(&call_id);
    }

    log_app_event(
        &app,
        LogLevel::Info,
        "meetings",
        "meeting.joined",
        None,
        Some(json!({ "callId": call_id })),
    );

    // Re-schedule trigger for the next meeting
    schedule_join_trigger(&app, &state);
}

/// Mark a meeting as closed
#[tauri::command]
fn meeting_closed(app: AppHandle, state: State<AppState>, call_id: String, closed_at_ms: i64) {
    let settings = state.settings.lock().unwrap().clone();
    let mut matched = false;
    let mut trigger_at_ms: Option<i64> = None;
    {
        let mut daemon = state.daemon.lock().unwrap();
        if let Some(meeting) = daemon
            .get_meetings()
            .iter()
            .find(|m| m.call_id == call_id)
        {
            matched = true;
            let computed_trigger_at_ms =
                meeting.begin_time.timestamp_millis() - (settings.join_before_minutes as i64) * 60 * 1000;
            trigger_at_ms = Some(computed_trigger_at_ms);
            if closed_at_ms >= computed_trigger_at_ms {
                daemon.mark_suppressed(&call_id, closed_at_ms);
            }
        }
    }

    log_app_event(
        &app,
        LogLevel::Info,
        "meetings",
        "meeting.closed",
        None,
        Some(json!({
            "callId": call_id,
            "closedAtMs": closed_at_ms,
            "matched": matched,
            "triggerAtMs": trigger_at_ms,
            "joinBeforeMinutes": settings.join_before_minutes,
        })),
    );

    // Re-schedule trigger for the next meeting
    schedule_join_trigger(&app, &state);

    let next_meeting = state.daemon.lock().unwrap().get_next_meeting(&settings);
    tray::update_tray_status(&app, next_meeting.as_ref());
}

/// Get suppressed meeting call IDs
#[tauri::command]
fn get_suppressed_meetings(state: State<AppState>) -> Vec<String> {
    let daemon = state.daemon.lock().unwrap();
    daemon.get_suppressed_meetings()
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

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CheckMeetingsPayload {
    check_id: u64,
    interval_seconds: u32,
    emitted_at_ms: u64,
}

fn log_app_event(
    app: &AppHandle,
    level: LogLevel,
    module: &str,
    event: &str,
    message: Option<String>,
    context: Option<serde_json::Value>,
) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut logger) = state.logger.lock() {
            logger.log_internal(level, module, event, message, context);
        }
    }
}

fn build_settings_change_summary(
    before: &Settings,
    after: &Settings,
) -> (Vec<String>, serde_json::Value) {
    let mut changed_keys = Vec::new();
    let mut changes = serde_json::Map::new();

    add_change(
        "checkIntervalSeconds",
        before.check_interval_seconds,
        after.check_interval_seconds,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "joinBeforeMinutes",
        before.join_before_minutes,
        after.join_before_minutes,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "maxMinutesAfterStart",
        before.max_minutes_after_start,
        after.max_minutes_after_start,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "autoClickJoin",
        before.auto_click_join,
        after.auto_click_join,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "joinCountdownSeconds",
        before.join_countdown_seconds,
        after.join_countdown_seconds,
        &mut changed_keys,
        &mut changes,
    );
    if before.title_exclude_filters != after.title_exclude_filters {
        changed_keys.push("titleExcludeFilters".to_string());
        changes.insert(
            "titleExcludeFilters".to_string(),
            json!({
                "fromCount": before.title_exclude_filters.len(),
                "toCount": after.title_exclude_filters.len(),
            }),
        );
    }
    add_change(
        "defaultMicState",
        before.default_mic_state.clone(),
        after.default_mic_state.clone(),
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "defaultCameraState",
        before.default_camera_state.clone(),
        after.default_camera_state.clone(),
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "showCountdownOverlay",
        before.show_countdown_overlay,
        after.show_countdown_overlay,
        &mut changed_keys,
        &mut changes,
    );

    let before_tauri = before.tauri.clone().unwrap_or_default();
    let after_tauri = after.tauri.clone().unwrap_or_default();

    add_change(
        "tauri.startAtLogin",
        before_tauri.start_at_login,
        after_tauri.start_at_login,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "tauri.showTrayIcon",
        before_tauri.show_tray_icon,
        after_tauri.show_tray_icon,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "tauri.trayDisplayMode",
        before_tauri.tray_display_mode,
        after_tauri.tray_display_mode,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "tauri.trayShowMeetingTitle",
        before_tauri.tray_show_meeting_title,
        after_tauri.tray_show_meeting_title,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "tauri.logCollectionEnabled",
        before_tauri.log_collection_enabled,
        after_tauri.log_collection_enabled,
        &mut changed_keys,
        &mut changes,
    );
    add_change(
        "tauri.logLevel",
        before_tauri.log_level,
        after_tauri.log_level,
        &mut changed_keys,
        &mut changes,
    );

    (changed_keys, serde_json::Value::Object(changes))
}

fn add_change<T: Serialize + PartialEq>(
    key: &str,
    before: T,
    after: T,
    changed_keys: &mut Vec<String>,
    changes: &mut serde_json::Map<String, serde_json::Value>,
) {
    if before == after {
        return;
    }
    changed_keys.push(key.to_string());
    changes.insert(key.to_string(), json!({ "from": before, "to": after }));
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
        let app_handle = app_handle.clone();
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
                        log_app_event(
                            &app_handle,
                            LogLevel::Error,
                            "inject",
                            "script.inject_failed",
                            Some(e.to_string()),
                            Some(json!({ "window": "main" })),
                        );
                    } else {
                        log_app_event(
                            &app_handle,
                            LogLevel::Info,
                            "inject",
                            "script.injected",
                            None,
                            Some(json!({ "window": "main" })),
                        );
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
        let mut check_id: u64 = 0;
        loop {
            let interval_seconds = app_handle
                .try_state::<AppState>()
                .map(|state| {
                    state
                        .settings
                        .lock()
                        .unwrap()
                        .check_interval_seconds
                        .max(1)
                })
                .unwrap_or(TAURI_DEFAULT_CHECK_INTERVAL_SECONDS);

            check_id += 1;
            let payload = CheckMeetingsPayload {
                check_id,
                interval_seconds,
                emitted_at_ms: now_ms(),
            };

            // Emit check-meetings event to WebView
            if let Err(e) = app_handle.emit("check-meetings", payload.clone()) {
                eprintln!("Failed to emit check-meetings: {}", e);
                log_app_event(
                    &app_handle,
                    LogLevel::Error,
                    "daemon",
                    "check.emit_failed",
                    Some(e.to_string()),
                    Some(json!({
                        "checkId": payload.check_id,
                        "intervalSeconds": payload.interval_seconds,
                    })),
                );
            } else {
                log_app_event(
                    &app_handle,
                    LogLevel::Debug,
                    "daemon",
                    "check.emitted",
                    None,
                    Some(json!({
                        "checkId": payload.check_id,
                        "intervalSeconds": payload.interval_seconds,
                        "emittedAtMs": payload.emitted_at_ms,
                    })),
                );
            }

            tokio::time::sleep(Duration::from_secs(interval_seconds as u64)).await;
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

pub(crate) fn navigate_to_meet_home(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let url = Url::parse(MEET_HOME_URL).map_err(|e| e.to_string())?;
    window.navigate(url).map_err(|e| e.to_string())?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
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
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            // Wait for page to be ready
            tokio::time::sleep(Duration::from_millis(2000)).await;

            // Request media permissions
            if let Err(e) = window_clone.eval(REQUEST_MEDIA_SCRIPT) {
                eprintln!("Failed to request media permissions: {}", e);
                log_app_event(
                    &app_handle,
                    LogLevel::Warn,
                    "inject",
                    "media_permissions.failed",
                    Some(e.to_string()),
                    None,
                );
            }

            // Inject intercept script
            if let Err(e) = window_clone.eval(INTERCEPT_SCRIPT) {
                eprintln!("Failed to inject intercept script: {}", e);
                log_app_event(
                    &app_handle,
                    LogLevel::Error,
                    "inject",
                    "intercept.inject_failed",
                    Some(e.to_string()),
                    None,
                );
            } else {
                log_app_event(
                    &app_handle,
                    LogLevel::Debug,
                    "inject",
                    "intercept.injected",
                    None,
                    None,
                );
            }

            // Inject MeetCat script
            if let Err(e) = window_clone.eval(inject_script) {
                eprintln!("Failed to inject MeetCat script: {}", e);
                log_app_event(
                    &app_handle,
                    LogLevel::Error,
                    "inject",
                    "script.inject_failed",
                    Some(e.to_string()),
                    None,
                );
            } else {
                println!("MeetCat script injected successfully");
                log_app_event(
                    &app_handle,
                    LogLevel::Info,
                    "inject",
                    "script.injected",
                    None,
                    None,
                );
            }
        });
    }
}

/// Script to intercept new window requests
const INTERCEPT_SCRIPT: &str = r##"
(function() {
    if (window.__meetcatInterceptInstalled) return;
    window.__meetcatInterceptInstalled = true;

    const originalOpen = window.open ? window.open.bind(window) : null;

    function isMeetingPath(pathname) {
        const path = (pathname || "").replace(/\/+$/, "");
        if (path.startsWith("/lookup/")) {
            return true;
        }
        return /^\/[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/i.test(path);
    }

    function isMeetingPage() {
        return isMeetingPath(window.location.pathname);
    }

    function isMeetHost(href) {
        try {
            const parsed = new URL(href, window.location.origin);
            return parsed.host === "meet.google.com";
        } catch (e) {
            return false;
        }
    }

    document.addEventListener('click', function(e) {
        const link = e.target.closest('a[href]');
        if (!link || !link.href) return;

        const href = link.href;
        const target = (link.getAttribute('target') || "").toLowerCase();
        if (href.startsWith("javascript:") || href === "#") return;

        if (isMeetingPage()) {
            e.preventDefault();
            e.stopPropagation();
            if (isMeetHost(href)) {
                window.location.href = href;
            } else if (originalOpen) {
                originalOpen(href, "_blank");
            } else {
                window.location.href = href;
            }
            return;
        }

        if (target === "_blank" || target === "blank") {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = href;
        }
    }, true);

    window.open = function(url, target, features) {
        if (isMeetingPage()) {
            if (url && isMeetHost(url)) {
                try {
                    const parsed = new URL(url, window.location.origin);
                    window.location.href = parsed.href;
                    return null;
                } catch (e) {
                    return null;
                }
            }
            if (originalOpen) {
                return originalOpen(url, target, features);
            }
            return null;
        }
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
"##;

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
                                log_app_event(
                                    &app_handle,
                                    LogLevel::Warn,
                                    "inject",
                                    "intercept.inject_failed",
                                    Some(e.to_string()),
                                    Some(json!({ "url": url_str })),
                                );
                            } else {
                                log_app_event(
                                    &app_handle,
                                    LogLevel::Debug,
                                    "inject",
                                    "intercept.injected",
                                    None,
                                    Some(json!({ "url": url_str })),
                                );
                            }

                            // Inject MeetCat script
                            let script = get_inject_script();
                            if let Err(e) = window_clone.eval(script) {
                                eprintln!("Failed to inject MeetCat script: {}", e);
                                log_app_event(
                                    &app_handle,
                                    LogLevel::Warn,
                                    "inject",
                                    "script.inject_failed",
                                    Some(e.to_string()),
                                    Some(json!({ "url": url_str })),
                                );
                            } else {
                                println!("[MeetCat] Script injected for: {}", url_str);
                                log_app_event(
                                    &app_handle,
                                    LogLevel::Debug,
                                    "inject",
                                    "script.injected",
                                    None,
                                    Some(json!({ "url": url_str })),
                                );
                            }
                        }
                    }
                }
            }
        }
    });
}

fn is_meeting_path(path: &str) -> bool {
    let trimmed = path.trim_end_matches('/');
    if trimmed.starts_with("/lookup/") {
        return true;
    }

    let code = trimmed.trim_start_matches('/');
    if code.len() != 12 {
        return false;
    }

    let bytes = code.as_bytes();
    for (idx, byte) in bytes.iter().enumerate() {
        match idx {
            3 | 8 => {
                if *byte != b'-' {
                    return false;
                }
            }
            _ => {
                if !byte.is_ascii_alphanumeric() {
                    return false;
                }
            }
        }
    }

    true
}

fn is_meeting_url(url: &Url) -> bool {
    if url.host_str() != Some("meet.google.com") {
        return false;
    }
    is_meeting_path(url.path())
}

fn should_open_external(current_url: &Url, target_url: &Url) -> bool {
    if is_meeting_url(current_url) {
        return target_url.host_str() != Some("meet.google.com");
    }
    false
}

#[cfg(test)]
mod tests {
    use super::{is_meeting_path, is_meeting_url, should_open_external};
    use tauri::Url;

    #[test]
    fn test_is_meeting_path_code() {
        assert!(is_meeting_path("/abc-defg-hij"));
        assert!(is_meeting_path("/abc-defg-hij/"));
        assert!(!is_meeting_path("/ab-defg-hij"));
        assert!(!is_meeting_path("/abc-defg-hij/extra"));
    }

    #[test]
    fn test_is_meeting_path_lookup() {
        assert!(is_meeting_path("/lookup/abc-defg-hij"));
        assert!(is_meeting_path("/lookup/anything"));
    }

    #[test]
    fn test_is_meeting_path_home() {
        assert!(!is_meeting_path("/"));
        assert!(!is_meeting_path(""));
    }

    #[test]
    fn test_is_meeting_url() {
        let url = Url::parse("https://meet.google.com/abc-defg-hij").unwrap();
        assert!(is_meeting_url(&url));

        let home = Url::parse("https://meet.google.com/").unwrap();
        assert!(!is_meeting_url(&home));

        let other = Url::parse("https://example.com/abc-defg-hij").unwrap();
        assert!(!is_meeting_url(&other));
    }

    #[test]
    fn test_should_open_external_from_meeting() {
        let current = Url::parse("https://meet.google.com/abc-defg-hij").unwrap();
        let meet_target = Url::parse("https://meet.google.com/").unwrap();
        let external_target = Url::parse("https://example.com/").unwrap();

        assert!(!should_open_external(&current, &meet_target));
        assert!(should_open_external(&current, &external_target));
    }

    #[test]
    fn test_should_open_external_from_home() {
        let current = Url::parse("https://meet.google.com/").unwrap();
        let external_target = Url::parse("https://example.com/").unwrap();

        assert!(!should_open_external(&current, &external_target));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            None,
        ))
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

            #[cfg(target_os = "macos")]
            {
                let app_name = "MeetCat";
                let about_icon_bytes = include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/icons/icon.png"
                ));
                let about_icon = tauri::image::Image::from_bytes(about_icon_bytes)?;
                let mut about_metadata = AboutMetadata::default();
                about_metadata.name = Some(app_name.to_string());
                about_metadata.icon = Some(about_icon);

                let quit_item = MenuItem::with_id(
                    app,
                    "app-quit",
                    format!("Quit {}", app_name),
                    true,
                    Some("Cmd+Q"),
                )?;
                let go_home_item = MenuItem::with_id(
                    app,
                    "app-go-home",
                    "Back to Google Meet Home",
                    true,
                    Some("Cmd+Shift+H"),
                )?;

                let app_menu = SubmenuBuilder::with_id(app, "app", app_name)
                    .about(Some(about_metadata))
                    .item(&go_home_item)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .item(&quit_item)
                    .build()?;

                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .separator()
                    .select_all()
                    .build()?;

                let view_menu = SubmenuBuilder::new(app, "View")
                    .fullscreen()
                    .build()?;

                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .maximize()
                    .separator()
                    .close_window()
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&window_menu)
                    .build()?;

                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "app-quit" => app.exit(0),
                        "app-go-home" => {
                            if let Err(e) = navigate_to_meet_home(app) {
                                eprintln!(
                                    "Failed to navigate to Google Meet home: {}",
                                    e
                                );
                            }
                        }
                        _ => {}
                    }
                });
            }

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
                    let _ = features;
                    let current_url = app_handle
                        .get_webview_window("main")
                        .and_then(|window| window.url().ok())
                        .unwrap_or_else(|| Url::parse("https://meet.google.com/").unwrap());

                    if should_open_external(&current_url, &url) {
                        let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
                        return tauri::webview::NewWindowResponse::Deny;
                    }

                    if matches!(url.scheme(), "http" | "https") {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.navigate(url.clone());
                        }
                    } else {
                        let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
                    }
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
                let mut logger = state.logger.lock().unwrap();
                logger.log_internal(LogLevel::Info, "daemon", "daemon.start", Some("auto".to_string()), None);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_joined_meetings,
            get_suppressed_meetings,
            get_settings,
            save_settings,
            start_daemon,
            stop_daemon,
            meetings_updated,
            meeting_joined,
            meeting_closed,
            open_settings_window,
            log_event,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::Reopen { .. } => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            tauri::RunEvent::ExitRequested { .. } => {}
            _ => {}
        });
}
