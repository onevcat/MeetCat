// Re-export all types
export type {
  Meeting,
  ParseResult,
  HomepageParserVersion,
  MediaButtons,
  MediaStateResult,
  MediaApplyOptions,
  MediaApplyResult,
  JoinButtonResult,
  SchedulerEventType,
  SchedulerEvent,
  SchedulerConfig,
} from "./types.js";

// Re-export parser
export {
  parseMeetingCards,
  getNextJoinableMeeting,
  parseMeetingCard,
  parseHomepageV1,
  MEETING_CARD_SELECTOR,
  parseHomepageV2,
  parseCalendarCard,
  findCalendarCards,
  findMeetingCardById,
  closestCalendarCard,
  waitForMeetingCard,
  extractDurationMinutes,
  CALENDAR_CARD_SELECTOR,
  CALENDAR_INSTANCE_ID_PATTERN,
} from "./parser/index.js";

// Re-export controller
export {
  findMediaButtons,
  isMuted,
  setMicState,
  setCameraState,
  applyMicState,
  applyCameraState,
  MEDIA_BUTTON_SELECTOR,
  findJoinButton,
  findLeaveButton,
  clickJoinButton,
  getMeetingCodeFromPath,
  JOIN_BUTTON_PATTERNS,
  LEAVE_BUTTON_PATTERNS,
} from "./controller/index.js";

// Re-export scheduler
export {
  createSchedulerLogic,
  DEFAULT_SCHEDULER_CONFIG,
  type Scheduler,
} from "./scheduler/index.js";

// Re-export UI
export {
  createHomepageOverlay,
  type HomepageOverlay,
  createJoinCountdown,
  type JoinCountdown,
  type JoinCountdownOptions,
  ensureStyles,
  createOverlayStyles,
} from "./ui/index.js";

// Re-export auto-join helpers
export {
  appendAutoJoinParam,
  hasAutoJoinParam,
  buildCardJoinUrl,
  getCardJoinTarget,
  markPendingCardJoin,
  readPendingCardJoin,
  clearPendingCardJoin,
  CARD_JOIN_PARAM,
  type PendingCardJoin,
} from "./auto-join.js";

// Re-export utils
export {
  isMeetHomepageUrl,
  DEFAULT_HOMEPAGE_STALE_THRESHOLD_MS,
  DEFAULT_HOMEPAGE_BACKOFF_SCHEDULE_MS,
  DEFAULT_HOMEPAGE_DAILY_RELOAD_LIMIT,
  createMeetingsFingerprint,
  createHomepageReloadWatchdog,
  HomepageReloadWatchdog,
  type HomepageReloadAction,
  type HomepageReloadReason,
  type HomepageReloadWatchdogConfig,
  type HomepageReloadWatchdogInput,
  type HomepageReloadWatchdogState,
  type HomepageReloadWatchdogEvaluation,
} from "./utils/index.js";
