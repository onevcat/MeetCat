//! Lightweight i18n for tray menu and tooltips

use std::collections::HashMap;
use std::sync::OnceLock;

/// Supported languages
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Language {
    En,
    Zh,
    Ja,
    Ko,
}

impl Language {
    /// Parse a language string (e.g., "en", "zh", "ja", "ko", "auto") into a Language.
    /// For "auto", detects from system locale. Falls back to English.
    pub fn from_setting(value: &str) -> Self {
        match value {
            "en" => Language::En,
            "zh" => Language::Zh,
            "ja" => Language::Ja,
            "ko" => Language::Ko,
            "auto" | _ => Self::detect(),
        }
    }

    /// Detect language from system locale
    pub fn detect() -> Self {
        let locale = sys_locale::get_locale().unwrap_or_default().to_lowercase();
        if locale.starts_with("zh") {
            Language::Zh
        } else if locale.starts_with("ja") {
            Language::Ja
        } else if locale.starts_with("ko") {
            Language::Ko
        } else {
            Language::En
        }
    }
}

/// Translation key constants
pub mod keys {
    pub const QUIT_MEETCAT: &str = "tray.quitMeetCat";
    pub const SHOW_WINDOW: &str = "tray.showWindow";
    pub const BACK_TO_GOOGLE_MEET_HOME: &str = "tray.backToGoogleMeetHome";
    pub const SETTINGS: &str = "tray.settings";
    pub const CHECK_FOR_UPDATES: &str = "tray.checkForUpdates";
    pub const NO_UPCOMING_MEETINGS: &str = "tray.noUpcomingMeetings";
    pub const TOOLTIP: &str = "tray.tooltip";
    pub const NOW: &str = "tray.now";

    // App menu keys
    pub const MENU_REFRESH_HOME: &str = "menu.refreshHome";
    pub const MENU_EDIT: &str = "menu.edit";
    pub const MENU_VIEW: &str = "menu.view";
    pub const MENU_WINDOW: &str = "menu.window";

    // Predefined menu item keys
    pub const MENU_SERVICES: &str = "menu.services";
    pub const MENU_HIDE_OTHERS: &str = "menu.hideOthers";
    pub const MENU_SHOW_ALL: &str = "menu.showAll";
    pub const MENU_UNDO: &str = "menu.undo";
    pub const MENU_REDO: &str = "menu.redo";
    pub const MENU_CUT: &str = "menu.cut";
    pub const MENU_COPY: &str = "menu.copy";
    pub const MENU_PASTE: &str = "menu.paste";
    pub const MENU_SELECT_ALL: &str = "menu.selectAll";
    pub const MENU_FULLSCREEN: &str = "menu.fullscreen";
    pub const MENU_MINIMIZE: &str = "menu.minimize";
    pub const MENU_ZOOM: &str = "menu.zoom";
    pub const MENU_CLOSE_WINDOW: &str = "menu.closeWindow";
}

type TranslationMap = HashMap<&'static str, HashMap<Language, &'static str>>;

