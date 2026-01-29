//! Settings management for MeetCat

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SettingsError {
    #[error("Failed to read settings file: {0}")]
    ReadError(#[from] std::io::Error),

    #[error("Failed to parse settings: {0}")]
    ParseError(#[from] serde_json::Error),

    #[error("Failed to get config directory")]
    ConfigDirError,
}

/// Media state options
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaState {
    #[default]
    Muted,
    Unmuted,
}

/// Tray display options
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TrayDisplayMode {
    #[default]
    IconOnly,
    IconWithTime,
    IconWithCountdown,
}

/// Tauri-specific settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TauriSettings {
    #[serde(default = "default_quit_to_hide")]
    pub quit_to_hide: bool,

    #[serde(default = "default_start_at_login")]
    pub start_at_login: bool,

    #[serde(default = "default_show_tray_icon")]
    pub show_tray_icon: bool,

    #[serde(default = "default_tray_display_mode")]
    pub tray_display_mode: TrayDisplayMode,

    #[serde(default = "default_tray_show_meeting_title")]
    pub tray_show_meeting_title: bool,
}

impl Default for TauriSettings {
    fn default() -> Self {
        let defaults = defaults();
        Self {
            quit_to_hide: defaults.tauri.quit_to_hide,
            start_at_login: defaults.tauri.start_at_login,
            show_tray_icon: defaults.tauri.show_tray_icon,
            tray_display_mode: defaults.tauri.tray_display_mode.clone(),
            tray_show_meeting_title: defaults.tauri.tray_show_meeting_title,
        }
    }
}

/// Main settings structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    // Timing
    #[serde(default = "default_check_interval")]
    pub check_interval_seconds: u32,

    #[serde(default = "default_join_before")]
    pub join_before_minutes: u32,

    #[serde(default = "default_max_minutes_after_start")]
    pub max_minutes_after_start: u32,

    // Join behavior
    #[serde(default = "default_auto_click_join")]
    pub auto_click_join: bool,

    #[serde(default = "default_countdown")]
    pub join_countdown_seconds: u32,

    #[serde(default = "default_title_exclude_filters")]
    pub title_exclude_filters: Vec<String>,

    // Media defaults
    #[serde(default = "default_mic_state")]
    pub default_mic_state: MediaState,

    #[serde(default = "default_camera_state")]
    pub default_camera_state: MediaState,

    // UI
    #[serde(default = "default_show_notifications")]
    pub show_notifications: bool,

    #[serde(default = "default_show_countdown_overlay")]
    pub show_countdown_overlay: bool,

    // Platform-specific
    #[serde(default)]
    pub tauri: Option<TauriSettings>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DefaultsTauriSettings {
    quit_to_hide: bool,
    start_at_login: bool,
    show_tray_icon: bool,
    tray_display_mode: TrayDisplayMode,
    tray_show_meeting_title: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DefaultsFile {
    check_interval_seconds: u32,
    join_before_minutes: u32,
    max_minutes_after_start: u32,
    auto_click_join: bool,
    join_countdown_seconds: u32,
    title_exclude_filters: Vec<String>,
    default_mic_state: MediaState,
    default_camera_state: MediaState,
    show_notifications: bool,
    show_countdown_overlay: bool,
    tauri: DefaultsTauriSettings,
}

fn defaults() -> &'static DefaultsFile {
    static DEFAULTS: OnceLock<DefaultsFile> = OnceLock::new();
    DEFAULTS.get_or_init(|| {
        let raw = include_str!("../../../settings/src/defaults.json");
        serde_json::from_str(raw).expect("Failed to parse shared defaults.json")
    })
}

fn default_check_interval() -> u32 {
    defaults().check_interval_seconds
}

fn default_join_before() -> u32 {
    defaults().join_before_minutes
}

fn default_max_minutes_after_start() -> u32 {
    defaults().max_minutes_after_start
}

fn default_auto_click_join() -> bool {
    defaults().auto_click_join
}

fn default_countdown() -> u32 {
    defaults().join_countdown_seconds
}

fn default_title_exclude_filters() -> Vec<String> {
    defaults().title_exclude_filters.clone()
}

fn default_mic_state() -> MediaState {
    defaults().default_mic_state.clone()
}

fn default_camera_state() -> MediaState {
    defaults().default_camera_state.clone()
}

fn default_show_notifications() -> bool {
    defaults().show_notifications
}

fn default_show_countdown_overlay() -> bool {
    defaults().show_countdown_overlay
}

fn default_quit_to_hide() -> bool {
    defaults().tauri.quit_to_hide
}

fn default_start_at_login() -> bool {
    defaults().tauri.start_at_login
}

fn default_show_tray_icon() -> bool {
    defaults().tauri.show_tray_icon
}

fn default_tray_display_mode() -> TrayDisplayMode {
    defaults().tauri.tray_display_mode.clone()
}

fn default_tray_show_meeting_title() -> bool {
    defaults().tauri.tray_show_meeting_title
}

impl Default for Settings {
    fn default() -> Self {
        let defaults = defaults();
        Self {
            check_interval_seconds: defaults.check_interval_seconds,
            join_before_minutes: defaults.join_before_minutes,
            max_minutes_after_start: defaults.max_minutes_after_start,
            auto_click_join: defaults.auto_click_join,
            join_countdown_seconds: defaults.join_countdown_seconds,
            title_exclude_filters: defaults.title_exclude_filters.clone(),
            default_mic_state: defaults.default_mic_state.clone(),
            default_camera_state: defaults.default_camera_state.clone(),
            show_notifications: defaults.show_notifications,
            show_countdown_overlay: defaults.show_countdown_overlay,
            tauri: Some(TauriSettings::default()),
        }
    }
}

impl Settings {
    /// Get the settings file path
    fn get_path() -> Result<PathBuf, SettingsError> {
        let config_dir = dirs::config_dir().ok_or(SettingsError::ConfigDirError)?;
        let app_dir = config_dir.join("meetcat");
        fs::create_dir_all(&app_dir)?;
        Ok(app_dir.join("settings.json"))
    }

    /// Load settings from file
    pub fn load() -> Result<Self, SettingsError> {
        let path = Self::get_path()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path)?;
        let settings: Settings = serde_json::from_str(&content)?;
        Ok(settings)
    }

    /// Save settings to file
    pub fn save(&self) -> Result<(), SettingsError> {
        let path = Self::get_path()?;
        let content = serde_json::to_string_pretty(self)?;
        fs::write(&path, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = Settings::default();
        assert_eq!(settings.check_interval_seconds, 30);
        assert_eq!(settings.join_before_minutes, 1);
        assert_eq!(settings.max_minutes_after_start, 10);
        assert!(settings.auto_click_join);
        assert_eq!(settings.join_countdown_seconds, 20);
        assert_eq!(settings.default_mic_state, MediaState::Muted);
        assert!(settings.title_exclude_filters.is_empty());
        assert!(settings.show_notifications);
        assert!(settings.show_countdown_overlay);
    }

    #[test]
    fn test_serialize_deserialize() {
        let settings = Settings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let parsed: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.check_interval_seconds, settings.check_interval_seconds);
    }

    #[test]
    fn test_default_tauri_settings() {
        let tauri_settings = TauriSettings::default();
        assert!(tauri_settings.quit_to_hide);
        assert!(!tauri_settings.start_at_login);
        assert!(tauri_settings.show_tray_icon);
        assert_eq!(tauri_settings.tray_display_mode, TrayDisplayMode::IconOnly);
        assert!(!tauri_settings.tray_show_meeting_title);
    }

    #[test]
    fn test_media_state_default() {
        let state = MediaState::default();
        assert_eq!(state, MediaState::Muted);
    }

    #[test]
    fn test_media_state_serialization() {
        let muted = MediaState::Muted;
        let unmuted = MediaState::Unmuted;

        assert_eq!(serde_json::to_string(&muted).unwrap(), "\"muted\"");
        assert_eq!(serde_json::to_string(&unmuted).unwrap(), "\"unmuted\"");
    }

    #[test]
    fn test_media_state_deserialization() {
        let muted: MediaState = serde_json::from_str("\"muted\"").unwrap();
        let unmuted: MediaState = serde_json::from_str("\"unmuted\"").unwrap();

        assert_eq!(muted, MediaState::Muted);
        assert_eq!(unmuted, MediaState::Unmuted);
    }

    #[test]
    fn test_settings_partial_deserialize_with_defaults() {
        let json = r#"{"joinBeforeMinutes": 5}"#;
        let settings: Settings = serde_json::from_str(json).unwrap();

        assert_eq!(settings.join_before_minutes, 5);
        // Other fields should use defaults
        assert_eq!(settings.check_interval_seconds, 30);
        assert_eq!(settings.max_minutes_after_start, 10);
        assert!(settings.auto_click_join);
        assert_eq!(settings.default_mic_state, MediaState::Muted);
    }

    #[test]
    fn test_settings_with_title_filters() {
        let json = r#"{"titleExcludeFilters": ["1:1", "Optional", "Canceled"]}"#;
        let settings: Settings = serde_json::from_str(json).unwrap();

        assert_eq!(settings.title_exclude_filters.len(), 3);
        assert!(settings.title_exclude_filters.contains(&"1:1".to_string()));
        assert!(settings.title_exclude_filters.contains(&"Optional".to_string()));
    }

    #[test]
    fn test_settings_with_tauri_config() {
        let json = r#"{
            "tauri": {
                "quitToHide": false,
                "startAtLogin": true,
                "showTrayIcon": true,
                "trayDisplayMode": "iconWithCountdown",
                "trayShowMeetingTitle": true
            }
        }"#;
        let settings: Settings = serde_json::from_str(json).unwrap();

        let tauri = settings.tauri.unwrap();
        assert!(!tauri.quit_to_hide);
        assert!(tauri.start_at_login);
        assert!(tauri.show_tray_icon);
        assert_eq!(tauri.tray_display_mode, TrayDisplayMode::IconWithCountdown);
        assert!(tauri.tray_show_meeting_title);
    }

    #[test]
    fn test_settings_camel_case_serialization() {
        let settings = Settings::default();
        let json = serde_json::to_string(&settings).unwrap();

        // Should use camelCase
        assert!(json.contains("checkIntervalSeconds"));
        assert!(json.contains("joinBeforeMinutes"));
        assert!(json.contains("autoClickJoin"));
        assert!(json.contains("defaultMicState"));
        // Should NOT use snake_case
        assert!(!json.contains("check_interval_seconds"));
        assert!(!json.contains("join_before_minutes"));
    }

    #[test]
    fn test_tauri_settings_camel_case_serialization() {
        let tauri_settings = TauriSettings::default();
        let json = serde_json::to_string(&tauri_settings).unwrap();

        assert!(json.contains("quitToHide"));
        assert!(json.contains("startAtLogin"));
        assert!(json.contains("showTrayIcon"));
        assert!(json.contains("trayDisplayMode"));
        assert!(json.contains("trayShowMeetingTitle"));
    }

    #[test]
    fn test_settings_full_roundtrip() {
        let original = Settings {
            check_interval_seconds: 60,
            join_before_minutes: 5,
            max_minutes_after_start: 12,
            auto_click_join: false,
            join_countdown_seconds: 15,
            title_exclude_filters: vec!["Skip".to_string()],
            default_mic_state: MediaState::Unmuted,
            default_camera_state: MediaState::Unmuted,
            show_notifications: false,
            show_countdown_overlay: false,
            tauri: Some(TauriSettings {
                quit_to_hide: false,
                start_at_login: true,
                show_tray_icon: false,
                tray_display_mode: TrayDisplayMode::IconWithTime,
                tray_show_meeting_title: true,
            }),
        };

        let json = serde_json::to_string(&original).unwrap();
        let parsed: Settings = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.check_interval_seconds, 60);
        assert_eq!(parsed.join_before_minutes, 5);
        assert_eq!(parsed.max_minutes_after_start, 12);
        assert!(!parsed.auto_click_join);
        assert_eq!(parsed.join_countdown_seconds, 15);
        assert_eq!(parsed.title_exclude_filters, vec!["Skip".to_string()]);
        assert_eq!(parsed.default_mic_state, MediaState::Unmuted);
        assert_eq!(parsed.default_camera_state, MediaState::Unmuted);
        assert!(!parsed.show_notifications);
        assert!(!parsed.show_countdown_overlay);

        let tauri = parsed.tauri.unwrap();
        assert!(!tauri.quit_to_hide);
        assert!(tauri.start_at_login);
        assert!(!tauri.show_tray_icon);
        assert_eq!(tauri.tray_display_mode, TrayDisplayMode::IconWithTime);
        assert!(tauri.tray_show_meeting_title);
    }
}
