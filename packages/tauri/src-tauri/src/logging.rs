//! Log collection and persistence for MeetCat

use crate::settings::{LogLevel, Settings};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const LOG_RETENTION_DAYS: u64 = 3;
const CLEANUP_INTERVAL_MS: u64 = 6 * 60 * 60 * 1000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEventInput {
    pub level: LogLevel,
    pub module: String,
    pub event: String,
    pub message: Option<String>,
    pub context: Option<Value>,
    pub ts_ms: Option<u64>,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogEntry {
    ts_ms: u64,
    level: LogLevel,
    scope: String,
    module: String,
    event: String,
    message: Option<String>,
    context: Option<Value>,
    session_id: String,
}

pub struct LogManager {
    enabled: bool,
    level: LogLevel,
    session_id: String,
    log_dir: PathBuf,
    last_cleanup_ms: u64,
    rate_limits: HashMap<String, RateLimitState>,
}

impl LogManager {
    pub fn new(settings: &Settings) -> Self {
        let session_id = format!("{}-{}", std::process::id(), now_ms());
        let log_dir = default_log_dir();
        let mut manager = Self {
            enabled: false,
            level: LogLevel::Info,
            session_id,
            log_dir,
            last_cleanup_ms: 0,
            rate_limits: HashMap::new(),
        };
        manager.configure(settings);
        manager
    }

    pub fn configure(&mut self, settings: &Settings) {
        let tauri = settings.tauri.as_ref();
        self.enabled = tauri.map(|t| t.log_collection_enabled).unwrap_or(false);
        self.level = tauri
            .map(|t| t.log_level.clone())
            .unwrap_or(LogLevel::Info);

        if self.enabled {
            let _ = fs::create_dir_all(&self.log_dir);
            self.cleanup_old_logs();
        }
    }

    pub fn log_from_input(&mut self, input: LogEventInput, default_scope: &str) {
        let entry = LogEntry {
            ts_ms: input.ts_ms.unwrap_or_else(now_ms),
            level: input.level,
            scope: input
                .scope
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| default_scope.to_string()),
            module: input.module,
            event: input.event,
            message: input.message,
            context: input.context,
            session_id: self.session_id.clone(),
        };
        let _ = self.write_entry(entry);
    }

    pub fn log_internal(
        &mut self,
        level: LogLevel,
        module: &str,
        event: &str,
        message: Option<String>,
        context: Option<Value>,
    ) {
        let entry = LogEntry {
            ts_ms: now_ms(),
            level,
            scope: "rust".to_string(),
            module: module.to_string(),
            event: event.to_string(),
            message,
            context,
            session_id: self.session_id.clone(),
        };
        let _ = self.write_entry(entry);
    }

    fn write_entry(&mut self, entry: LogEntry) -> std::io::Result<()> {
        if !self.enabled {
            return Ok(());
        }

        if !level_allowed(&entry.level, &self.level) {
            return Ok(());
        }

        if let Some(rate_limit_ms) =
            rate_limit_window_ms(&entry.level, &entry.module, &entry.event)
        {
            let now = entry.ts_ms;
            let key = format!("{}:{}:{}", entry.scope, entry.module, entry.event);
            let suppressed = {
                let state = self
                    .rate_limits
                    .entry(key)
                    .or_insert(RateLimitState {
                        last_ts_ms: 0,
                        suppressed: 0,
                    });

                if state.last_ts_ms > 0
                    && now.saturating_sub(state.last_ts_ms) < rate_limit_ms
                {
                    state.suppressed += 1;
                    return Ok(());
                }

                let suppressed = state.suppressed;
                state.suppressed = 0;
                state.last_ts_ms = now;
                suppressed
            };

            let mut entry = entry;
            if suppressed > 0 {
                entry.context = add_suppressed(entry.context, suppressed);
            }
            return self.write_entry_no_limit(entry);
        }

        self.write_entry_no_limit(entry)
    }

    fn write_entry_no_limit(&mut self, entry: LogEntry) -> std::io::Result<()> {
        self.cleanup_old_logs();

        let entry = sanitize_entry(entry);

        fs::create_dir_all(&self.log_dir)?;
        let file_path = self.current_log_file_path();
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(file_path)?;
        let line = serde_json::to_string(&entry).unwrap_or_default();
        file.write_all(line.as_bytes())?;
        file.write_all(b"\n")?;
        Ok(())
    }

    fn current_log_file_path(&self) -> PathBuf {
        let date = Utc::now().format("%Y-%m-%d").to_string();
        self.log_dir.join(format!("meetcat-{}.jsonl", date))
    }

    fn cleanup_old_logs(&mut self) {
        let now = now_ms();
        if now.saturating_sub(self.last_cleanup_ms) < CLEANUP_INTERVAL_MS {
            return;
        }
        self.last_cleanup_ms = now;

        let Ok(entries) = fs::read_dir(&self.log_dir) else {
            return;
        };

        let max_age = Duration::from_secs(LOG_RETENTION_DAYS * 24 * 60 * 60);
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            let Ok(modified) = metadata.modified() else {
                continue;
            };
            if is_older_than(modified, max_age) {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn default_log_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("meetcat").join("logs")
}

fn is_older_than(modified: SystemTime, max_age: Duration) -> bool {
    let Ok(elapsed) = SystemTime::now().duration_since(modified) else {
        return false;
    };
    elapsed > max_age
}

fn level_allowed(level: &LogLevel, threshold: &LogLevel) -> bool {
    level_value(level) <= level_value(threshold)
}

fn level_value(level: &LogLevel) -> u8 {
    match level {
        LogLevel::Error => 0,
        LogLevel::Warn => 1,
        LogLevel::Info => 2,
        LogLevel::Debug => 3,
        LogLevel::Trace => 4,
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_millis() as u64
}

struct RateLimitState {
    last_ts_ms: u64,
    suppressed: u64,
}

fn rate_limit_window_ms(level: &LogLevel, module: &str, event: &str) -> Option<u64> {
    match level {
        LogLevel::Debug | LogLevel::Trace => {}
        _ => return None,
    }

    match (module, event) {
        ("daemon", "check.emitted") => Some(30_000),
        ("meetings", "meetings.updated") => Some(30_000),
        ("join", "trigger.none") => Some(30_000),
        ("homepage", "parse.result") => Some(30_000),
        ("homepage", "meetings.reported") => Some(30_000),
        ("overlay", "overlay.update") => Some(30_000),
        _ => None,
    }
}

fn add_suppressed(context: Option<Value>, suppressed: u64) -> Option<Value> {
    match context {
        Some(Value::Object(mut map)) => {
            map.insert("suppressed".to_string(), Value::from(suppressed));
            Some(Value::Object(map))
        }
        Some(other) => {
            let mut map = serde_json::Map::new();
            map.insert("context".to_string(), other);
            map.insert("suppressed".to_string(), Value::from(suppressed));
            Some(Value::Object(map))
        }
        None => {
            let mut map = serde_json::Map::new();
            map.insert("suppressed".to_string(), Value::from(suppressed));
            Some(Value::Object(map))
        }
    }
}

fn sanitize_entry(mut entry: LogEntry) -> LogEntry {
    if let Some(mut context) = entry.context.take() {
        sanitize_value_in_place(&mut context);
        entry.context = Some(context);
    }
    entry
}

fn sanitize_value_in_place(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                if is_sensitive_key(key) {
                    *val = mask_value(key, val);
                } else {
                    sanitize_value_in_place(val);
                }
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                sanitize_value_in_place(item);
            }
        }
        _ => {}
    }
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(key, "title" | "callId" | "url" | "eventId")
}