fn translations() -> &'static TranslationMap {
    static TRANSLATIONS: OnceLock<TranslationMap> = OnceLock::new();
    TRANSLATIONS.get_or_init(|| {
        let mut m: TranslationMap = HashMap::new();

        macro_rules! tr {
            ($key:expr, en: $en:expr, zh: $zh:expr, ja: $ja:expr, ko: $ko:expr) => {{
                let mut map = HashMap::new();
                map.insert(Language::En, $en);
                map.insert(Language::Zh, $zh);
                map.insert(Language::Ja, $ja);
                map.insert(Language::Ko, $ko);
                m.insert($key, map);
            }};
        }

        tr!(keys::QUIT_MEETCAT,
            en: "Quit MeetCat", zh: "退出 MeetCat", ja: "MeetCat を終了", ko: "MeetCat 종료");
        tr!(keys::SHOW_WINDOW,
            en: "Show Window", zh: "显示窗口", ja: "ウィンドウを表示", ko: "창 표시");
        tr!(keys::BACK_TO_GOOGLE_MEET_HOME,
            en: "Back to Google Meet Home", zh: "返回 Google Meet 主页", ja: "Google Meet ホームに戻る", ko: "Google Meet 홈으로 돌아가기");
        tr!(keys::SETTINGS,
            en: "Settings...", zh: "设置...", ja: "設定...", ko: "설정...");
        tr!(keys::CHECK_FOR_UPDATES,
            en: "Check for updates...", zh: "检查更新...", ja: "アップデートを確認...", ko: "업데이트 확인...");
        tr!(keys::NO_UPCOMING_MEETINGS,
            en: "No upcoming meetings", zh: "没有即将开始的会议", ja: "予定されている会議はありません", ko: "예정된 회의가 없습니다");
        tr!(keys::TOOLTIP,
            en: "MeetCat - Auto-join Google Meet", zh: "MeetCat - 自动加入 Google Meet", ja: "MeetCat - Google Meet に自動参加", ko: "MeetCat - Google Meet 자동 참가");
        tr!(keys::NOW,
            en: "now", zh: "现在", ja: "間もなく", ko: "지금");

        // App menu
        tr!(keys::MENU_REFRESH_HOME,
            en: "Refresh Home", zh: "刷新主页", ja: "ホームを更新", ko: "홈 새로고침");
        tr!(keys::MENU_EDIT,
            en: "Edit", zh: "编辑", ja: "編集", ko: "편집");
        tr!(keys::MENU_VIEW,
            en: "View", zh: "显示", ja: "表示", ko: "보기");
        tr!(keys::MENU_WINDOW,
            en: "Window", zh: "窗口", ja: "ウインドウ", ko: "윈도우");

        // Predefined menu items
        tr!(keys::MENU_SERVICES,
            en: "Services", zh: "服务", ja: "サービス", ko: "서비스");
        tr!(keys::MENU_HIDE_OTHERS,
            en: "Hide Others", zh: "隐藏其他", ja: "ほかを隠す", ko: "기타 가리기");
        tr!(keys::MENU_SHOW_ALL,
            en: "Show All", zh: "显示全部", ja: "すべてを表示", ko: "모두 보기");
        tr!(keys::MENU_UNDO,
            en: "Undo", zh: "撤销", ja: "取り消す", ko: "실행 취소");
        tr!(keys::MENU_REDO,
            en: "Redo", zh: "重做", ja: "やり直す", ko: "실행 복귀");
        tr!(keys::MENU_CUT,
            en: "Cut", zh: "剪切", ja: "カット", ko: "잘라내기");
        tr!(keys::MENU_COPY,
            en: "Copy", zh: "拷贝", ja: "コピー", ko: "복사하기");
        tr!(keys::MENU_PASTE,
            en: "Paste", zh: "粘贴", ja: "ペースト", ko: "붙여넣기");
        tr!(keys::MENU_SELECT_ALL,
            en: "Select All", zh: "全选", ja: "すべてを選択", ko: "전체 선택");
        tr!(keys::MENU_FULLSCREEN,
            en: "Enter Full Screen", zh: "进入全屏幕", ja: "フルスクリーンにする", ko: "전체 화면 시작");
        tr!(keys::MENU_MINIMIZE,
            en: "Minimize", zh: "最小化", ja: "しまう", ko: "최소화");
        tr!(keys::MENU_ZOOM,
            en: "Zoom", zh: "缩放", ja: "拡大/縮小", ko: "확대/축소");
        tr!(keys::MENU_CLOSE_WINDOW,
            en: "Close Window", zh: "关闭窗口", ja: "ウインドウを閉じる", ko: "윈도우 닫기");

        m
    })
}

