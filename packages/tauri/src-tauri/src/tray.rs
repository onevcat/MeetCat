//! System tray functionality

use crate::daemon::Meeting;
use crate::i18n::{self, keys, Language};
use crate::settings::{LogLevel, TauriSettings, TrayDisplayMode};
use crate::{
    ensure_settings_window, navigate_to_meet_home, request_manual_update_check,
    request_open_update_dialog, restore_main_window_visibility, AppState,
};
use chrono::{DateTime, Utc};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager,
};

/// Tray icon ID
const TRAY_ID: &str = "meetcat-tray";

/// Persistent menu items stored in Tauri managed state.
///
/// On macOS, NSMenuItem retains a reference to Rust-side data via muda's callback
/// mechanism. If the Rust `MenuItem` is dropped while macOS still references it
/// (e.g., during a pending click event after menu replacement), accessing the freed
/// String data causes a use-after-free crash. By storing all items here for the
/// app's lifetime, we guarantee the backing data remains valid.
struct TrayMenuItems {
    status: MenuItem<tauri::Wry>,
    show: MenuItem<tauri::Wry>,
    go_home: MenuItem<tauri::Wry>,
    settings_item: MenuItem<tauri::Wry>,
    check_update: MenuItem<tauri::Wry>,
    install_update: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
    /// Whether the install_update item is currently included in the menu
    update_in_menu: AtomicBool,
    /// Tracks the current language to avoid redundant set_text calls
    current_lang: Mutex<Language>,
}

/// Resolve the current Language from app state settings
fn resolve_language(app: &AppHandle) -> Language {
    app.try_state::<AppState>()
        .and_then(|state| {
            state
                .settings
                .lock()
                .ok()
                .map(|s| Language::from_setting(&s.language))
        })
        .unwrap_or_else(|| Language::from_setting("auto"))
}

