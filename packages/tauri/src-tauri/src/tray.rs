//! System tray functionality

use crate::daemon::Meeting;
use crate::settings::{LogLevel, TauriSettings, TrayDisplayMode};
use crate::{navigate_to_meet_home, AppState};
use serde_json::json;
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager,
};

/// Tray icon ID
const TRAY_ID: &str = "meetcat-tray";

/// Set up the system tray
pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let quit = MenuItem::with_id(app, "quit", "Quit MeetCat", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let go_home = MenuItem::with_id(
        app,
        "go-home",
        "Back to Google Meet Home",
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let status = MenuItem::with_id(app, "status", "No upcoming meetings", false, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&status)
        .item(&separator)
        .item(&show)
        .item(&go_home)
        .item(&settings)
        .item(&separator)
        .item(&quit)
        .build()?;

    let tray_icon_bytes = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/icons/tray-icon.png"
    ));
    let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .icon_as_template(false)
        .menu(&menu)
        .tooltip("MeetCat - Auto-join Google Meet")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                log_tray_event(app, LogLevel::Info, "menu.quit", None);
                app.exit(0);
            }
            "show" => {
                let mut ok = false;
                if let Some(window) = app.get_webview_window("main") {
                    ok = window.show().is_ok() && window.set_focus().is_ok();
                }
                if ok {
                    log_tray_event(app, LogLevel::Info, "menu.show", Some(json!({ "window": "main" })));
                } else {
                    log_tray_event(
                        app,
                        LogLevel::Warn,
                        "menu.show_failed",
                        Some(json!({ "window": "main" })),
                    );
                }
            }
            "go-home" => {
                if let Err(e) = navigate_to_meet_home(app) {
                    eprintln!("Failed to navigate to Google Meet home: {}", e);
                    log_tray_event(
                        app,
                        LogLevel::Error,
                        "menu.go_home_failed",
                        Some(json!({ "error": e })),
                    );
                } else {
                    log_tray_event(app, LogLevel::Info, "menu.go_home", None);
                }
            }
            "settings" => {
                if let Err(e) = open_settings(app) {
                    eprintln!("Failed to open settings: {}", e);
                    log_tray_event(
                        app,
                        LogLevel::Error,
                        "menu.settings_failed",
                        Some(json!({ "error": e })),
                    );
                } else {
                    log_tray_event(app, LogLevel::Info, "menu.settings", None);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                log_tray_event(
                    tray.app_handle(),
                    LogLevel::Info,
                    "icon.click",
                    Some(json!({ "button": "left", "state": "up" })),
                );
            }
        })
        .build(app)?;

    Ok(())
}

