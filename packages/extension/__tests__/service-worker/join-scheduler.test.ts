import { describe, it, expect } from "vitest";
import type { Meeting } from "@meetcat/core";
import {
  expireJoinGuards,
  recordMeetingClosed,
  selectNextJoinTrigger,
  JOIN_GUARD_RETENTION_MS,
  type JoinTriggerGuards,
  type JoinTriggerSettings,
  type MutableJoinGuards,
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
    joinedMeetings: new Map(),
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
      joinedMeetings: new Map([["abc", NOW]]),
      triggeredMeetings: new Map([["abc", m.beginTime.getTime()]]),
    });

    // Sanity: joined alone does NOT exclude the meeting before start
    expect(
      selectNextJoinTrigger([m], guards({ joinedMeetings: new Map([["abc", NOW]]) }), settings, NOW)
    ).not.toBeNull();

    expect(selectNextJoinTrigger([m], fired, settings, NOW)).toBeNull();
  });

  /**
   * Regression for the manual-join variant of the spin: when the user joins
   * by hand between trigger time and start, MEETING_JOINED reschedules while
   * no trigger ever fired, so the meeting is still selected (spin
   * precondition). handleJoinTrigger's joined branch must consume the
   * trigger by writing the triggered mark — after which selection stops.
   */
  it("stops re-selecting a manually joined meeting once its trigger is consumed", () => {
    // Meeting starts in 3 min with a 5-min lead: past trigger time, before start
    const m = meeting("abc", 3);
    const manualJoinSettings = { ...settings, joinBeforeMinutes: 5 };

    // State right after a manual join before start: joined, never triggered
    const afterManualJoin = guards({ joinedMeetings: new Map([["abc", NOW]]) });
    const selected = selectNextJoinTrigger([m], afterManualJoin, manualJoinSettings, NOW);
    expect(selected).not.toBeNull();
    expect(selected!.triggerTime).toBe(NOW); // zero delay — would spin

    // The joined branch marks the instance as triggered before rescheduling
    const afterConsume = guards({
      joinedMeetings: new Map([["abc", NOW]]),
      triggeredMeetings: new Map([["abc", m.beginTime.getTime()]]),
    });
    expect(selectNextJoinTrigger([m], afterConsume, manualJoinSettings, NOW)).toBeNull();
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
      guards({ joinedMeetings: new Map([["abc", NOW]]) }),
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

describe("expireJoinGuards", () => {
  function mutableGuards(atMs: number): MutableJoinGuards {
    return {
      joinedMeetings: new Map([["abc", atMs]]),
      suppressedMeetings: new Map([["abc", atMs]]),
      triggeredMeetings: new Map([["abc", atMs]]),
    };
  }

  /**
   * Regression: a homepage parse can transiently come back with zero cards
   * (Meet renders its schedule asynchronously, and the parse right after
   * navigating back from a meeting page regularly lands on a card-less DOM).
   * While the guards were pruned against that list, the next non-empty parse
   * re-fired the trigger for the meeting the user had just cancelled,
   * reopening the prep page for as long as the user kept cancelling.
   */
  it("keeps guards for a meeting missing from the current parse", () => {
    const g = mutableGuards(NOW);

    expireJoinGuards(g, NOW);

    expect(g.joinedMeetings.has("abc")).toBe(true);
    expect(g.suppressedMeetings.has("abc")).toBe(true);
    expect(g.triggeredMeetings.has("abc")).toBe(true);

    // The cancelled instance stays out of the schedule once the cards return
    const m = meeting("abc", 5);
    const result = selectNextJoinTrigger(
      [m],
      { ...g, triggeredMeetings: new Map([["abc", m.beginTime.getTime()]]) },
      settings,
      NOW
    );
    expect(result).toBeNull();
  });

  /**
   * Counterpart: guards must still expire, otherwise a call id reused by a
   * recurring meeting would stay joined/suppressed at its next occurrence.
   */
  it("drops guards older than the retention window", () => {
    const g = mutableGuards(NOW - JOIN_GUARD_RETENTION_MS - 1);

    expireJoinGuards(g, NOW);

    expect(g.joinedMeetings.size).toBe(0);
    expect(g.suppressedMeetings.size).toBe(0);
    expect(g.triggeredMeetings.size).toBe(0);
  });
});

describe("recordMeetingClosed", () => {
  function emptyGuards(): MutableJoinGuards {
    return {
      joinedMeetings: new Map(),
      suppressedMeetings: new Map(),
      triggeredMeetings: new Map(),
    };
  }

  /**
   * Regression: a close was recorded only while the meeting was still in the
   * parsed list. The list can lag behind the report — the homepage parse right
   * after navigating away from a meeting page can transiently come back empty —
   * and a close landing in that window was dropped entirely, leaving the
   * cancelled meeting eligible for auto-join.
   */
  it("suppresses a fired trigger whose meeting is missing from the parse", () => {
    const m = meeting("abc", 1);
    const g = emptyGuards();
    g.triggeredMeetings.set("abc", m.beginTime.getTime());

    // The homepage re-parsed empty before the close report arrived
    recordMeetingClosed(g, [], "abc", NOW, settings.joinBeforeMinutes);

    expect(g.suppressedMeetings.get("abc")).toBe(NOW);
    expect(
      selectNextJoinTrigger([m], { ...g, triggeredMeetings: new Map() }, settings, NOW)
    ).toBeNull();
  });

  /**
   * The stand-in above must not fire for a meeting whose trigger never went
   * off: an unknown call id carries no evidence that the close landed after a
   * trigger, so it must leave the meeting eligible.
   */
  it("ignores an untriggered meeting missing from the parse", () => {
    const g = emptyGuards();

    recordMeetingClosed(g, [], "abc", NOW, 1);

    expect(g.suppressedMeetings.size).toBe(0);
  });

  it("leaves a meeting closed before its trigger time eligible", () => {
    const m = meeting("abc", 10);
    const g = emptyGuards();

    recordMeetingClosed(g, [m], "abc", NOW, 1);

    expect(g.suppressedMeetings.size).toBe(0);
    expect(selectNextJoinTrigger([m], g, settings, NOW)).not.toBeNull();
  });

  it("suppresses a meeting closed at or after its trigger time", () => {
    const m = meeting("abc", 1);
    const g = emptyGuards();

    recordMeetingClosed(g, [m], "abc", NOW, 2);

    expect(g.suppressedMeetings.get("abc")).toBe(NOW);
    expect(selectNextJoinTrigger([m], g, settings, NOW)).toBeNull();
  });
});