/// Set up the system tray
pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let lang = Language::from_setting("auto");

    // Create all menu items once - they will be stored and reused forever
    let items = TrayMenuItems {
        status: MenuItem::with_id(app, "status", i18n::tr(&lang, keys::NO_UPCOMING_MEETINGS), false, None::<&str>)?,
        show: MenuItem::with_id(app, "show", i18n::tr(&lang, keys::SHOW_WINDOW), true, None::<&str>)?,
        go_home: MenuItem::with_id(
            app,
            "go-home",
            i18n::tr(&lang, keys::BACK_TO_GOOGLE_MEET_HOME),
            true,
            None::<&str>,
        )?,
        settings_item: MenuItem::with_id(app, "settings", i18n::tr(&lang, keys::SETTINGS), true, None::<&str>)?,
        check_update: MenuItem::with_id(
            app,
            "check-update",
            i18n::tr(&lang, keys::CHECK_FOR_UPDATES),
            true,
            None::<&str>,
        )?,
        install_update: MenuItem::with_id(app, "install-update", "", false, None::<&str>)?,
        quit: MenuItem::with_id(app, "quit", i18n::tr(&lang, keys::QUIT_MEETCAT), true, None::<&str>)?,
        update_in_menu: AtomicBool::new(false),
        current_lang: Mutex::new(lang.clone()),
    };

    // If an update is already available at startup, prepare the install_update item
    let has_update = available_update_version(app.handle());
    if let Some(ref version) = has_update {
        let _ = items.install_update.set_text(&i18n::tr_update_available(&lang, version));
        let _ = items.install_update.set_enabled(true);
        items.update_in_menu.store(true, Ordering::Relaxed);
    }

    // Build initial menu
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let mut menu_builder = MenuBuilder::new(app)
        .item(&items.status)
        .item(&sep1)
        .item(&items.show)
        .item(&items.go_home)
        .item(&items.settings_item)
        .item(&items.check_update);
    if has_update.is_some() {
        menu_builder = menu_builder.item(&items.install_update);
    }
    let menu = menu_builder
        .item(&sep2)
        .item(&items.quit)
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
        .tooltip(i18n::tr(&lang, keys::TOOLTIP))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                log_tray_event(app, LogLevel::Info, "menu.quit", None);
                app.exit(0);
            }
            "show" => {
                restore_main_window_visibility(app);
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
            "check-update" => {
                if let Err(e) = open_settings(app) {
                    eprintln!("Failed to open settings: {}", e);
                    log_tray_event(
                        app,
                        LogLevel::Error,
                        "menu.check_update_failed",
                        Some(json!({ "error": e })),
                    );
                } else {
                    request_manual_update_check(app);
                    request_open_update_dialog(app);
                    log_tray_event(app, LogLevel::Info, "menu.check_update", None);
                }
            }
            "install-update" => {
                if let Err(e) = open_settings(app) {
                    eprintln!("Failed to open settings: {}", e);
                    log_tray_event(
                        app,
                        LogLevel::Error,
                        "menu.install_update_failed",
                        Some(json!({ "error": e })),
                    );
                } else {
                    request_open_update_dialog(app);
                    log_tray_event(app, LogLevel::Info, "menu.install_update", None);
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
                restore_main_window_visibility(tray.app_handle());
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

    // Store items in Tauri managed state so they survive for the app's lifetime
    app.manage(items);

    Ok(())
}

/// Open settings window
fn open_settings(app: &AppHandle) -> Result<(), String> {
    ensure_settings_window(app)
}

/// Update tray status with next meeting info.
///
/// Uses `set_text()` on existing menu items instead of recreating them,
/// preventing the use-after-free crash on macOS.
pub fn update_tray_status(app: &AppHandle, meeting: Option<&Meeting>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    let lang = resolve_language(app);
    let now = Utc::now();

    // Update tooltip. The cached `starts_in_minutes` on the Meeting can be
    // stale (frozen if the webview stopped pushing updates), so always recompute
    // from begin_time. See issue #19.
    let tooltip = match meeting {
        Some(m) => {
            let live_minutes = starts_in_minutes_at(m.begin_time, now);
            let status = i18n::tr_time_status(&lang, live_minutes);
            i18n::tr_tooltip_with_meeting(&lang, &m.title, &status)
        }
        None => i18n::tr_tooltip_no_meetings(&lang),
    };

    let _ = tray.set_tooltip(Some(&tooltip));

    // Update tray title based on settings
    let tray_settings = app
        .try_state::<AppState>()
        .and_then(|state| state.settings.lock().ok().and_then(|s| s.tauri.clone()))
        .unwrap_or_default();
    let title = build_tray_title_at(meeting, &tray_settings, &lang, now);
    let _ = tray.set_title(Some(&title));

    let Some(items) = app.try_state::<TrayMenuItems>() else {
        return;
    };

    // Update all item texts when language changes
    {
        let mut current = items.current_lang.lock().unwrap();
        if *current != lang {
            let _ = items.show.set_text(i18n::tr(&lang, keys::SHOW_WINDOW));
            let _ = items.go_home.set_text(i18n::tr(&lang, keys::BACK_TO_GOOGLE_MEET_HOME));
            let _ = items.settings_item.set_text(i18n::tr(&lang, keys::SETTINGS));
            let _ = items.check_update.set_text(i18n::tr(&lang, keys::CHECK_FOR_UPDATES));
            let _ = items.quit.set_text(i18n::tr(&lang, keys::QUIT_MEETCAT));
            *current = lang.clone();
        }
    }

    // Update status text. Recompute from begin_time for the same reason as the
    // tooltip above (issue #19).
    let status_text = match meeting {
        Some(m) => {
            let live_minutes = starts_in_minutes_at(m.begin_time, now);
            let time_str = i18n::tr_time_status(&lang, live_minutes);
            i18n::tr_next_meeting(&lang, &truncate_title(&m.title, 25), &time_str)
        }
        None => i18n::tr(&lang, keys::NO_UPCOMING_MEETINGS).to_string(),
    };
    let _ = items.status.set_text(&status_text);

    // Sync update item: rebuild menu only when update availability changes
    let has_update = available_update_version(app);
    let was_in_menu = items.update_in_menu.load(Ordering::Relaxed);

    match (&has_update, was_in_menu) {
        (Some(version), false) => {
            // Update became available: enable item and rebuild menu to include it
            let _ = items.install_update.set_text(&i18n::tr_update_available(&lang, version));
            let _ = items.install_update.set_enabled(true);
            items.update_in_menu.store(true, Ordering::Relaxed);
            rebuild_menu_from_items(app, &items, true);
        }
        (None, true) => {
            // Update no longer available: rebuild menu to exclude it
            let _ = items.install_update.set_enabled(false);
            items.update_in_menu.store(false, Ordering::Relaxed);
            rebuild_menu_from_items(app, &items, false);
        }
        (Some(version), true) => {
            // Update still available, refresh text (language may have changed)
            let _ = items.install_update.set_text(&i18n::tr_update_available(&lang, version));
        }
        _ => {}
    }
}

/// Rebuild the tray menu using the stored (persistent) items.
///
/// This creates a new `Menu` structure but reuses the existing `MenuItem` objects.
/// Since items are Arc-based, both the new menu and `TrayMenuItems` hold references,
/// so items survive even after the old menu is dropped.
fn rebuild_menu_from_items(app: &AppHandle, items: &TrayMenuItems, include_update: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    let Ok(sep1) = PredefinedMenuItem::separator(app) else {
        return;
    };
    let Ok(sep2) = PredefinedMenuItem::separator(app) else {
        return;
    };

    let mut builder = MenuBuilder::new(app)
        .item(&items.status)
        .item(&sep1)
        .item(&items.show)
        .item(&items.go_home)
        .item(&items.settings_item)
        .item(&items.check_update);

    if include_update {
        builder = builder.item(&items.install_update);
    }

    if let Ok(menu) = builder.item(&sep2).item(&items.quit).build() {
        let _ = tray.set_menu(Some(menu));
    }
}

fn available_update_version(app: &AppHandle) -> Option<String> {
    app.try_state::<AppState>().and_then(|state| {
        state
            .update_info
            .lock()
            .ok()
            .and_then(|info| info.as_ref().map(|item| item.version.clone()))
    })
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

fn format_countdown(lang: &Language, starts_in_minutes: i64) -> String {
    i18n::tr_countdown_short(lang, starts_in_minutes)
}

/// Live-compute the minutes between `begin` and `now`, matching the frontend's
/// `Math.floor((beginTime - now) / 60000)` semantics. We use `div_euclid` so
/// negative deltas floor away from zero (e.g. -90s → -2, not -1).
pub(crate) fn starts_in_minutes_at(begin: DateTime<Utc>, now: DateTime<Utc>) -> i64 {
    let delta_ms = begin.timestamp_millis() - now.timestamp_millis();
    delta_ms.div_euclid(60_000)
}

fn build_tray_title_at(
    meeting: Option<&Meeting>,
    settings: &TauriSettings,
    lang: &Language,
    now: DateTime<Utc>,
) -> String {
    if matches!(settings.tray_display_mode, TrayDisplayMode::IconOnly) {
        return String::new();
    }

    let Some(meeting) = meeting else {
        return String::new();
    };

    let base = match settings.tray_display_mode {
        TrayDisplayMode::IconWithTime => meeting.display_time.clone(),
        TrayDisplayMode::IconWithCountdown => {
            format_countdown(lang, starts_in_minutes_at(meeting.begin_time, now))
        }
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
    use chrono::Duration;

    #[test]
    fn test_starts_in_minutes_at_exact_now() {
        let now = Utc::now();
        assert_eq!(starts_in_minutes_at(now, now), 0);
    }

    #[test]
    fn test_starts_in_minutes_at_future_whole_minute() {
        let now = Utc::now();
        assert_eq!(starts_in_minutes_at(now + Duration::minutes(5), now), 5);
    }

    #[test]
    fn test_starts_in_minutes_at_future_sub_minute_floors_to_zero() {
        let now = Utc::now();
        assert_eq!(starts_in_minutes_at(now + Duration::seconds(30), now), 0);
    }

    #[test]
    fn test_starts_in_minutes_at_future_partial_minute_floors_down() {
        let now = Utc::now();
        // 90s in the future → 1 min (floor(1.5) = 1), mirrors frontend Math.floor.
        assert_eq!(starts_in_minutes_at(now + Duration::seconds(90), now), 1);
    }

    #[test]
    fn test_starts_in_minutes_at_past_whole_minute() {
        let now = Utc::now();
        assert_eq!(starts_in_minutes_at(now - Duration::minutes(5), now), -5);
    }

    #[test]
    fn test_starts_in_minutes_at_past_sub_minute_floors_negative() {
        let now = Utc::now();
        // 30s in the past → floor(-0.5) = -1, not 0. Truncation toward zero would be wrong.
        assert_eq!(starts_in_minutes_at(now - Duration::seconds(30), now), -1);
    }

    #[test]
    fn test_starts_in_minutes_at_past_partial_minute_floors_down() {
        let now = Utc::now();
        // 90s in the past → floor(-1.5) = -2. This is the case that breaks naive i64 division.
        assert_eq!(starts_in_minutes_at(now - Duration::seconds(90), now), -2);
    }

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
        let lang = Language::En;
        assert_eq!(format_countdown(&lang, 5), "in 5m");
        assert_eq!(format_countdown(&lang, 0), "now");
        assert_eq!(format_countdown(&lang, -3), "3m ago");
    }

    #[test]
    fn test_build_tray_title_icon_only() {
        let now = Utc::now();
        let meeting = make_meeting_at("Design Sync", "10:30 AM", now + Duration::minutes(5), 5);
        let lang = Language::En;
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconOnly,
            ..TauriSettings::default()
        };

        assert_eq!(build_tray_title_at(Some(&meeting), &settings, &lang, now), "");
    }

    #[test]
    fn test_build_tray_title_time_with_name() {
        let now = Utc::now();
        let meeting = make_meeting_at("Design Sync", "10:30 AM", now + Duration::minutes(5), 5);
        let lang = Language::En;
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithTime,
            tray_show_meeting_title: true,
            ..TauriSettings::default()
        };

        assert_eq!(
            build_tray_title_at(Some(&meeting), &settings, &lang, now),
            "10:30 AM - Design Sync"
        );
    }

    #[test]
    fn test_build_tray_title_countdown_without_name() {
        let now = Utc::now();
        let meeting = make_meeting_at("Design Sync", "10:30 AM", now - Duration::minutes(2), -2);
        let lang = Language::En;
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithCountdown,
            tray_show_meeting_title: false,
            ..TauriSettings::default()
        };

        assert_eq!(
            build_tray_title_at(Some(&meeting), &settings, &lang, now),
            "2m ago"
        );
    }

    #[test]
    fn test_build_tray_title_no_meeting() {
        let now = Utc::now();
        let lang = Language::En;
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithTime,
            tray_show_meeting_title: true,
            ..TauriSettings::default()
        };

        assert_eq!(build_tray_title_at(None, &settings, &lang, now), "");
    }

    /// Core regression for issue #19: even when the cached starts_in_minutes
    /// field is stale (frozen because the webview stopped pushing), the tray
    /// title must reflect the real time delta computed from begin_time.
    #[test]
    fn test_build_tray_title_ignores_stale_cached_starts_in_minutes() {
        let now = Utc::now();
        // Begin time is 5 minutes in the future, but the cached field claims
        // "1 minute" — the kind of stale value the daemon would hold onto if
        // the webview stopped reporting. The tray title must trust begin_time.
        let meeting = make_meeting_at("Daily Sync", "10:30 AM", now + Duration::minutes(5), 1);
        let lang = Language::En;
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithCountdown,
            tray_show_meeting_title: false,
            ..TauriSettings::default()
        };

        assert_eq!(
            build_tray_title_at(Some(&meeting), &settings, &lang, now),
            "in 5m"
        );
    }

    /// The cross-minute floor — begin = now + 90s should display "in 1m",
    /// matching the frontend's Math.floor behavior.
    #[test]
    fn test_build_tray_title_floors_cross_minute_boundary() {
        let now = Utc::now();
        let meeting = make_meeting_at("Standup", "09:00 AM", now + Duration::seconds(90), 1);
        let lang = Language::En;
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithCountdown,
            tray_show_meeting_title: false,
            ..TauriSettings::default()
        };

        assert_eq!(
            build_tray_title_at(Some(&meeting), &settings, &lang, now),
            "in 1m"
        );
    }

    #[test]
    fn test_build_tray_title_countdown_with_long_title_truncates() {
        let now = Utc::now();
        let meeting = make_meeting_at(
            "This Is A Very Long Meeting Title That Should Be Truncated",
            "09:00 AM",
            now + Duration::minutes(3),
            3,
        );
        let lang = Language::En;
        let settings = TauriSettings {
            tray_display_mode: TrayDisplayMode::IconWithCountdown,
            tray_show_meeting_title: true,
            ..TauriSettings::default()
        };

        // 24-char truncation budget for the title portion; format is "<base> - <title>".
        assert_eq!(
            build_tray_title_at(Some(&meeting), &settings, &lang, now),
            "in 3m - This Is A Very Long M..."
        );
    }

    fn make_meeting_at(
        title: &str,
        display_time: &str,
        begin: DateTime<Utc>,
        cached_starts_in_minutes: i64,
    ) -> Meeting {
        Meeting {
            call_id: "abc123".to_string(),
            url: "https://meet.google.com/abc123".to_string(),
            title: title.to_string(),
            display_time: display_time.to_string(),
            begin_time: begin,
            end_time: begin + Duration::minutes(30),
            event_id: None,
            starts_in_minutes: cached_starts_in_minutes,
        }
    }
}
