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

    #[serde(default)]
    pub start_at_login: bool,

    #[serde(default = "default_true")]
    pub show_tray_icon: bool,
}

impl Default for TauriSettings {
    fn default() -> Self {
        Self {
            run_in_background: true,
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

