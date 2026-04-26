//! Parser for MeetCat's `meetcat://` URL scheme.
//!
//! Supported forms:
//! - `meetcat://meet.google.com/<code>`       — Google Meet mirror
//! - `meetcat://meet.google.com/lookup/<id>`
//! - `meetcat://join?id=<code>`               — query form
//! - `meetcat://join/<code>`                  — path form
//! - `meetcat://home`                         — navigate to Meet home
//! - `meetcat://settings`                     — open settings window
//! - `meetcat://new`                          — start a new instant meeting
//! - `meetcat://check-update`                 — trigger manual update check

use tauri::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeepLinkAction {
    /// Join a Google Meet meeting. `code` is the path segment appended to
    /// `https://meet.google.com/`, e.g. `"abc-defg-hij"` or `"lookup/xxxx"`.
    JoinMeeting {
        code: String,
    },
    Home,
    Settings,
    NewMeeting,
    CheckUpdate,
}

impl DeepLinkAction {
    /// Whether dispatching this action navigates the main window. Such actions
    /// must wait for the main window's first page load to complete on cold
    /// start, otherwise `webview.navigate(...)` can race with the initial
    /// `https://meet.google.com/` load and be silently dropped.
    pub fn requires_main_window_navigation(&self) -> bool {
        matches!(
            self,
            DeepLinkAction::JoinMeeting { .. }
                | DeepLinkAction::Home
                | DeepLinkAction::NewMeeting
        )
    }
}

pub fn parse(url: &Url) -> Option<DeepLinkAction> {
    if url.scheme() != "meetcat" {
        return None;
    }

    let host = url.host_str()?.to_ascii_lowercase();
    let trimmed_path = url.path().trim_matches('/');

    match host.as_str() {
        "home" => Some(DeepLinkAction::Home),
        "settings" => Some(DeepLinkAction::Settings),
        "new" => Some(DeepLinkAction::NewMeeting),
        "check-update" => Some(DeepLinkAction::CheckUpdate),
        "join" => {
            let code = code_from_join(url, trimmed_path)?;
            Some(DeepLinkAction::JoinMeeting { code })
        }
        "meet.google.com" => {
            let code = code_from_meet_path(trimmed_path)?;
            Some(DeepLinkAction::JoinMeeting { code })
        }
        _ => None,
    }
}

