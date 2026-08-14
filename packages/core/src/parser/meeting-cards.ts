import type { Meeting, ParseResult } from "../types.js";
import { parseHomepageV1 } from "./homepage-v1.js";
import { parseHomepageV2 } from "./homepage-v2.js";

// Re-export the v1 primitives under their historical names
export { MEETING_CARD_SELECTOR, parseMeetingCard, parseHomepageV1 } from "./homepage-v1.js";

/**
 * Parse all meeting cards from a container element.
 *
 * Tries each homepage parser generation from newest to oldest and returns
 * the first one that yields parseable meetings (see `HomepageParserVersion`
 * for the era each generation covers). Google serves whichever frontend it
 * wants per user, so every generation stays in the chain to survive staged
 * rollouts and rollbacks.
 *
 * The short-circuit is on parsed meetings, not on matched nodes: hidden or
 * leftover markup from another generation must never block the generation
 * that actually renders the schedule. Generations are not merged — their
 * call ids have no common key (meeting code vs calendar instance id), so
 * cross-generation dedup is impossible, and a real page only renders one
 * generation at a time.
 *
 * @param container - The document or element to search within
 * @param now - Current timestamp (for testing)
 * @returns ParseResult with meetings sorted by start time
 */
export function parseMeetingCards(
  container: Document | Element,
  now: number = Date.now()
): ParseResult {
  const v2 = parseHomepageV2(container, now);
  if (v2.meetings.length > 0) return v2;

  const v1 = parseHomepageV1(container, now);
  if (v1.meetings.length > 0) return v1;

  // No meetings in any generation — return the result whose markup is
  // actually present so cardsFound/hiddenCards diagnostics stay meaningful
  return v1.cardsFound > v2.cardsFound ? v1 : v2;
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
