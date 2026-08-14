const AUTO_JOIN_PARAM = "meetcatAuto";

/**
 * Append MeetCat auto-join marker to a meeting URL.
 */
export function appendAutoJoinParam(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(AUTO_JOIN_PARAM, "1");
    return parsed.toString();
  } catch (error) {
    try {
      const parsed = new URL(url, "https://meet.google.com");
      parsed.searchParams.set(AUTO_JOIN_PARAM, "1");
      return parsed.toString();
    } catch (fallbackError) {
      return url;
    }
  }
}

/**
 * Check if a URL contains the MeetCat auto-join marker.
 */
export function hasAutoJoinParam(url: string): boolean {
  try {
    const parsed = new URL(url, "https://meet.google.com");
    return parsed.searchParams.has(AUTO_JOIN_PARAM);
  } catch (error) {
    return false;
  }
}

/**
 * Card-based join marker for the redesigned Meet homepage.
 *
 * The redesigned homepage exposes no meeting codes, so a meeting cannot be
 * joined by URL. Instead, the parser reports a homepage URL carrying this
 * param with the card's calendar instance id; at trigger time the card is
 * looked up in the DOM and clicked, letting Meet resolve the meeting itself.
 */
export const CARD_JOIN_PARAM = "meetcatJoin";

export function buildCardJoinUrl(instanceId: string): string {
  return `https://meet.google.com/home?${CARD_JOIN_PARAM}=${encodeURIComponent(instanceId)}`;
}

/**
 * Extract the card-join target (calendar instance id) from a URL, if any.
 */
export function getCardJoinTarget(url: string): string | null {
  try {
    const parsed = new URL(url, "https://meet.google.com");
    return parsed.searchParams.get(CARD_JOIN_PARAM);
  } catch (error) {
    return null;
  }
}

/**
 * Pending card-join state, persisted in sessionStorage across the navigation
 * that Meet performs after the card is clicked. Replaces the URL-param
 * auto-join marker, which cannot survive a navigation Meet itself initiates.
 */
export interface PendingCardJoin {
  /** The synthetic call id (calendar instance id) of the clicked card */
  callId: string;
  /** Whether the click was triggered by MeetCat (auto-join) or the user */
  auto: boolean;
  /** Timestamp of the click */
  atMs: number;
}

const CARD_JOIN_STORAGE_KEY = "__meetcat_card_join";
const CARD_JOIN_TTL_MS = 3 * 60 * 1000;

export function markPendingCardJoin(
  callId: string,
  auto: boolean,
  nowMs: number = Date.now()
): void {
  try {
    const pending: PendingCardJoin = { callId, auto, atMs: nowMs };
    sessionStorage.setItem(CARD_JOIN_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // sessionStorage unavailable — auto-join intent will be lost
  }
}

export function readPendingCardJoin(nowMs: number = Date.now()): PendingCardJoin | null {
  try {
    const raw = sessionStorage.getItem(CARD_JOIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.callId !== "string" ||
      typeof parsed.auto !== "boolean" ||
      typeof parsed.atMs !== "number"
    ) {
      return null;
    }
    if (nowMs - parsed.atMs > CARD_JOIN_TTL_MS) return null;
    return parsed as PendingCardJoin;
  } catch {
    return null;
  }
}

export function clearPendingCardJoin(): void {
  try {
    sessionStorage.removeItem(CARD_JOIN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
