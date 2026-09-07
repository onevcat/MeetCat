import type { Meeting } from "@meetcat/core";

/**
 * Pure selection logic for the service worker's precise join trigger,
 * extracted so the trigger guards (joined, suppressed, per-instance
 * triggered) are unit-testable.
 */

export interface JoinTriggerGuards {
  /** Meetings reported joined, keyed by call id with the time of the report */
  joinedMeetings: ReadonlyMap<string, number>;
  suppressedMeetings: ReadonlyMap<string, number>;
  /**
   * Fired triggers, keyed by call id with the instance's begin time.
   * The joined guard alone cannot prevent re-firing before the meeting
   * starts (it is time-scoped so a recurring call id can join again the
   * next day), so trigger execution is tracked separately per instance —
   * otherwise re-scheduling after openMeeting() spins in a zero-delay
   * loop until the meeting starts.
   */
  triggeredMeetings: ReadonlyMap<string, number>;
}

export interface JoinTriggerSettings {
  joinBeforeMinutes: number;
  maxMinutesAfterStart: number;
  titleExcludeFilters: string[];
}

export interface JoinTriggerCandidate {
  meeting: Meeting;
  /** Epoch ms at which the join should fire (now for overdue meetings) */
  triggerTime: number;
}

export function selectNextJoinTrigger(
  meetings: Meeting[],
  guards: JoinTriggerGuards,
  settings: JoinTriggerSettings,
  now: number = Date.now()
): JoinTriggerCandidate | null {
  const joinBeforeMs = settings.joinBeforeMinutes * 60 * 1000;
  const maxAfterStartMs = settings.maxMinutesAfterStart * 60 * 1000;

  let nextTrigger: JoinTriggerCandidate | null = null;

  for (const meeting of meetings) {
    // Skip if title matches any exclude filter
    if (
      settings.titleExcludeFilters.length > 0 &&
      settings.titleExcludeFilters.some((filter) => meeting.title.includes(filter))
    ) {
      continue;
    }

    const startTime = meeting.beginTime.getTime();
    const triggerTime = startTime - joinBeforeMs;
    const timeSinceStart = now - startTime;

    // Skip already ended
    if (meeting.endTime.getTime() <= now) continue;

    // A fired trigger must never fire again for the same instance
    // (re-scheduling happens on every meetings/joined/closed update)
    if (guards.triggeredMeetings.get(meeting.callId) === startTime) continue;

    // Skip if suppressed after trigger time
    if (guards.suppressedMeetings.has(meeting.callId) && now >= triggerTime) {
      continue;
    }

    // Skip already joined only after meeting starts
    if (guards.joinedMeetings.has(meeting.callId) && now >= startTime) {
      continue;
    }

    // Check if this meeting is valid for triggering
    if (triggerTime > now) {
      // Trigger is in the future
      if (!nextTrigger || triggerTime < nextTrigger.triggerTime) {
        nextTrigger = { meeting, triggerTime };
      }
    } else if (timeSinceStart < maxAfterStartMs) {
      // Already past trigger time but still within join window - schedule immediately
      if (!nextTrigger || triggerTime < nextTrigger.triggerTime) {
        nextTrigger = { meeting, triggerTime: now };
      }
    }
  }

  return nextTrigger;
}

/**
 * How long a join guard (joined / suppressed / triggered) is kept.
 *
 * Guards used to be pruned against the latest parsed meeting list, but a
 * homepage parse can transiently come back empty — Meet renders its schedule
 * asynchronously, so the parse right after navigating back from a meeting page
 * regularly lands on a card-less DOM. Discarding the guards on such a parse
 * made the next non-empty parse re-fire the trigger for the meeting the user
 * had just cancelled, reopening the prep page for as long as the user kept
 * cancelling. Guards are therefore expired on their own timestamps: long
 * enough to outlive any meeting instance, short enough that a call id reused
 * by a recurring meeting is joinable again at its next occurrence.
 */
export const JOIN_GUARD_RETENTION_MS = 12 * 60 * 60 * 1000;

export interface MutableJoinGuards {
  joinedMeetings: Map<string, number>;
  suppressedMeetings: Map<string, number>;
  /** Keyed by call id with the instance's begin time, which may be ahead of now */
  triggeredMeetings: Map<string, number>;
}

/**
 * Record a closed meeting, suppressing its join trigger when the close landed
 * at or after that trigger's time. Closing a meeting earlier than that is the
 * user dismissing a card we never acted on, and must leave the meeting
 * eligible.
 *
 * The trigger time is derived from the parsed meeting list, which can lag
 * behind this report: Meet renders its schedule asynchronously, so the parse
 * right after navigating away from a meeting page can transiently come back
 * empty. A trigger already fired for this call id proves on its own that the
 * close landed at or after the trigger time, so it stands in for the missing
 * meeting rather than dropping the report.
 */
export function recordMeetingClosed(
  guards: MutableJoinGuards,
  meetings: Meeting[],
  callId: string,
  closedAtMs: number,
  joinBeforeMinutes: number
): void {
  const meeting = meetings.find((m) => m.callId === callId);

  if (meeting) {
    const triggerAtMs = meeting.beginTime.getTime() - joinBeforeMinutes * 60 * 1000;
    if (closedAtMs >= triggerAtMs) {
      guards.suppressedMeetings.set(callId, closedAtMs);
    }
    return;
  }

  if (guards.triggeredMeetings.has(callId)) {
    guards.suppressedMeetings.set(callId, closedAtMs);
  }
}

/**
 * Drop join guards whose instance is far enough in the past to be irrelevant.
 * Deliberately independent of the parsed meeting list — see
 * `JOIN_GUARD_RETENTION_MS`.
 */
export function expireJoinGuards(
  guards: MutableJoinGuards,
  now: number = Date.now()
): void {
  const cutoff = now - JOIN_GUARD_RETENTION_MS;
  const maps = [
    guards.joinedMeetings,
    guards.suppressedMeetings,
    guards.triggeredMeetings,
  ];

  for (const map of maps) {
    for (const [callId, atMs] of map) {
      if (atMs < cutoff) map.delete(callId);
    }
  }
}
