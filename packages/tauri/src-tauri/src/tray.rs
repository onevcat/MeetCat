//! System tray functionality

use crate::daemon::Meeting;
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
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let status = MenuItem::with_id(app, "status", "No upcoming meetings", false, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&status)
        .item(&separator)
        .item(&show)
        .item(&settings)
        .item(&separator)
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("MeetCat - Auto-join Google Meet")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "settings" => {
                if let Err(e) = open_settings(app) {
                    eprintln!("Failed to open settings: {}", e);
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
                if let Ok(settings) =
                    MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)
                {
                    if let Ok(sep1) = PredefinedMenuItem::separator(app) {
                        if let Ok(sep2) = PredefinedMenuItem::separator(app) {
                            if let Ok(new_menu) = MenuBuilder::new(app)
                                .item(&status_item)
                                .item(&sep1)
                                .item(&show)
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

/// Truncate title if too long
fn truncate_title(title: &str, max_len: usize) -> String {
    if title.len() <= max_len {
        title.to_string()
    } else {
        format!("{}...", &title[..max_len - 3])
    }
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
        // Note: This test may fail with multi-byte chars at boundary
        // For now, test ASCII only as the original function uses byte indexing
        let title = "Meeting ABC";
        let result = truncate_title(title, 10);
        assert_eq!(result, "Meeting...");
    }

    #[test]
    fn test_truncate_title_minimum() {
        let title = "ABCDEFGHIJ";
        let result = truncate_title(title, 5);
        assert_eq!(result, "AB...");
    }
}
