import { describe, it, expect } from "vitest";
import type { Meeting } from "@meetcat/core";
import {
  selectNextJoinTrigger,
  type JoinTriggerGuards,
  type JoinTriggerSettings,
} from "../../src/service-worker/join-scheduler.js";

const NOW = Date.UTC(2026, 7, 14, 2, 0, 0);

function meeting(callId: string, startsInMinutes: number, title = "Meeting"): Meeting {
  const beginMs = NOW + startsInMinutes * 60 * 1000;
  return {
    callId,
    url: `https://meet.google.com/home?meetcatJoin=${callId}`,
    title,
    displayTime: "11:00",
    beginTime: new Date(beginMs),
    endTime: new Date(beginMs + 45 * 60 * 1000),
    eventId: callId,
    startsInMinutes,
  };
}

function guards(overrides: Partial<JoinTriggerGuards> = {}): JoinTriggerGuards {
  return {
    joinedMeetings: new Set(),
    suppressedMeetings: new Map(),
    triggeredMeetings: new Map(),
    ...overrides,
  };
}

const settings: JoinTriggerSettings = {
  joinBeforeMinutes: 1,
  maxMinutesAfterStart: 10,
  titleExcludeFilters: [],
};

describe("selectNextJoinTrigger", () => {
  it("schedules a future meeting at its trigger time", () => {
    const m = meeting("abc", 5);
    const result = selectNextJoinTrigger([m], guards(), settings, NOW);

    expect(result).not.toBeNull();
    expect(result!.meeting.callId).toBe("abc");
    expect(result!.triggerTime).toBe(m.beginTime.getTime() - 60 * 1000);
  });

  it("schedules an overdue meeting immediately within the join window", () => {
    const result = selectNextJoinTrigger([meeting("abc", -5)], guards(), settings, NOW);

    expect(result).not.toBeNull();
    expect(result!.triggerTime).toBe(NOW);
  });

  /**
   * Regression: after the trigger fires, openMeeting marks the meeting as
   * joined, but the joined guard is time-scoped and does not apply before
   * the meeting starts. Without the per-instance triggered guard the
   * re-scheduling that follows re-selected the same meeting with zero
   * delay, spinning until the meeting start.
   */
  it("does not re-select a triggered instance before the meeting starts", () => {
    const m = meeting("abc", 5);
    const fired = guards({
      joinedMeetings: new Set(["abc"]),
      triggeredMeetings: new Map([["abc", m.beginTime.getTime()]]),
    });

    // Sanity: joined alone does NOT exclude the meeting before start
    expect(
      selectNextJoinTrigger([m], guards({ joinedMeetings: new Set(["abc"]) }), settings, NOW)
    ).not.toBeNull();

    expect(selectNextJoinTrigger([m], fired, settings, NOW)).toBeNull();
  });

  it("still selects the next occurrence of a recurring call id", () => {
    const today = meeting("abc", 5);
    const yesterdayBeginMs = today.beginTime.getTime() - 24 * 60 * 60 * 1000;
    const fired = guards({
      triggeredMeetings: new Map([["abc", yesterdayBeginMs]]),
    });

    const result = selectNextJoinTrigger([today], fired, settings, NOW);

    expect(result).not.toBeNull();
    expect(result!.meeting.callId).toBe("abc");
  });

  it("skips suppressed meetings after trigger time", () => {
    const result = selectNextJoinTrigger(
      [meeting("abc", 0)],
      guards({ suppressedMeetings: new Map([["abc", NOW]]) }),
      settings,
      NOW
    );

    expect(result).toBeNull();
  });

  it("skips joined meetings after they start", () => {
    const result = selectNextJoinTrigger(
      [meeting("abc", -2)],
      guards({ joinedMeetings: new Set(["abc"]) }),
      settings,
      NOW
    );

    expect(result).toBeNull();
  });

  it("skips ended meetings and respects exclude filters", () => {
    const ended = meeting("ended", -60);
    const excluded = meeting("excluded", 5, "Optional: Sync");

    const result = selectNextJoinTrigger(
      [ended, excluded],
      guards(),
      { ...settings, titleExcludeFilters: ["Optional"] },
      NOW
    );

    expect(result).toBeNull();
  });

  it("picks the earliest trigger among candidates", () => {
    const result = selectNextJoinTrigger(
      [meeting("later", 30), meeting("sooner", 5)],
      guards(),
      settings,
      NOW
    );

    expect(result!.meeting.callId).toBe("sooner");
  });
});
