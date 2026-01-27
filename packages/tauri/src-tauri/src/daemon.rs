//! Background daemon for meeting scheduling

use crate::settings::Settings;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Represents a Google Meet meeting
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Meeting {
    pub call_id: String,
    pub url: String,
    pub title: String,
    pub display_time: String,
    pub begin_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub event_id: Option<String>,
    pub starts_in_minutes: i64,
}

/// Result of calculating the next join trigger
#[derive(Debug, Clone)]
pub struct NextJoinTrigger {
    /// The meeting to join
    pub meeting: Meeting,
    /// Milliseconds until we should trigger the join
    pub delay_ms: u64,
}

/// Daemon state
#[derive(Debug, Default)]
pub struct DaemonState {
    running: bool,
    meetings: Vec<Meeting>,
    joined_meetings: HashSet<String>,
}

impl DaemonState {
    /// Check if daemon is running
    pub fn is_running(&self) -> bool {
        self.running
    }

    /// Start the daemon
    pub fn start(&mut self) {
        self.running = true;
        // In a real implementation, this would spawn a background task
        // using tokio to periodically check and join meetings
    }

    /// Stop the daemon
    pub fn stop(&mut self) {
        self.running = false;
    }

    /// Update meetings list
    pub fn update_meetings(&mut self, meetings: Vec<Meeting>) {
        self.meetings = meetings;
    }

    /// Get all meetings
    pub fn get_meetings(&self) -> Vec<Meeting> {
        self.meetings.clone()
    }

    /// Get the next meeting to join
    pub fn get_next_meeting(&self) -> Option<Meeting> {
        let now = Utc::now();

        self.meetings
            .iter()
            .filter(|m| !self.joined_meetings.contains(&m.call_id))
            .filter(|m| m.begin_time > now - chrono::Duration::minutes(5))
            .min_by_key(|m| m.begin_time)
            .cloned()
    }

    /// Mark a meeting as joined
    pub fn mark_joined(&mut self, call_id: &str) {
        self.joined_meetings.insert(call_id.to_string());
    }

    /// Clear joined history
    pub fn clear_joined(&mut self) {
        self.joined_meetings.clear();
    }

    /// Check if any meeting should be joined now based on settings
    pub fn should_join_now(&self, settings: &Settings) -> Option<Meeting> {
        let join_threshold = settings.join_before_minutes as i64;
        let max_after_start = 30i64; // Max 30 minutes after start

        self.meetings
            .iter()
            .filter(|m| !self.joined_meetings.contains(&m.call_id))
            .filter(|m| {
                // Filter by title exclude list
                !settings
                    .title_exclude_filters
                    .iter()
                    .any(|f| m.title.contains(f))
            })
            .filter(|m| {
                // Within join window: from join_threshold before start to max_after_start after
                // Use <= so joinBeforeMinutes=1 triggers at 1:xx (when starts_in_minutes = 1)
                m.starts_in_minutes <= join_threshold && m.starts_in_minutes >= -max_after_start
            })
            .min_by_key(|m| m.starts_in_minutes.abs())
            .cloned()
    }

    /// Calculate the next precise join trigger time
    ///
    /// This returns the meeting and the delay in milliseconds until we should trigger.
    /// Unlike `should_join_now` which checks if it's time RIGHT NOW, this calculates
    /// when we SHOULD trigger in the future.
    pub fn calculate_next_trigger(&self, settings: &Settings) -> Option<NextJoinTrigger> {
        let join_before_ms = (settings.join_before_minutes as i64) * 60 * 1000;
        let max_after_start_ms = 30i64 * 60 * 1000; // 30 minutes
        let now = Utc::now();

        self.meetings
            .iter()
            .filter(|m| !self.joined_meetings.contains(&m.call_id))
            .filter(|m| {
                // Filter by title exclude list
                !settings
                    .title_exclude_filters
                    .iter()
                    .any(|f| m.title.contains(f))
            })
            .filter_map(|m| {
                let start_time_ms = m.begin_time.timestamp_millis();
                let now_ms = now.timestamp_millis();

                // Calculate when we should trigger (joinBeforeMinutes before start)
                let trigger_time_ms = start_time_ms - join_before_ms;

                // Calculate delay from now
                let delay_ms = trigger_time_ms - now_ms;

                // Only include meetings where:
                // 1. Trigger time is in the future (delay > 0), OR
                // 2. We're still within the valid window (up to max_after_start after start)
                let time_since_start = now_ms - start_time_ms;

                if delay_ms > 0 {
                    // Trigger is in the future
                    Some((m, delay_ms as u64))
                } else if time_since_start < max_after_start_ms {
                    // Already past trigger time but still within join window - trigger immediately
                    Some((m, 0))
                } else {
                    // Past the join window, skip
                    None
                }
            })
            // Get the one with the smallest delay (earliest trigger)
            .min_by_key(|(_, delay)| *delay)
            .map(|(m, delay_ms)| NextJoinTrigger {
                meeting: m.clone(),
                delay_ms,
            })
    }
}

