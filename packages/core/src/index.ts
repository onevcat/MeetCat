// Re-export all types
export type {
  Meeting,
  ParseResult,
  MediaButtons,
  MediaStateResult,
  JoinButtonResult,
  SchedulerEventType,
  SchedulerEvent,
  SchedulerConfig,
} from "./types.js";

// Re-export parser
export {
  parseMeetingCards,
  parseMeetingCard,
  getNextJoinableMeeting,
  MEETING_CARD_SELECTOR,
} from "./parser/index.js";

// Re-export controller
export {
  findMediaButtons,
  isMuted,
  setMicState,
  setCameraState,
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
export { appendAutoJoinParam, hasAutoJoinParam } from "./auto-join.js";