fn code_from_join(url: &Url, trimmed_path: &str) -> Option<String> {
    if !trimmed_path.is_empty() {
        return is_meeting_code(trimmed_path).then(|| trimmed_path.to_string());
    }
    for (key, value) in url.query_pairs() {
        if key.eq_ignore_ascii_case("id") {
            let v = value.trim();
            if is_meeting_code(v) {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn code_from_meet_path(trimmed_path: &str) -> Option<String> {
    if let Some(rest) = trimmed_path.strip_prefix("lookup/") {
        if !rest.is_empty() && is_safe_path_segment(rest) {
            return Some(format!("lookup/{}", rest));
        }
        return None;
    }
    is_meeting_code(trimmed_path).then(|| trimmed_path.to_string())
}

/// `xxx-xxxx-xxx` (3-4-3 alphanumeric).
fn is_meeting_code(code: &str) -> bool {
    if code.len() != 12 {
        return false;
    }
    for (idx, b) in code.as_bytes().iter().enumerate() {
        match idx {
            3 | 8 => {
                if *b != b'-' {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_alphanumeric() {
                    return false;
                }
            }
        }
    }
    true
}

fn is_safe_path_segment(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_str(s: &str) -> Option<DeepLinkAction> {
        parse(&Url::parse(s).ok()?)
    }

    #[test]
    fn join_meet_mirror() {
        assert_eq!(
            parse_str("meetcat://meet.google.com/xrs-dpxg-hsw"),
            Some(DeepLinkAction::JoinMeeting {
                code: "xrs-dpxg-hsw".to_string(),
            })
        );
    }

    #[test]
    fn join_meet_mirror_with_trailing_slash() {
        assert_eq!(
            parse_str("meetcat://meet.google.com/xrs-dpxg-hsw/"),
            Some(DeepLinkAction::JoinMeeting {
                code: "xrs-dpxg-hsw".to_string(),
            })
        );
    }

    #[test]
    fn join_meet_mirror_ignores_skip_preview() {
        assert_eq!(
            parse_str("meetcat://meet.google.com/xrs-dpxg-hsw?skipPreview=1"),
            Some(DeepLinkAction::JoinMeeting {
                code: "xrs-dpxg-hsw".to_string(),
            })
        );
    }

    #[test]
    fn join_meet_lookup() {
        assert_eq!(
            parse_str("meetcat://meet.google.com/lookup/ab_cd-EF12"),
            Some(DeepLinkAction::JoinMeeting {
                code: "lookup/ab_cd-EF12".to_string(),
            })
        );
    }

    #[test]
    fn join_meet_invalid_code() {
        assert_eq!(parse_str("meetcat://meet.google.com/nope"), None);
        assert_eq!(parse_str("meetcat://meet.google.com/"), None);
        assert_eq!(parse_str("meetcat://meet.google.com/ab-cdef-ghi"), None);
    }

    #[test]
    fn join_query_form() {
        assert_eq!(
            parse_str("meetcat://join?id=xrs-dpxg-hsw"),
            Some(DeepLinkAction::JoinMeeting {
                code: "xrs-dpxg-hsw".to_string(),
            })
        );
    }

    #[test]
    fn join_query_form_rejects_code_alias() {
        assert_eq!(parse_str("meetcat://join?code=xrs-dpxg-hsw"), None);
    }

    #[test]
    fn join_path_form() {
        assert_eq!(
            parse_str("meetcat://join/xrs-dpxg-hsw"),
            Some(DeepLinkAction::JoinMeeting {
                code: "xrs-dpxg-hsw".to_string(),
            })
        );
    }

    #[test]
    fn join_rejects_alias_hosts() {
        assert_eq!(parse_str("meetcat://open?id=xrs-dpxg-hsw"), None);
        assert_eq!(parse_str("meetcat://openMeet?id=xrs-dpxg-hsw"), None);
    }

    #[test]
    fn join_query_ignores_skip_preview_variants() {
        for url in [
            "meetcat://join?id=xrs-dpxg-hsw&skipPreview=1",
            "meetcat://join?id=xrs-dpxg-hsw&skipPreview=true",
            "meetcat://join?id=xrs-dpxg-hsw&skipPreview=yes",
            "meetcat://join?id=xrs-dpxg-hsw&skip_preview=1",
            "meetcat://join?id=xrs-dpxg-hsw&skippreview=on",
            "meetcat://join?id=xrs-dpxg-hsw&skipPreview",
            "meetcat://join?id=xrs-dpxg-hsw&skipPreview=0",
            "meetcat://join?id=xrs-dpxg-hsw&skipPreview=false",
            "meetcat://join?id=xrs-dpxg-hsw&skipPreview=no",
        ] {
            assert_eq!(
                parse_str(url),
                Some(DeepLinkAction::JoinMeeting {
                    code: "xrs-dpxg-hsw".to_string(),
                }),
                "expected skipPreview to be ignored for {}",
                url
            );
        }
    }

    #[test]
    fn join_query_missing_id() {
        assert_eq!(parse_str("meetcat://join"), None);
        assert_eq!(parse_str("meetcat://join?id=nope"), None);
    }

    #[test]
    fn simple_commands() {
        assert_eq!(parse_str("meetcat://home"), Some(DeepLinkAction::Home));
        assert_eq!(
            parse_str("meetcat://settings"),
            Some(DeepLinkAction::Settings)
        );
        assert_eq!(parse_str("meetcat://new"), Some(DeepLinkAction::NewMeeting));
        assert_eq!(
            parse_str("meetcat://check-update"),
            Some(DeepLinkAction::CheckUpdate)
        );
        assert_eq!(parse_str("meetcat://checkupdate"), None);
    }

    #[test]
    fn unknown_scheme_and_host() {
        assert_eq!(parse_str("https://meet.google.com/xrs-dpxg-hsw"), None);
        assert_eq!(parse_str("meetcat://unknown"), None);
    }

    #[test]
    fn requires_main_window_navigation_classification() {
        assert!(DeepLinkAction::Home.requires_main_window_navigation());
        assert!(DeepLinkAction::NewMeeting.requires_main_window_navigation());
        assert!(DeepLinkAction::JoinMeeting {
            code: "abc-defg-hij".to_string(),
        }
        .requires_main_window_navigation());

        // Settings / CheckUpdate target the Settings window and do not need
        // to wait for the main window's first load.
        assert!(!DeepLinkAction::Settings.requires_main_window_navigation());
        assert!(!DeepLinkAction::CheckUpdate.requires_main_window_navigation());
    }
}
