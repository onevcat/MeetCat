//! Settings management for MeetCat

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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

/// Tauri-specific settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TauriSettings {
    #[serde(default = "default_true")]
    pub run_in_background: bool,

    #[serde(default = "default_true")]
    pub quit_to_hide: bool,

    #[serde(default)]
    pub start_at_login: bool,

    #[serde(default = "default_true")]
    pub show_tray_icon: bool,
}

impl Default for TauriSettings {
    fn default() -> Self {
        Self {
            run_in_background: true,
            quit_to_hide: true,
            start_at_login: false,
            show_tray_icon: true,
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

    // Join behavior
    #[serde(default = "default_true")]
    pub auto_click_join: bool,

    #[serde(default = "default_countdown")]
    pub join_countdown_seconds: u32,

    #[serde(default)]
    pub title_exclude_filters: Vec<String>,

    // Media defaults
    #[serde(default)]
    pub default_mic_state: MediaState,

    #[serde(default)]
    pub default_camera_state: MediaState,

    // UI
    #[serde(default = "default_true")]
    pub show_notifications: bool,

    #[serde(default = "default_true")]
    pub show_countdown_overlay: bool,

    // Platform-specific
    #[serde(default)]
    pub tauri: Option<TauriSettings>,
}

fn default_true() -> bool {
    true
}

fn default_check_interval() -> u32 {
    30
}

fn default_join_before() -> u32 {
    1
}

fn default_countdown() -> u32 {
    10
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            check_interval_seconds: 30,
            join_before_minutes: 1,
            auto_click_join: true,
            join_countdown_seconds: 10,
            title_exclude_filters: Vec::new(),
            default_mic_state: MediaState::Muted,
            default_camera_state: MediaState::Muted,
            show_notifications: true,
            show_countdown_overlay: true,
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
        assert!(settings.auto_click_join);
        assert_eq!(settings.default_mic_state, MediaState::Muted);
        assert!(settings.title_exclude_filters.is_empty());
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
        assert!(tauri_settings.run_in_background);
        assert!(tauri_settings.quit_to_hide);
        assert!(!tauri_settings.start_at_login);
        assert!(tauri_settings.show_tray_icon);
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
                "runInBackground": false,
                "quitToHide": false,
                "startAtLogin": true,
                "showTrayIcon": true
            }
        }"#;
        let settings: Settings = serde_json::from_str(json).unwrap();

        let tauri = settings.tauri.unwrap();
        assert!(!tauri.run_in_background);
        assert!(!tauri.quit_to_hide);
        assert!(tauri.start_at_login);
        assert!(tauri.show_tray_icon);
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

        assert!(json.contains("runInBackground"));
        assert!(json.contains("quitToHide"));
        assert!(json.contains("startAtLogin"));
        assert!(json.contains("showTrayIcon"));
    }

    #[test]
    fn test_settings_full_roundtrip() {
        let original = Settings {
            check_interval_seconds: 60,
            join_before_minutes: 5,
            auto_click_join: false,
            join_countdown_seconds: 15,
            title_exclude_filters: vec!["Skip".to_string()],
            default_mic_state: MediaState::Unmuted,
            default_camera_state: MediaState::Unmuted,
            show_notifications: false,
            show_countdown_overlay: false,
            tauri: Some(TauriSettings {
                run_in_background: false,
                start_at_login: true,
                show_tray_icon: false,
            }),
        };

        let json = serde_json::to_string(&original).unwrap();
        let parsed: Settings = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.check_interval_seconds, 60);
        assert_eq!(parsed.join_before_minutes, 5);
        assert!(!parsed.auto_click_join);
        assert_eq!(parsed.join_countdown_seconds, 15);
        assert_eq!(parsed.title_exclude_filters, vec!["Skip".to_string()]);
        assert_eq!(parsed.default_mic_state, MediaState::Unmuted);
        assert_eq!(parsed.default_camera_state, MediaState::Unmuted);
        assert!(!parsed.show_notifications);
        assert!(!parsed.show_countdown_overlay);

        let tauri = parsed.tauri.unwrap();
        assert!(!tauri.run_in_background);
        assert!(tauri.start_at_login);
        assert!(!tauri.show_tray_icon);
    }
}
