import type { Meeting, ParseResult } from "../types.js";
import { buildCardJoinUrl } from "../auto-join.js";
import { getHiddenReason, formatDisplayTime } from "./card-support.js";

/**
 * Parser for the Google Meet homepage introduced by the 2026-08 redesign
 * ("v2", served under `/home`).
 *
 * The redesign no longer exposes meeting codes (`data-call-id`) anywhere in
 * the DOM. Each scheduled meeting renders as a clickable card whose element
 * id is a Google Calendar event instance id (`<eventId>_<YYYYMMDD>T<HHMMSS>Z`);
 * the UTC begin time embedded in that suffix is the only machine-readable
 * timestamp. Joining works by clicking the card and letting Meet resolve the
 * meeting code itself — see `buildCardJoinUrl` for how that flows through the
 * scheduler round-trip.
 */

/**
 * Matches Google Calendar event instance ids used as card element ids,
 * e.g. "qh3otvuvq3e5odp340e22elatr_20260814T021500Z".
 */
export const CALENDAR_INSTANCE_ID_PATTERN =
  /^([A-Za-z0-9][A-Za-z0-9_-]*)_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/**
 * Calendar cards are focusable buttons labelled by separate title/time nodes.
 * Class names on the redesigned homepage are obfuscated and rotate between
 * deploys, so only semantic attributes are used here.
 */
export const CALENDAR_CARD_SELECTOR = '[role="button"][id][aria-labelledby]';

const DEFAULT_DURATION_MINUTES = 60;

interface InstanceIdParts {
  eventId: string;
  beginTimeMs: number;
}

function parseInstanceId(id: string): InstanceIdParts | null {
  const match = CALENDAR_INSTANCE_ID_PATTERN.exec(id);
  if (!match) return null;
  const [, eventId, year, month, day, hour, minute, second] = match;
  const beginTimeMs = Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );
  if (isNaN(beginTimeMs)) return null;
  return { eventId, beginTimeMs };
}

/**
 * Find all calendar card buttons within a container.
 */
export function findCalendarCards(container: Document | Element): HTMLElement[] {
  const candidates = container.querySelectorAll(CALENDAR_CARD_SELECTOR);
  const cards: HTMLElement[] = [];
  for (const el of candidates) {
    if (CALENDAR_INSTANCE_ID_PATTERN.test(el.id)) {
      cards.push(el as HTMLElement);
    }
  }
  return cards;
}

/**
 * Find a specific calendar card button by its instance id.
 */
export function findMeetingCardById(
  container: Document | Element,
  instanceId: string
): HTMLElement | null {
  if (!CALENDAR_INSTANCE_ID_PATTERN.test(instanceId)) return null;
  // Instance ids are validated to [A-Za-z0-9_-] so direct interpolation is safe
  const el = container.querySelector(`[role="button"][id="${instanceId}"]`);
  return (el as HTMLElement | null) ?? null;
}

/**
 * Resolve the calendar card button containing the given element, if any.
 * Used to attribute user-initiated card clicks on the homepage.
 */
export function closestCalendarCard(el: Element): HTMLElement | null {
  const button = el.closest('[role="button"][id]');
  if (button && CALENDAR_INSTANCE_ID_PATTERN.test(button.id)) {
    return button as HTMLElement;
  }
  return null;
}

/**
 * Wait for a calendar card to appear (the homepage renders asynchronously).
 */
export async function waitForMeetingCard(
  container: Document | Element,
  instanceId: string,
  options: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<HTMLElement | null> {
  const { maxAttempts = 20, intervalMs = 500 } = options;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const card = findMeetingCardById(container, instanceId);
    if (card) return card;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

function resolveLabelledTexts(card: HTMLElement): string[] {
  const doc = card.ownerDocument;
  const labelledBy = card.getAttribute("aria-labelledby");
  if (!doc || !labelledBy) return [];

  const texts: string[] = [];
  for (const refId of labelledBy.split(/\s+/)) {
    if (!refId) continue;
    const text = doc.getElementById(refId)?.textContent?.trim();
    if (text) texts.push(text);
  }
  return texts;
}

const TIME_TOKEN_PATTERN = /(\d{1,2}):(\d{2})/g;

/**
 * Derive the meeting duration from a localized display range like
 * "11:15 – 12:00" or "11:15 AM – 1:00 PM". Only the delta between the two
 * clock tokens is used, so locale, timezone, and meridiem formatting do not
 * matter; ranges that appear to run backwards are unwrapped in 12h steps.
 */
export function extractDurationMinutes(texts: string[]): number | null {
  for (const text of texts) {
    const tokens = [...text.matchAll(TIME_TOKEN_PATTERN)];
    if (tokens.length < 2) continue;

    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const startMinutes = parseInt(first[1], 10) * 60 + parseInt(first[2], 10);
    const endMinutes = parseInt(last[1], 10) * 60 + parseInt(last[2], 10);

    let duration = endMinutes - startMinutes;
    while (duration <= 0) duration += 12 * 60;
    return duration;
  }
  return null;
}

function extractTitle(card: HTMLElement, labelledTexts: string[]): string {
  const ariaLabel = card.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  // Fall back to the first labelled node that is not a time range
  for (const text of labelledTexts) {
    if (!/\d{1,2}:\d{2}/.test(text)) return text;
  }
  return "Unknown";
}

/**
 * Parse a single calendar card button into a Meeting.
 */
export function parseCalendarCard(
  card: HTMLElement,
  now: number = Date.now()
): Meeting | null {
  const parts = parseInstanceId(card.id);
  if (!parts) return null;

  const labelledTexts = resolveLabelledTexts(card);
  const durationMinutes =
    extractDurationMinutes(labelledTexts) ?? DEFAULT_DURATION_MINUTES;
  const endTimeMs = parts.beginTimeMs + durationMinutes * 60 * 1000;

  const startsIn = parts.beginTimeMs - now;

  return {
    callId: card.id,
    url: buildCardJoinUrl(card.id),
    title: extractTitle(card, labelledTexts),
    displayTime: formatDisplayTime(parts.beginTimeMs, card.ownerDocument),
    beginTime: new Date(parts.beginTimeMs),
    endTime: new Date(endTimeMs),
    eventId: parts.eventId,
    startsInMinutes: Math.floor(startsIn / 60000),
  };
}

function cardVisibilityRoot(card: HTMLElement): Element {
  return card.closest("li") ?? card;
}

/**
 * Parse all v2 calendar cards from a container element.
 */
export function parseHomepageV2(
  container: Document | Element,
  now: number = Date.now()
): ParseResult {
  const cards = findCalendarCards(container);

  const meetings: Meeting[] = [];
  const hiddenReasons: Record<string, number> = {};
  let hiddenCards = 0;

  for (const card of cards) {
    const hiddenReason = getHiddenReason(cardVisibilityRoot(card));
    if (hiddenReason) {
      hiddenCards += 1;
      hiddenReasons[hiddenReason] = (hiddenReasons[hiddenReason] || 0) + 1;
      continue;
    }
    const meeting = parseCalendarCard(card, now);
    if (meeting) {
      meetings.push(meeting);
    }
  }

  meetings.sort((a, b) => a.beginTime.getTime() - b.beginTime.getTime());

  return {
    meetings,
    cardsFound: cards.length,
    hiddenCards,
    hiddenReasons,
    parser: "v2",
  };
}
