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
        let max_after_start = settings.max_minutes_after_start as i64;

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
        let max_after_start_ms = (settings.max_minutes_after_start as i64) * 60 * 1000;
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn create_test_meeting(call_id: &str, title: &str, starts_in_minutes: i64) -> Meeting {
        let now = Utc::now();
        Meeting {
            call_id: call_id.to_string(),
            url: format!("https://meet.google.com/{}", call_id),
            title: title.to_string(),
            display_time: "10:00 AM".to_string(),
            begin_time: now + Duration::minutes(starts_in_minutes),
            end_time: now + Duration::minutes(starts_in_minutes + 60),
            event_id: Some("event123".to_string()),
            starts_in_minutes,
        }
    }

    #[test]
    fn test_daemon_state() {
        let mut state = DaemonState::default();
        assert!(!state.is_running());

        state.start();
        assert!(state.is_running());

        state.stop();
        assert!(!state.is_running());
    }

    #[test]
    fn test_joined_tracking() {
        let mut state = DaemonState::default();

        state.mark_joined("abc-defg-hij");
        assert!(state.joined_meetings.contains("abc-defg-hij"));

        state.clear_joined();
        assert!(state.joined_meetings.is_empty());
    }

    #[test]
    fn test_update_meetings() {
        let mut state = DaemonState::default();
        assert!(state.get_meetings().is_empty());

        let meetings = vec![
            create_test_meeting("abc-defg-hij", "Team Standup", 5),
            create_test_meeting("xyz-uvwx-rst", "1:1 Meeting", 30),
        ];
        state.update_meetings(meetings);

        assert_eq!(state.get_meetings().len(), 2);
    }

    #[test]
    fn test_get_next_meeting_returns_earliest() {
        let mut state = DaemonState::default();
        let meetings = vec![
            create_test_meeting("later", "Later Meeting", 30),
            create_test_meeting("soon", "Soon Meeting", 5),
            create_test_meeting("soonest", "Soonest Meeting", 2),
        ];
        state.update_meetings(meetings);

        let next = state.get_next_meeting();
        assert!(next.is_some());
        assert_eq!(next.unwrap().call_id, "soonest");
    }

    #[test]
    fn test_get_next_meeting_excludes_joined() {
        let mut state = DaemonState::default();
        let meetings = vec![
            create_test_meeting("first", "First Meeting", 2),
            create_test_meeting("second", "Second Meeting", 5),
        ];
        state.update_meetings(meetings);
        state.mark_joined("first");

        let next = state.get_next_meeting();
        assert!(next.is_some());
        assert_eq!(next.unwrap().call_id, "second");
    }

    #[test]
    fn test_get_next_meeting_excludes_old_meetings() {
        let mut state = DaemonState::default();
        // Meeting that started 10 minutes ago (beyond the 5-minute grace period)
        let meetings = vec![create_test_meeting("old", "Old Meeting", -10)];
        state.update_meetings(meetings);

        let next = state.get_next_meeting();
        assert!(next.is_none());
    }

    #[test]
    fn test_should_join_now_within_window() {
        let mut state = DaemonState::default();
        // Meeting starting in 1 minute, with joinBeforeMinutes = 1
        let meetings = vec![create_test_meeting("abc", "Test Meeting", 1)];
        state.update_meetings(meetings);

        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let should_join = state.should_join_now(&settings);
        assert!(should_join.is_some());
        assert_eq!(should_join.unwrap().call_id, "abc");
    }

    #[test]
    fn test_should_join_now_not_yet() {
        let mut state = DaemonState::default();
        // Meeting starting in 10 minutes, with joinBeforeMinutes = 1
        let meetings = vec![create_test_meeting("abc", "Test Meeting", 10)];
        state.update_meetings(meetings);

        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let should_join = state.should_join_now(&settings);
        assert!(should_join.is_none());
    }

    #[test]
    fn test_should_join_now_respects_exclude_filters() {
        let mut state = DaemonState::default();
        let meetings = vec![
            create_test_meeting("skip", "1:1 with Manager", 1),
            create_test_meeting("join", "Team Standup", 2),
        ];
        state.update_meetings(meetings);

        let settings = Settings {
            join_before_minutes: 5,
            title_exclude_filters: vec!["1:1".to_string()],
            ..Settings::default()
        };

        let should_join = state.should_join_now(&settings);
        assert!(should_join.is_some());
        assert_eq!(should_join.unwrap().call_id, "join");
    }

    #[test]
    fn test_should_join_now_after_start_within_grace() {
        let mut state = DaemonState::default();
        // Meeting that started 5 minutes ago (within grace period)
        let meetings = vec![create_test_meeting("abc", "Test Meeting", -5)];
        state.update_meetings(meetings);

        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let should_join = state.should_join_now(&settings);
        assert!(should_join.is_some());
    }

    #[test]
    fn test_should_join_now_too_late() {
        let mut state = DaemonState::default();
        // Meeting that started 35 minutes ago (beyond grace period)
        let meetings = vec![create_test_meeting("abc", "Test Meeting", -35)];
        state.update_meetings(meetings);

        let settings = Settings::default();

        let should_join = state.should_join_now(&settings);
        assert!(should_join.is_none());
    }

    #[test]
    fn test_should_join_now_respects_max_after_start() {
        let mut state = DaemonState::default();
        let meetings = vec![create_test_meeting("abc", "Test Meeting", -5)];
        state.update_meetings(meetings);

        let settings = Settings {
            max_minutes_after_start: 3,
            ..Settings::default()
        };

        let should_join = state.should_join_now(&settings);
        assert!(should_join.is_none());
    }

    #[test]
    fn test_calculate_next_trigger_future_meeting() {
        let mut state = DaemonState::default();
        // Meeting starting in 10 minutes
        let meetings = vec![create_test_meeting("abc", "Test Meeting", 10)];
        state.update_meetings(meetings);

        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_some());
        let trigger = trigger.unwrap();
        assert_eq!(trigger.meeting.call_id, "abc");
        // Should trigger in about 9 minutes (10 - 1 = 9 minutes before)
        assert!(trigger.delay_ms > 8 * 60 * 1000); // > 8 minutes
        assert!(trigger.delay_ms < 10 * 60 * 1000); // < 10 minutes
    }

    #[test]
    fn test_calculate_next_trigger_immediate() {
        let mut state = DaemonState::default();
        // Meeting that started 5 minutes ago
        let meetings = vec![create_test_meeting("abc", "Test Meeting", -5)];
        state.update_meetings(meetings);

        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_some());
        // Should trigger immediately
        assert_eq!(trigger.unwrap().delay_ms, 0);
    }

    #[test]
    fn test_calculate_next_trigger_excludes_joined() {
        let mut state = DaemonState::default();
        let meetings = vec![
            create_test_meeting("joined", "Already Joined", 5),
            create_test_meeting("pending", "Pending Meeting", 10),
        ];
        state.update_meetings(meetings);
        state.mark_joined("joined");

        let settings = Settings::default();

        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_some());
        assert_eq!(trigger.unwrap().meeting.call_id, "pending");
    }

    #[test]
    fn test_calculate_next_trigger_respects_exclude_filters() {
        let mut state = DaemonState::default();
        let meetings = vec![
            create_test_meeting("optional", "Optional: Team Sync", 5),
            create_test_meeting("required", "Sprint Planning", 10),
        ];
        state.update_meetings(meetings);

        let settings = Settings {
            title_exclude_filters: vec!["Optional".to_string()],
            ..Settings::default()
        };

        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_some());
        assert_eq!(trigger.unwrap().meeting.call_id, "required");
    }

    #[test]
    fn test_meeting_serialization() {
        let meeting = create_test_meeting("abc-defg-hij", "Test Meeting", 5);
        let json = serde_json::to_string(&meeting).unwrap();
        assert!(json.contains("abc-defg-hij"));
        assert!(json.contains("Test Meeting"));

        let parsed: Meeting = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.call_id, meeting.call_id);
        assert_eq!(parsed.title, meeting.title);
    }
}
