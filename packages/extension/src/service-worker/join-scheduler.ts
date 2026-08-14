import type { Meeting } from "@meetcat/core";

/**
 * Pure selection logic for the service worker's precise join trigger,
 * extracted so the trigger guards (joined, suppressed, per-instance
 * triggered) are unit-testable.
 */

export interface JoinTriggerGuards {
  joinedMeetings: ReadonlySet<string>;
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
