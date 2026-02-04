import type { Meeting, ParseResult } from "../types.js";

/**
 * Selector for meeting cards on Google Meet homepage
 */
export const MEETING_CARD_SELECTOR = "[data-call-id]";


/**
 * Parse a single meeting card element
 */
export function parseMeetingCard(
  card: Element,
  now: number = Date.now()
): Meeting | null {
  if (getHiddenReason(card)) return null;

  const callId = card.getAttribute("data-call-id");
  if (!callId) return null;

  const beginTimeRaw = card.getAttribute("data-begin-time");
  const endTimeRaw = card.getAttribute("data-end-time");
  if (!beginTimeRaw || !endTimeRaw) return null;

  const beginTime = parseInt(beginTimeRaw, 10);
  const endTime = parseInt(endTimeRaw, 10);
  if (isNaN(beginTime) || isNaN(endTime)) return null;

  const eventId = card.getAttribute("data-event-id");
  const ariaLabel =
    card.getAttribute("data-aria-label-static") ||
    card.getAttribute("aria-label") ||
    "";

  // Extract title from DOM + aria label
  const title = extractMeetingTitle(card, ariaLabel) || "Unknown";

  // Format display time from beginTime (avoid relying on classnames)
  const displayTime = formatDisplayTime(beginTime, card.ownerDocument);

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

function extractMeetingTitle(card: Element, ariaLabel: string): string {
  const candidates = collectTextCandidates(card);
  if (!candidates.length) return fallbackTitleFromAria(ariaLabel);
  if (!ariaLabel.trim()) return pickLongest(candidates) || "";

  const matches = candidates.filter((candidate) => ariaLabel.includes(candidate));
  if (!matches.length) return pickLongest(candidates) || fallbackTitleFromAria(ariaLabel);

  const nonPrefixMatches = matches.filter((candidate) => {
    const index = ariaLabel.indexOf(candidate);
    return index > 0;
  });

  const pickFrom = nonPrefixMatches.length ? nonPrefixMatches : matches;
  return pickLongest(pickFrom) || fallbackTitleFromAria(ariaLabel);
}

function collectTextCandidates(card: Element): string[] {
  const doc = card.ownerDocument;
  const view = doc?.defaultView;
  const NodeFilterCtor = view?.NodeFilter;
  if (!view || !NodeFilterCtor) return [];

  const walker = doc.createTreeWalker(card, NodeFilterCtor.SHOW_TEXT, null);
  const seen = new Set<string>();
  const candidates: string[] = [];

  let current = walker.nextNode();
  while (current) {
    const text = current.textContent?.trim() || "";
    if (text && !seen.has(text)) {
      seen.add(text);
      candidates.push(text);
    }
    current = walker.nextNode();
  }

  return candidates;
}

function pickLongest(candidates: string[]): string | null {
  let longest: string | null = null;
  for (const candidate of candidates) {
    if (!longest || candidate.length > longest.length) {
      longest = candidate;
    }
  }
  return longest;
}

function fallbackTitleFromAria(ariaLabel: string): string {
  if (!ariaLabel) return "";
  const parts = ariaLabel.split(/[。\.\u2022]/).map((part) => part.trim());
  const nonEmpty = parts.filter((part) => part.length > 0);
  if (nonEmpty.length <= 1) return nonEmpty[0] || "";
  return nonEmpty[1] || nonEmpty[0] || "";
}

function formatDisplayTime(beginTimeMs: number, doc: Document | null): string {
  const view = doc?.defaultView;
  if (!view?.Intl?.DateTimeFormat) return "";
  const formatter = new view.Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return formatter.format(new Date(beginTimeMs));
}

function getHiddenReason(card: Element): string | null {
  if (card.closest("[hidden]")) return "ancestor-hidden";
  if (card.closest("[aria-hidden='true']")) return "ancestor-aria-hidden";

  const styleAttr = card.getAttribute("style") || "";
  if (styleAttr.includes("display: none") || styleAttr.includes("visibility: hidden")) {
    return "inline-style-hidden";
  }

  const view = card.ownerDocument?.defaultView;
  const computed = view?.getComputedStyle?.(card as Element);
  if (computed && (computed.display === "none" || computed.visibility === "hidden")) {
    return "computed-style-hidden";
  }

  const HTMLElementCtor = view?.HTMLElement;
  if (HTMLElementCtor && card instanceof HTMLElementCtor) {
    const { display, visibility } = card.style;
    if (display === "none" || visibility === "hidden") {
      return "inline-style-hidden";
    }

    const isJsdom = view?.navigator?.userAgent?.includes("jsdom");
    if (!isJsdom && card.getClientRects().length === 0) {
      return "no-client-rects";
    }
  }

  return null;
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
  const hiddenReasons: Record<string, number> = {};
  let hiddenCards = 0;

  for (const card of cards) {
    const hiddenReason = getHiddenReason(card);
    if (hiddenReason) {
      hiddenCards += 1;
      hiddenReasons[hiddenReason] = (hiddenReasons[hiddenReason] || 0) + 1;
      continue;
    }
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
    hiddenCards,
    hiddenReasons,
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
