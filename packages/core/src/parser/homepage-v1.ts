import type { Meeting, ParseResult } from "../types.js";
import { getHiddenReason, formatDisplayTime } from "./card-support.js";

/**
 * Parser for the Google Meet homepage as it existed until 2026-08 ("v1").
 *
 * Meeting cards carry machine-readable data attributes: `data-call-id`
 * (the meeting code), `data-begin-time` / `data-end-time` (epoch millis)
 * and optionally `data-event-id`.
 */

/**
 * Selector for meeting cards on the v1 Google Meet homepage
 */
export const MEETING_CARD_SELECTOR = "[data-call-id]";

/**
 * Parse a single v1 meeting card element
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

/**
 * Parse all v1 meeting cards from a container element
 */
export function parseHomepageV1(
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
    parser: "v1",
  };
}