/// Open settings window
fn open_settings(app: &AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("MeetCat Settings")
        .inner_size(420.0, 640.0)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update tray status with next meeting info
pub fn update_tray_status(app: &AppHandle, meeting: Option<&Meeting>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    // Update tooltip
    let tooltip = match meeting {
        Some(m) => {
            let status = if m.starts_in_minutes > 0 {
                format!("in {} min", m.starts_in_minutes)
            } else if m.starts_in_minutes == 0 {
                "now".to_string()
            } else {
                format!("{} min ago", -m.starts_in_minutes)
            };
            format!("MeetCat - Next: {} ({})", m.title, status)
        }
        None => "MeetCat - No upcoming meetings".to_string(),
    };

    let _ = tray.set_tooltip(Some(&tooltip));

    // Update tray title based on settings
    let tray_settings = app
        .try_state::<AppState>()
        .and_then(|state| state.settings.lock().ok().and_then(|s| s.tauri.clone()))
        .unwrap_or_default();
    let title = build_tray_title(meeting, &tray_settings);
    let _ = tray.set_title(Some(&title));

    // Rebuild menu with updated status
    let status_text = match meeting {
        Some(m) => {
            let time_str = if m.starts_in_minutes > 0 {
                format!("in {} min", m.starts_in_minutes)
            } else if m.starts_in_minutes == 0 {
                "now".to_string()
            } else {
                format!("{} min ago", -m.starts_in_minutes)
            };
            format!("Next: {} ({})", truncate_title(&m.title, 25), time_str)
        }
        None => "No upcoming meetings".to_string(),
    };

    // Recreate menu with new status
    if let Ok(status_item) = MenuItem::with_id(app, "status", &status_text, false, None::<&str>) {
        if let Ok(quit) = MenuItem::with_id(app, "quit", "Quit MeetCat", true, None::<&str>) {
            if let Ok(show) = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>) {
                if let Ok(go_home) = MenuItem::with_id(
                    app,
                    "go-home",
                    "Back to Google Meet Home",
                    true,
                    None::<&str>,
                ) {
                    if let Ok(settings) =
                        MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)
                    {
                        if let Ok(sep1) = PredefinedMenuItem::separator(app) {
                            if let Ok(sep2) = PredefinedMenuItem::separator(app) {
                                if let Ok(new_menu) = MenuBuilder::new(app)
                                    .item(&status_item)
                                    .item(&sep1)
                                    .item(&show)
                                    .item(&go_home)
                                    .item(&settings)
                                    .item(&sep2)
                                    .item(&quit)
                                    .build()
                                {
                                    let _ = tray.set_menu(Some(new_menu));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Truncate title if too long
fn truncate_title(title: &str, max_len: usize) -> String {
    if max_len == 0 {
        return String::new();
    }

    let chars: Vec<char> = title.chars().collect();
    if chars.len() <= max_len {
        return title.to_string();
    }

    if max_len <= 3 {
        return chars.into_iter().take(max_len).collect();
    }

    let mut truncated: String = chars.into_iter().take(max_len - 3).collect();
    truncated.push_str("...");
    truncated
}

fn log_tray_event(
    app: &AppHandle,
    level: LogLevel,
    event: &str,
    context: Option<serde_json::Value>,
) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut logger) = state.logger.lock() {
            logger.log_internal(level, "tray", event, None, context);
        }
    }
}

fn format_countdown(starts_in_minutes: i64) -> String {
    if starts_in_minutes > 0 {
        format!("in {}m", starts_in_minutes)
    } else if starts_in_minutes == 0 {
        "now".to_string()
    } else {
        format!("{}m ago", -starts_in_minutes)
    }
}

fn build_tray_title(meeting: Option<&Meeting>, settings: &TauriSettings) -> String {
    if matches!(settings.tray_display_mode, TrayDisplayMode::IconOnly) {
        return String::new();
    }

    let Some(meeting) = meeting else {
        return String::new();
    };

    let base = match settings.tray_display_mode {
        TrayDisplayMode::IconWithTime => meeting.display_time.clone(),
        TrayDisplayMode::IconWithCountdown => format_countdown(meeting.starts_in_minutes),
        TrayDisplayMode::IconOnly => return String::new(),
    };

    if settings.tray_show_meeting_title {
        let truncated = truncate_title(&meeting.title, 24);
        if truncated.is_empty() {
            return base;
        }
        return format!("{} - {}", base, truncated);
    }

    base
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_title_short() {
        let title = "Short Title";
        let result = truncate_title(title, 25);
        assert_eq!(result, "Short Title");
    }

    #[test]
    fn test_truncate_title_exact_length() {
        let title = "Exactly Twenty Five Chars"; // 25 chars
        let result = truncate_title(title, 25);
        assert_eq!(result, title);
    }

    #[test]
    fn test_truncate_title_long() {
        let title = "This Is A Very Long Meeting Title That Should Be Truncated";
        let result = truncate_title(title, 25);
        assert_eq!(result, "This Is A Very Long Me...");
        assert_eq!(result.len(), 25);
    }

    #[test]
    fn test_truncate_title_with_unicode() {
        let title = "会议同步会";
        let result = truncate_title(title, 4);
        assert_eq!(result, "会...");
    }

    #[test]
    fn test_truncate_title_minimum() {
        let title = "ABCDEFGHIJ";
        let result = truncate_title(title, 5);
        assert_eq!(result, "AB...");
    }

    #[test]
    fn test_format_countdown() {
        assert_eq!(format_countdown(5), "in 5m");
        assert_eq!(format_countdown(0), "now");
        assert_eq!(format_countdown(-3), "3m ago");
    }

    #[test]
    fn test_build_tray_title_icon_only() {
        let meeting = create_test_meeting("Design Sync", "10:30 AM", 5);
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconOnly,
            ..TauriSettings::default()
        };

        assert_eq!(build_tray_title(Some(&meeting), &settings), "");
    }

    #[test]
    fn test_build_tray_title_time_with_name() {
        let meeting = create_test_meeting("Design Sync", "10:30 AM", 5);
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithTime,
            tray_show_meeting_title: true,
            ..TauriSettings::default()
        };

        assert_eq!(
            build_tray_title(Some(&meeting), &settings),
            "10:30 AM - Design Sync"
        );
    }

    #[test]
    fn test_build_tray_title_countdown_without_name() {
        let meeting = create_test_meeting("Design Sync", "10:30 AM", -2);
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithCountdown,
            tray_show_meeting_title: false,
            ..TauriSettings::default()
        };

        assert_eq!(build_tray_title(Some(&meeting), &settings), "2m ago");
    }

    #[test]
    fn test_build_tray_title_no_meeting() {
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithTime,
            tray_show_meeting_title: true,
            ..TauriSettings::default()
        };

        assert_eq!(build_tray_title(None, &settings), "");
    }

    fn create_test_meeting(title: &str, display_time: &str, starts_in_minutes: i64) -> Meeting {
        Meeting {
            call_id: "abc123".to_string(),
            url: "https://meet.google.com/abc123".to_string(),
            title: title.to_string(),
            display_time: display_time.to_string(),
            begin_time: chrono::Utc::now(),
            end_time: chrono::Utc::now(),
            event_id: None,
            starts_in_minutes,
        }
    }
}
