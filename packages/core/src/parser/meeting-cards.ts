import type { Meeting, ParseResult } from "../types.js";
import { parseHomepageV1 } from "./homepage-v1.js";
import { parseHomepageV2 } from "./homepage-v2.js";

// Re-export the v1 primitives under their historical names
export { MEETING_CARD_SELECTOR, parseMeetingCard, parseHomepageV1 } from "./homepage-v1.js";

/**
 * Parse all meeting cards from a container element.
 *
 * Tries each homepage parser generation from oldest to newest and returns
 * the first one that finds cards (see `HomepageParserVersion` for the era
 * each generation covers). Keeping every generation in the chain keeps
 * MeetCat working across Google's staged rollouts and rollbacks.
 *
 * @param container - The document or element to search within
 * @param now - Current timestamp (for testing)
 * @returns ParseResult with meetings sorted by start time
 */
export function parseMeetingCards(
  container: Document | Element,
  now: number = Date.now()
): ParseResult {
  const v1 = parseHomepageV1(container, now);
  if (v1.cardsFound > 0) return v1;
  return parseHomepageV2(container, now);
}

/**
 * Get the next joinable meeting from a list
 *
 * @param meetings - Array of meetings
 * @param options - Options for filtering
 * @returns The next meeting to join, or null
 */
export function getNextJoinableMeeting(
  meetings: Meeting[],
  options: {
    /** Meetings that have already been joined */
    alreadyJoined?: Set<string>;
    /** Meetings that should be suppressed after trigger time */
    suppressedMeetings?: Set<string>;
    /** Minutes before meeting to trigger join */
    joinBeforeMinutes?: number;
    /** Title filter */
    titleFilter?: string;
    /** Current time */
    now?: number;
    /** Grace period in minutes after start (default: 10) */
    gracePeriodMinutes?: number;
  } = {}
): Meeting | null {
  const {
    alreadyJoined = new Set(),
    suppressedMeetings = new Set(),
    joinBeforeMinutes,
    titleFilter,
    now = Date.now(),
    gracePeriodMinutes = 10,
  } = options;

  const graceMs = gracePeriodMinutes * 60 * 1000;

  for (const meeting of meetings) {
    const startTime = meeting.beginTime.getTime();
    const triggerAtMs =
      typeof joinBeforeMinutes === "number"
        ? startTime - joinBeforeMinutes * 60 * 1000
        : null;

    // Skip already joined only after meeting starts
    if (alreadyJoined.has(meeting.callId) && startTime <= now) continue;

    // Skip if doesn't match filter
    if (titleFilter && !meeting.title.includes(titleFilter)) continue;

    // Skip meetings that have already ended
    if (meeting.endTime.getTime() <= now) continue;

    // Skip suppressed meetings after trigger time
    if (
      triggerAtMs !== null &&
      suppressedMeetings.has(meeting.callId) &&
      now >= triggerAtMs
    ) {
      continue;
    }

    // Check if meeting is within joinable window
    // Can join if: started within grace period OR hasn't started yet
    if (startTime > now - graceMs) {
      return meeting;
    }
  }

  return null;
}
