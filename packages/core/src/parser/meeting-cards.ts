import type { Meeting, ParseResult } from "../types.js";

/**
 * Selector for meeting cards on Google Meet homepage
 */
export const MEETING_CARD_SELECTOR = "[data-call-id]";

/**
 * Selector for meeting title element
 */
export const MEETING_TITLE_SELECTOR = ".mobgod";

/**
 * Selector for meeting time display
 */
export const MEETING_TIME_SELECTOR = ".AKhouc";

/**
 * Parse a single meeting card element
 */
export function parseMeetingCard(
  card: Element,
  now: number = Date.now()
): Meeting | null {
  const callId = card.getAttribute("data-call-id");
  if (!callId) return null;

  const beginTimeRaw = card.getAttribute("data-begin-time");
  const endTimeRaw = card.getAttribute("data-end-time");
  if (!beginTimeRaw || !endTimeRaw) return null;

  const beginTime = parseInt(beginTimeRaw, 10);
  const endTime = parseInt(endTimeRaw, 10);
  if (isNaN(beginTime) || isNaN(endTime)) return null;

  const eventId = card.getAttribute("data-event-id");
  const ariaLabel = card.getAttribute("aria-label") || "";

  // Extract title from DOM
  const titleEl = card.querySelector(MEETING_TITLE_SELECTOR);
  const title =
    titleEl?.textContent?.trim() ||
    ariaLabel.split("。")[1]?.trim() ||
    "Unknown";

  // Extract display time
  const timeEl = card.querySelector(MEETING_TIME_SELECTOR);
  const displayTime = timeEl?.textContent?.trim() || "";

  // Calculate time until meeting (use floor so "1.5 min" counts as "within 1 min")
  const startsIn = beginTime - now;
  const startsInMinutes = Math.floor(startsIn / 60000);

  return {
    callId,
    url: `https://meet.google.com/${callId}`,
    title,
    displayTime,
    beginTime: new Date(beginTime),
    endTime: new Date(endTime),
    eventId,
    startsInMinutes,
  };
}

/**
 * Parse all meeting cards from a container element
 *
 * @param container - The document or element to search within
 * @param now - Current timestamp (for testing)
 * @returns ParseResult with meetings sorted by start time
 */
export function parseMeetingCards(
  container: Document | Element,
  now: number = Date.now()
): ParseResult {
  const cards = container.querySelectorAll(MEETING_CARD_SELECTOR);

  const meetings: Meeting[] = [];

  for (const card of cards) {
    const meeting = parseMeetingCard(card, now);
    if (meeting) {
      meetings.push(meeting);
    }
  }

  // Sort by start time
  meetings.sort((a, b) => a.beginTime.getTime() - b.beginTime.getTime());

  return {
    meetings,
    cardsFound: cards.length,
  };
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
    /** Title filter */
    titleFilter?: string;
    /** Current time */
    now?: number;
    /** Grace period in minutes after start (default: 5) */
    gracePeriodMinutes?: number;
  } = {}
): Meeting | null {
  const {
    alreadyJoined = new Set(),
    titleFilter,
    now = Date.now(),
    gracePeriodMinutes = 5,
  } = options;

  const graceMs = gracePeriodMinutes * 60 * 1000;

  for (const meeting of meetings) {
    // Skip already joined
    if (alreadyJoined.has(meeting.callId)) continue;

    // Skip if doesn't match filter
    if (titleFilter && !meeting.title.includes(titleFilter)) continue;

    // Check if meeting is within joinable window
    // Can join if: started within grace period OR hasn't started yet
    const startTime = meeting.beginTime.getTime();
    if (startTime > now - graceMs) {
      return meeting;
    }
  }

  return null;
}