fn mask_value(key: &str, value: &Value) -> Value {
    let raw = match value {
        Value::String(s) => s.as_str(),
        _ => return Value::String("[redacted]".to_string()),
    };

    match key {
        "title" => {
            let len = raw.chars().count();
            let suffix = tail_chars(raw, 6);
            Value::String(format!("[redacted:{}…{}]", len, suffix))
        }
        "url" => Value::String(mask_url(raw)),
        "callId" | "eventId" => Value::String(mask_id(raw)),
        _ => Value::String("[redacted]".to_string()),
    }
}

fn mask_id(raw: &str) -> String {
    let trimmed = raw.trim();
    let len = trimmed.chars().count();
    if len <= 4 {
        return "****".to_string();
    }
    let suffix: String = trimmed.chars().skip(len - 4).collect();
    format!("****{}", suffix)
}

fn tail_chars(raw: &str, count: usize) -> String {
    let len = raw.chars().count();
    if len <= count {
        return raw.to_string();
    }
    raw.chars().skip(len - count).collect()
}

fn mask_url(raw: &str) -> String {
    let trimmed = raw.trim();
    let (scheme, rest) = match trimmed.split_once("://") {
        Some((s, r)) => (format!("{}://", s), r),
        None => ("".to_string(), trimmed),
    };

    let mut parts = rest.splitn(2, '/');
    let host = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");
    if path.is_empty() {
        return format!("{}{}", scheme, host);
    }

    let last_segment = path
        .split('/')
        .filter(|s| !s.is_empty())
        .last()
        .unwrap_or(path);
    let suffix = tail_chars(last_segment, 6);
    format!("{}{}…/…{}", scheme, host, suffix)
}
