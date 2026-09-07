//! Background daemon for meeting scheduling

use crate::settings::Settings;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

/// How long a join guard (joined / suppressed / triggered) is kept.
///
/// Guards used to be pruned against the latest parsed meeting list, but a
/// homepage parse can transiently come back empty — Meet renders its schedule
/// asynchronously, so the parse right after navigating back from a meeting
/// page regularly lands on a card-less DOM. Discarding the guards on such a
/// parse made the next non-empty parse re-fire the trigger for the meeting the
/// user had just cancelled, reopening the prep page for as long as the user
/// kept cancelling. Guards are therefore expired on their own timestamps:
/// long enough to outlive any meeting instance, short enough that a call id
/// reused by a recurring meeting is joinable again at its next occurrence.
const GUARD_RETENTION_MS: i64 = 12 * 60 * 60 * 1000;

/// Outcome of a meeting-closed report, for diagnostics.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClosureReport {
    /// Whether the meeting was still present in the last parsed list
    pub matched: bool,
    /// The instance's join trigger time, when it could be computed
    pub trigger_at_ms: Option<i64>,
    /// Whether the close was recorded as a suppression
    pub suppressed: bool,
}

/// Daemon state
#[derive(Debug, Default)]
pub struct DaemonState {
    running: bool,
    meetings: Vec<Meeting>,
    /// Meetings reported joined, keyed by call id with the time of the report
    joined_meetings: HashMap<String, i64>,
    suppressed_meetings: HashMap<String, i64>,
    /// Meeting instances whose join trigger already fired, keyed by call id
    /// with the instance's begin time. The joined guard alone cannot prevent
    /// re-firing before the meeting starts (it is time-scoped so a recurring
    /// call id can join again the next day), so trigger execution is tracked
    /// separately per instance.
    triggered_meetings: HashMap<String, i64>,
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
        self.prune_state();
    }

    /// Get all meetings
    pub fn get_meetings(&self) -> Vec<Meeting> {
        self.meetings.clone()
    }

    /// Get the next meeting to join
    pub fn get_next_meeting(&self, settings: &Settings) -> Option<Meeting> {
        let now = Utc::now();
        let join_before_ms = (settings.join_before_minutes as i64) * 60 * 1000;
        let now_ms = now.timestamp_millis();

        self.meetings
            .iter()
            .filter(|m| m.end_time > now)
            .filter(|m| {
                let start_time_ms = m.begin_time.timestamp_millis();
                let trigger_at_ms = start_time_ms - join_before_ms;

                if self.suppressed_meetings.contains_key(&m.call_id) && now_ms >= trigger_at_ms {
                    return false;
                }

                if self.joined_meetings.contains_key(&m.call_id) && m.begin_time <= now {
                    return false;
                }

                true
            })
            .filter(|m| m.begin_time > now - chrono::Duration::minutes(5))
            .min_by_key(|m| m.begin_time)
            .cloned()
    }

    /// Mark a meeting as joined
    pub fn mark_joined(&mut self, call_id: &str, joined_at_ms: i64) {
        self.joined_meetings
            .insert(call_id.to_string(), joined_at_ms);
    }

    /// Whether a meeting has been reported joined
    pub fn is_joined(&self, call_id: &str) -> bool {
        self.joined_meetings.contains_key(call_id)
    }

    /// Mark a meeting instance's join trigger as fired
    pub fn mark_triggered(&mut self, call_id: &str, begin_time_ms: i64) {
        self.triggered_meetings
            .insert(call_id.to_string(), begin_time_ms);
    }

    fn is_triggered(&self, meeting: &Meeting) -> bool {
        self.triggered_meetings.get(&meeting.call_id)
            == Some(&meeting.begin_time.timestamp_millis())
    }

    /// Mark a meeting as suppressed
    pub fn mark_suppressed(&mut self, call_id: &str, closed_at_ms: i64) {
        self.suppressed_meetings
            .insert(call_id.to_string(), closed_at_ms);
    }

    /// Record a closed meeting, suppressing its join trigger when the close
    /// landed at or after that trigger's time. Closing a meeting earlier than
    /// that is the user dismissing a card we never acted on, and must leave
    /// the meeting eligible.
    ///
    /// The trigger time is derived from the parsed meeting list, which can lag
    /// behind this report: Meet renders its schedule asynchronously, so the
    /// parse right after navigating away from a meeting page can transiently
    /// come back empty. A trigger already fired for this call id proves on its
    /// own that the close landed at or after the trigger time, so it stands in
    /// for the missing meeting rather than dropping the report.
    pub fn report_closed(
        &mut self,
        call_id: &str,
        closed_at_ms: i64,
        settings: &Settings,
    ) -> ClosureReport {
        let trigger_at_ms = self
            .meetings
            .iter()
            .find(|m| m.call_id == call_id)
            .map(|m| {
                m.begin_time.timestamp_millis()
                    - (settings.join_before_minutes as i64) * 60 * 1000
            });

        if let Some(trigger_at_ms) = trigger_at_ms {
            let suppressed = closed_at_ms >= trigger_at_ms;
            if suppressed {
                self.mark_suppressed(call_id, closed_at_ms);
            }
            return ClosureReport {
                matched: true,
                trigger_at_ms: Some(trigger_at_ms),
                suppressed,
            };
        }

        let suppressed = self.triggered_meetings.contains_key(call_id);
        if suppressed {
            self.mark_suppressed(call_id, closed_at_ms);
        }
        ClosureReport {
            matched: false,
            trigger_at_ms: None,
            suppressed,
        }
    }

    /// Clear joined history
    pub fn clear_joined(&mut self) {
        self.joined_meetings.clear();
    }

    /// Get joined meeting call IDs
    pub fn get_joined_meetings(&self) -> Vec<String> {
        self.joined_meetings.keys().cloned().collect()
    }

    /// Get suppressed meeting call IDs
    pub fn get_suppressed_meetings(&self) -> Vec<String> {
        self.suppressed_meetings.keys().cloned().collect()
    }

    /// Drop join guards whose instance is far enough in the past to be
    /// irrelevant. Deliberately independent of `self.meetings`: see
    /// `GUARD_RETENTION_MS`.
    fn prune_state(&mut self) {
        let cutoff_ms = Utc::now().timestamp_millis() - GUARD_RETENTION_MS;

        self.joined_meetings
            .retain(|_, joined_at_ms| *joined_at_ms >= cutoff_ms);
        self.suppressed_meetings
            .retain(|_, closed_at_ms| *closed_at_ms >= cutoff_ms);
        self.triggered_meetings
            .retain(|_, begin_time_ms| *begin_time_ms >= cutoff_ms);
    }

    /// Check if any meeting should be joined now based on settings
    pub fn should_join_now(&self, settings: &Settings) -> Option<Meeting> {
        let join_threshold = settings.join_before_minutes as i64;
        let max_after_start = settings.max_minutes_after_start as i64;
        let now = Utc::now();
        let join_before_ms = join_threshold * 60 * 1000;
        let now_ms = now.timestamp_millis();

        self.meetings
            .iter()
            .filter(|m| m.end_time > now)
            .filter(|m| {
                let start_time_ms = m.begin_time.timestamp_millis();
                let trigger_at_ms = start_time_ms - join_before_ms;

                if self.suppressed_meetings.contains_key(&m.call_id) && now_ms >= trigger_at_ms {
                    return false;
                }

                if self.joined_meetings.contains_key(&m.call_id) && m.begin_time <= now {
                    return false;
                }

                true
            })
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
        let now_ms = now.timestamp_millis();

        self.meetings
            .iter()
            .filter(|m| m.end_time > now)
            .filter(|m| {
                // A fired trigger must never fire again for the same instance
                // (re-scheduling happens on every meetings/joined/closed update)
                if self.is_triggered(m) {
                    return false;
                }

                let start_time_ms = m.begin_time.timestamp_millis();
                let trigger_at_ms = start_time_ms - join_before_ms;

                if self.suppressed_meetings.contains_key(&m.call_id) && now_ms >= trigger_at_ms {
                    return false;
                }

                if self.joined_meetings.contains_key(&m.call_id) && m.begin_time <= now {
                    return false;
                }

                true
            })
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

        state.mark_joined("abc-defg-hij", Utc::now().timestamp_millis());
        assert!(state.joined_meetings.contains_key("abc-defg-hij"));

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

        let next = state.get_next_meeting(&Settings::default());
        assert!(next.is_some());
        assert_eq!(next.unwrap().call_id, "soonest");
    }

    #[test]
    fn test_get_next_meeting_excludes_joined() {
        let mut state = DaemonState::default();
        let meetings = vec![
            create_test_meeting("first", "First Meeting", -2),
            create_test_meeting("second", "Second Meeting", 5),
        ];
        state.update_meetings(meetings);
        state.mark_joined("first", Utc::now().timestamp_millis());

        let next = state.get_next_meeting(&Settings::default());
        assert!(next.is_some());
        assert_eq!(next.unwrap().call_id, "second");
    }

    #[test]
    fn test_get_next_meeting_allows_joined_before_start() {
        let mut state = DaemonState::default();
        let meetings = vec![create_test_meeting("first", "First Meeting", 5)];
        state.update_meetings(meetings);
        state.mark_joined("first", Utc::now().timestamp_millis());

        let next = state.get_next_meeting(&Settings::default());
        assert!(next.is_some());
        assert_eq!(next.unwrap().call_id, "first");
    }

    #[test]
    fn test_get_next_meeting_skips_suppressed_after_trigger() {
        let mut state = DaemonState::default();
        let meetings = vec![create_test_meeting("first", "First Meeting", 1)];
        state.update_meetings(meetings);
        state.mark_suppressed("first", Utc::now().timestamp_millis());

        let settings = Settings {
            join_before_minutes: 2,
            ..Settings::default()
        };

        let next = state.get_next_meeting(&settings);
        assert!(next.is_none());
    }

    /// Regression: a homepage parse can transiently come back with zero cards
    /// (Meet renders its schedule asynchronously, and the parse right after
    /// navigating back from a meeting page regularly lands on a card-less
    /// DOM). That empty list still reaches `update_meetings`; while the join
    /// guards were pruned against it, the next non-empty parse re-fired the
    /// trigger for the meeting the user had just cancelled — reopening the
    /// prep page for as long as the user kept cancelling.
    #[test]
    fn test_transient_empty_update_keeps_join_guards() {
        let mut state = DaemonState::default();
        let meeting = create_test_meeting("first", "First Meeting", 1);
        let begin_time_ms = meeting.begin_time.timestamp_millis();
        state.update_meetings(vec![meeting.clone()]);

        // The user cancelled the countdown and navigated back to the homepage.
        let now_ms = Utc::now().timestamp_millis();
        state.mark_joined("first", now_ms);
        state.mark_triggered("first", begin_time_ms);
        state.mark_suppressed("first", now_ms);

        // Empty parse right after that navigation, then the real list returns.
        state.update_meetings(vec![]);
        state.update_meetings(vec![meeting]);

        let settings = Settings {
            join_before_minutes: 2,
            ..Settings::default()
        };

        assert!(
            state.calculate_next_trigger(&settings).is_none(),
            "a transient empty parse must not re-arm a cancelled meeting"
        );
        assert!(state.is_joined("first"));
        assert_eq!(state.get_suppressed_meetings().len(), 1);
    }

    /// Regression: a close was recorded only while the meeting was still in
    /// the parsed list. The list can lag behind the report — the homepage
    /// parse right after navigating away from a meeting page can transiently
    /// come back empty — and a close landing in that window was dropped
    /// entirely, leaving the cancelled meeting eligible for auto-join.
    #[test]
    fn test_report_closed_suppresses_fired_trigger_missing_from_list() {
        let mut state = DaemonState::default();
        let meeting = create_test_meeting("first", "First Meeting", 1);
        let begin_time_ms = meeting.begin_time.timestamp_millis();
        let settings = Settings {
            join_before_minutes: 2,
            ..Settings::default()
        };

        state.update_meetings(vec![meeting.clone()]);
        state.mark_triggered("first", begin_time_ms);

        // The homepage re-parsed empty before the close report arrived.
        state.update_meetings(vec![]);
        let report = state.report_closed("first", Utc::now().timestamp_millis(), &settings);

        assert!(!report.matched);
        assert!(report.suppressed);

        // `get_next_meeting` reads the suppression but not the triggered mark,
        // so it isolates the suppression from the per-instance trigger guard.
        state.update_meetings(vec![meeting]);
        assert!(
            state.get_next_meeting(&settings).is_none(),
            "a close reported against an empty parse must still suppress"
        );
    }

    /// The stand-in above must not fire for a meeting whose trigger never went
    /// off: an unknown call id carries no evidence that the close landed after
    /// a trigger, so it must leave the meeting eligible.
    #[test]
    fn test_report_closed_ignores_untriggered_meeting_missing_from_list() {
        let mut state = DaemonState::default();

        let report =
            state.report_closed("unknown", Utc::now().timestamp_millis(), &Settings::default());

        assert!(!report.matched);
        assert!(!report.suppressed);
        assert!(state.get_suppressed_meetings().is_empty());
    }

    /// Closing a card before its join trigger is the user dismissing a meeting
    /// MeetCat never acted on — the trigger must still fire at its normal time.
    #[test]
    fn test_report_closed_before_trigger_time_is_not_suppressed() {
        let mut state = DaemonState::default();
        state.update_meetings(vec![create_test_meeting("first", "First Meeting", 10)]);
        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let report = state.report_closed("first", Utc::now().timestamp_millis(), &settings);

        assert!(report.matched);
        assert!(!report.suppressed);
        assert!(state.get_suppressed_meetings().is_empty());
        assert!(state.calculate_next_trigger(&settings).is_some());
    }

    /// Counterpart: closing at or after the trigger time is the user cancelling
    /// what MeetCat opened, and must suppress the meeting.
    #[test]
    fn test_report_closed_after_trigger_time_is_suppressed() {
        let mut state = DaemonState::default();
        state.update_meetings(vec![create_test_meeting("first", "First Meeting", 1)]);
        let settings = Settings {
            join_before_minutes: 2,
            ..Settings::default()
        };

        let report = state.report_closed("first", Utc::now().timestamp_millis(), &settings);

        assert!(report.matched);
        assert!(report.suppressed);
        assert!(state.calculate_next_trigger(&settings).is_none());
    }

    /// Counterpart to the test above: guards must still expire, otherwise a
    /// call id reused by a recurring meeting would stay joined/suppressed at
    /// its next occurrence.
    #[test]
    fn test_join_guards_expire_after_retention_window() {
        let mut state = DaemonState::default();
        let now_ms = Utc::now().timestamp_millis();
        let stale_ms = now_ms - GUARD_RETENTION_MS - 1;

        for (call_id, at_ms) in [("stale", stale_ms), ("fresh", now_ms)] {
            state.mark_joined(call_id, at_ms);
            state.mark_suppressed(call_id, at_ms);
            state.mark_triggered(call_id, at_ms);
        }

        state.update_meetings(vec![]);

        assert_eq!(state.get_joined_meetings(), vec!["fresh".to_string()]);
        assert_eq!(state.get_suppressed_meetings(), vec!["fresh".to_string()]);
        assert!(!state.triggered_meetings.contains_key("stale"));
        assert!(state.triggered_meetings.contains_key("fresh"));
    }

    #[test]
    fn test_suppressed_meeting_does_not_trigger() {
        let mut state = DaemonState::default();
        let meetings = vec![create_test_meeting("first", "First Meeting", 1)];
        state.update_meetings(meetings);
        state.mark_suppressed("first", Utc::now().timestamp_millis());

        let settings = Settings {
            join_before_minutes: 2,
            ..Settings::default()
        };

        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_none());
    }

    /// Counterpart to `test_suppressed_meeting_does_not_trigger`: when the user
    /// closes a meeting BEFORE its trigger time fires, the suppression must not
    /// stick — the trigger should still re-fire at the normal time. This guards
    /// against accidentally simplifying the filter to "any suppressed call_id
    /// is dead forever".
    #[test]
    fn test_calculate_next_trigger_includes_suppressed_before_trigger_time() {
        let mut state = DaemonState::default();
        // Meeting starts in 10 minutes, joinBefore=1 → trigger at +9min.
        let meetings = vec![create_test_meeting("first", "First Meeting", 10)];
        state.update_meetings(meetings);
        // Marked suppressed "now", well before the +9min trigger.
        state.mark_suppressed("first", Utc::now().timestamp_millis());

        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_some(), "suppressed-before-trigger must not silently disable the meeting");
        let trigger = trigger.unwrap();
        assert_eq!(trigger.meeting.call_id, "first");
        // ~9 minutes out
        assert!(trigger.delay_ms > 8 * 60 * 1000);
        assert!(trigger.delay_ms < 10 * 60 * 1000);
    }

    /// Same shape as the trigger test above, but for the tray-facing
    /// `get_next_meeting`. Closing a meeting card before its join trigger fires
    /// must not hide it from the tray either.
    #[test]
    fn test_get_next_meeting_includes_suppressed_before_trigger_time() {
        let mut state = DaemonState::default();
        let meetings = vec![create_test_meeting("first", "First Meeting", 10)];
        state.update_meetings(meetings);
        state.mark_suppressed("first", Utc::now().timestamp_millis());

        let settings = Settings {
            join_before_minutes: 1,
            ..Settings::default()
        };

        let next = state.get_next_meeting(&settings);
        assert!(next.is_some(), "suppressed-before-trigger must still appear in the tray");
        assert_eq!(next.unwrap().call_id, "first");
    }

    #[test]
    fn test_get_next_meeting_excludes_old_meetings() {
        let mut state = DaemonState::default();
        // Meeting that started 10 minutes ago (beyond the 5-minute grace period)
        let meetings = vec![create_test_meeting("old", "Old Meeting", -10)];
        state.update_meetings(meetings);

        let next = state.get_next_meeting(&Settings::default());
        assert!(next.is_none());
    }

    /// Positive assertion for the 5-minute grace window — a meeting that started
    /// 3 minutes ago must still be reported as "next" so the tray can render
    /// "3m ago" instead of jumping ahead. Pair with `excludes_old_meetings`.
    #[test]
    fn test_get_next_meeting_includes_recently_started_within_grace() {
        let mut state = DaemonState::default();
        let meetings = vec![create_test_meeting("recent", "Recently Started", -3)];
        state.update_meetings(meetings);

        let next = state.get_next_meeting(&Settings::default());
        assert!(next.is_some());
        assert_eq!(next.unwrap().call_id, "recent");
    }

    /// A meeting whose end_time has already passed must never be reported,
    /// regardless of its begin_time/grace status.
    #[test]
    fn test_get_next_meeting_excludes_meeting_past_its_end_time() {
        let mut state = DaemonState::default();
        let now = Utc::now();
        let meetings = vec![Meeting {
            call_id: "ended".to_string(),
            url: "https://meet.google.com/ended".to_string(),
            title: "Already Ended".to_string(),
            display_time: "09:00 AM".to_string(),
            // Started an hour ago, ended a minute ago.
            begin_time: now - Duration::minutes(61),
            end_time: now - Duration::minutes(1),
            event_id: None,
            starts_in_minutes: -61,
        }];
        state.update_meetings(meetings);

        let next = state.get_next_meeting(&Settings::default());
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
        state.mark_joined("joined", Utc::now().timestamp_millis());

        let settings = Settings::default();

        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_some());
        assert_eq!(trigger.unwrap().meeting.call_id, "joined");
    }

    /// Regression: after the trigger fires, joined+triggered marks must stop
    /// any re-fire for the same instance even before the meeting starts
    /// (every meetings/joined/closed update re-runs the scheduler).
    #[test]
    fn test_calculate_next_trigger_excludes_triggered_instance_before_start() {
        let mut state = DaemonState::default();
        let meeting = create_test_meeting("abc", "Daily", 5);
        let begin_time_ms = meeting.begin_time.timestamp_millis();
        state.update_meetings(vec![meeting]);

        let settings = Settings::default();
        assert!(state.calculate_next_trigger(&settings).is_some());

        // Same marks the fired trigger applies
        state.mark_joined("abc", Utc::now().timestamp_millis());
        state.mark_triggered("abc", begin_time_ms);

        assert!(state.calculate_next_trigger(&settings).is_none());
    }

    /// A triggered mark is per instance: the same call id with a different
    /// begin time (recurring meeting, next occurrence) must trigger again.
    #[test]
    fn test_triggered_mark_does_not_block_next_instance() {
        let mut state = DaemonState::default();
        let today = create_test_meeting("abc", "Daily", 5);
        let yesterday_begin_ms =
            (today.begin_time - Duration::days(1)).timestamp_millis();
        state.mark_triggered("abc", yesterday_begin_ms);
        state.update_meetings(vec![today]);

        let settings = Settings::default();
        let trigger = state.calculate_next_trigger(&settings);
        assert!(trigger.is_some());
        assert_eq!(trigger.unwrap().meeting.call_id, "abc");
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