/// Translate a key for the given language
pub fn tr(lang: &Language, key: &'static str) -> &'static str {
    translations()
        .get(key)
        .and_then(|map| map.get(lang).or_else(|| map.get(&Language::En)))
        .copied()
        .unwrap_or(key)
}

/// Format "About {app_name}" for the given language
pub fn tr_about(lang: &Language, app_name: &str) -> String {
    match lang {
        Language::En => format!("About {}", app_name),
        Language::Zh => format!("关于 {}", app_name),
        Language::Ja => format!("{}について", app_name),
        Language::Ko => format!("{}에 관하여", app_name),
    }
}

/// Format "Hide {app_name}" for the given language
pub fn tr_hide(lang: &Language, app_name: &str) -> String {
    match lang {
        Language::En => format!("Hide {}", app_name),
        Language::Zh => format!("隐藏 {}", app_name),
        Language::Ja => format!("{}を隠す", app_name),
        Language::Ko => format!("{} 가리기", app_name),
    }
}

/// Format "Update available: {version}" for the given language
pub fn tr_update_available(lang: &Language, version: &str) -> String {
    match lang {
        Language::En => format!("Update available: {}", version),
        Language::Zh => format!("有可用更新：{}", version),
        Language::Ja => format!("アップデートがあります：{}", version),
        Language::Ko => format!("업데이트 가능: {}", version),
    }
}

/// Format "Next: {title} ({status})" for the given language
pub fn tr_next_meeting(lang: &Language, title: &str, status: &str) -> String {
    match lang {
        Language::En => format!("Next: {} ({})", title, status),
        Language::Zh => format!("下一个：{}（{}）", title, status),
        Language::Ja => format!("次：{}（{}）", title, status),
        Language::Ko => format!("다음: {} ({})", title, status),
    }
}

/// Format "MeetCat - Next: {title} ({status})" for the given language
pub fn tr_tooltip_with_meeting(lang: &Language, title: &str, status: &str) -> String {
    match lang {
        Language::En => format!("MeetCat - Next: {} ({})", title, status),
        Language::Zh => format!("MeetCat - 下一个：{}（{}）", title, status),
        Language::Ja => format!("MeetCat - 次：{}（{}）", title, status),
        Language::Ko => format!("MeetCat - 다음: {} ({})", title, status),
    }
}

/// Format "MeetCat - No upcoming meetings" for the given language
pub fn tr_tooltip_no_meetings(lang: &Language) -> String {
    match lang {
        Language::En => "MeetCat - No upcoming meetings".to_string(),
        Language::Zh => "MeetCat - 没有即将开始的会议".to_string(),
        Language::Ja => "MeetCat - 予定されている会議はありません".to_string(),
        Language::Ko => "MeetCat - 예정된 회의가 없습니다".to_string(),
    }
}

/// Format time status like "in 5 min" / "now" / "3 min ago"
pub fn tr_time_status(lang: &Language, starts_in_minutes: i64) -> String {
    if starts_in_minutes > 0 {
        match lang {
            Language::En => format!("in {} min", starts_in_minutes),
            Language::Zh => format!("{} 分钟后", starts_in_minutes),
            Language::Ja => format!("{} 分後", starts_in_minutes),
            Language::Ko => format!("{}분 후", starts_in_minutes),
        }
    } else if starts_in_minutes == 0 {
        tr(lang, keys::NOW).to_string()
    } else {
        match lang {
            Language::En => format!("{} min ago", -starts_in_minutes),
            Language::Zh => format!("{} 分钟前", -starts_in_minutes),
            Language::Ja => format!("{} 分前", -starts_in_minutes),
            Language::Ko => format!("{}분 전", -starts_in_minutes),
        }
    }
}

/// Format countdown for tray title like "in 5m" / "now" / "3m ago"
pub fn tr_countdown_short(lang: &Language, starts_in_minutes: i64) -> String {
    if starts_in_minutes > 0 {
        match lang {
            Language::En => format!("in {}m", starts_in_minutes),
            Language::Zh => format!("{}分后", starts_in_minutes),
            Language::Ja => format!("{}分後", starts_in_minutes),
            Language::Ko => format!("{}분 후", starts_in_minutes),
        }
    } else if starts_in_minutes == 0 {
        tr(lang, keys::NOW).to_string()
    } else {
        match lang {
            Language::En => format!("{}m ago", -starts_in_minutes),
            Language::Zh => format!("{}分前", -starts_in_minutes),
            Language::Ja => format!("{}分前", -starts_in_minutes),
            Language::Ko => format!("{}분 전", -starts_in_minutes),
        }
    }
}
