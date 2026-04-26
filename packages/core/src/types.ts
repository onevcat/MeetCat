/**
 * Represents a Google Meet meeting parsed from the homepage
 */
export interface Meeting {
  /** The meeting call ID (e.g., "abc-defg-hij") */
  callId: string;
  /** Full meeting URL */
  url: string;
  /** Meeting title */
  title: string;
  /** Display time string from the UI */
  displayTime: string;
  /** Meeting start time */
  beginTime: Date;
  /** Meeting end time */
  endTime: Date;
  /** Google Calendar event ID */
  eventId: string | null;
  /** Minutes until meeting starts (negative if started) */
  startsInMinutes: number;
}

/**
 * Result of parsing meeting cards
 */
export interface ParseResult {
  /** Parsed meetings sorted by start time */
  meetings: Meeting[];
  /** Number of cards found */
  cardsFound: number;
  /** Number of cards ignored because they are hidden */
  hiddenCards?: number;
  /** Hidden reason counts */
  hiddenReasons?: Record<string, number>;
}

/**
 * Media button references
 */
export interface MediaButtons {
  micButton: Element | null;
  cameraButton: Element | null;
}

/**
 * Result of setting media state
 */
export interface MediaStateResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Whether the state was actually changed */
  changed: boolean;
}

/**
 * Options for applying media state with verification
 */
export interface MediaApplyOptions {
  /** Maximum click attempts before giving up. Defaults to 3. */
  maxAttempts?: number;
  /** Milliseconds to wait before re-reading state after a click. Defaults to 200. */
  verifyDelayMs?: number;
}

/**
 * Result of applying media state with verification + retry
 */
export interface MediaApplyResult {
  /** Whether the button is verified to be in the desired state at the end */
  success: boolean;
  /** Number of clicks issued (0 if already in desired state) */
  clicks: number;
  /** Number of read-and-click rounds executed */
  attempts: number;
}

/**
 * Join button result
 */
export interface JoinButtonResult {
  button: Element | null;
  matchedText: string | null;
}

/**
 * Scheduler event types
 */
export type SchedulerEventType = "join" | "upcoming" | "none";

/**
 * Scheduler event returned by check
 */
export interface SchedulerEvent {
  type: SchedulerEventType;
  meeting: Meeting | null;
  /** Minutes until the event (for "upcoming") */
  minutesUntil?: number;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Minutes before meeting to trigger join (default: 1) */
  joinBeforeMinutes: number;
  /** Exclude meetings with titles containing any of these strings (case-sensitive) */
  titleExcludeFilters?: string[];
  /** Maximum minutes after start to still allow joining (default: 10) */
  maxMinutesAfterStart?: number;
}
