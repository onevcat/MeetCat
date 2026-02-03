import { describe, it, expect } from "vitest";
import { createSchedulerLogic, DEFAULT_SCHEDULER_CONFIG } from "../src/scheduler/scheduler.js";
import type { Meeting } from "../src/types.js";

describe("Scheduler", () => {
  function createMeeting(options: {
    callId: string;
    title: string;
    startsInMinutes: number;
  }): Meeting {
    const now = Date.now();
    const beginTime = now + options.startsInMinutes * 60 * 1000;

    return {
      callId: options.callId,
      url: `https://meet.google.com/${options.callId}`,
      title: options.title,
      displayTime: "10:00 AM",
      beginTime: new Date(beginTime),
      endTime: new Date(beginTime + 60 * 60 * 1000),
      eventId: null,
      startsInMinutes: options.startsInMinutes,
    };
  }

  describe("createSchedulerLogic", () => {
    it("should create scheduler with default config", () => {
      const scheduler = createSchedulerLogic();
      const config = scheduler.getConfig();

      expect(config.joinBeforeMinutes).toBe(DEFAULT_SCHEDULER_CONFIG.joinBeforeMinutes);
      expect(config.maxMinutesAfterStart).toBe(DEFAULT_SCHEDULER_CONFIG.maxMinutesAfterStart);
    });

    it("should create scheduler with custom config", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 5,
        titleExcludeFilters: ["Standup"],
      });
      const config = scheduler.getConfig();

      expect(config.joinBeforeMinutes).toBe(5);
      expect(config.titleExcludeFilters).toEqual(["Standup"]);
    });
  });

  describe("check", () => {
    it("should return join event for meeting within threshold", () => {
      const scheduler = createSchedulerLogic({ joinBeforeMinutes: 2 });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting", startsInMinutes: 1 }),
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      expect(event.type).toBe("join");
      expect(event.meeting).not.toBeNull();
      expect(event.meeting!.callId).toBe("abc-defg-hij");
    });

    it("should return upcoming event for meeting outside threshold", () => {
      const scheduler = createSchedulerLogic({ joinBeforeMinutes: 2 });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting", startsInMinutes: 10 }),
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      expect(event.type).toBe("upcoming");
      expect(event.meeting).not.toBeNull();
      expect(event.minutesUntil).toBe(10);
    });

    it("should return none when no meetings", () => {
      const scheduler = createSchedulerLogic();
      const event = scheduler.check([], new Set(), new Map());

      expect(event.type).toBe("none");
      expect(event.meeting).toBeNull();
    });

    it("should not join if meeting is too far after start", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 1,
        maxMinutesAfterStart: 10,
      });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting", startsInMinutes: -20 }),
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      expect(event.type).toBe("none");
    });

    it("should skip already joined meetings", () => {
      const scheduler = createSchedulerLogic({ joinBeforeMinutes: 2 });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting 1", startsInMinutes: 1 }),
        createMeeting({ callId: "klm-nopq-rst", title: "Meeting 2", startsInMinutes: 5 }),
      ];
      const alreadyJoined = new Set(["abc-defg-hij"]);
      const now = Date.now();

      const event = scheduler.check(meetings, alreadyJoined, new Map(), now);

      expect(event.type).toBe("join");
      expect(event.meeting!.callId).toBe("abc-defg-hij");
    });

    it("should not skip joined meetings before they start", () => {
      const scheduler = createSchedulerLogic({ joinBeforeMinutes: 2 });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting 1", startsInMinutes: 5 }),
      ];
      const alreadyJoined = new Set(["abc-defg-hij"]);
      const now = Date.now();

      const event = scheduler.check(meetings, alreadyJoined, new Map(), now);

      expect(event.type).toBe("upcoming");
      expect(event.meeting!.callId).toBe("abc-defg-hij");
    });

    it("should skip suppressed meetings after trigger time", () => {
      const scheduler = createSchedulerLogic({ joinBeforeMinutes: 2 });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting 1", startsInMinutes: 1 }),
      ];
      const suppressed = new Map([["abc-defg-hij", Date.now()]]);
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), suppressed, now);

      expect(event.type).toBe("none");
      expect(event.meeting).toBeNull();
    });

    it("should exclude meetings by title filter", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 2,
        titleExcludeFilters: ["Standup"],
      });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Random Meeting", startsInMinutes: 1 }),
        createMeeting({ callId: "klm-nopq-rst", title: "Team Standup", startsInMinutes: 1 }),
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      // "Team Standup" should be excluded, so "Random Meeting" should be joined
      expect(event.type).toBe("join");
      expect(event.meeting!.callId).toBe("abc-defg-hij");
    });

    it("should support multiple exclude filters", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 2,
        titleExcludeFilters: ["1:1", "Optional"],
      });
      const meetings = [
        createMeeting({ callId: "aaa", title: "1:1 with Alice", startsInMinutes: 1 }),
        createMeeting({ callId: "bbb", title: "Optional: Team Sync", startsInMinutes: 1 }),
        createMeeting({ callId: "ccc", title: "Sprint Planning", startsInMinutes: 1 }),
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      // Both "1:1" and "Optional" meetings should be excluded
      expect(event.type).toBe("join");
      expect(event.meeting!.callId).toBe("ccc");
    });

    it("should be case-sensitive for exclude filters", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 2,
        titleExcludeFilters: ["standup"], // lowercase
      });
      const meetings = [
        createMeeting({ callId: "abc", title: "Team Standup", startsInMinutes: 1 }), // uppercase S
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      // "Standup" should NOT match "standup" (case-sensitive)
      expect(event.type).toBe("join");
      expect(event.meeting!.callId).toBe("abc");
    });

    it("should allow joining recently started meetings", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 2,
        maxMinutesAfterStart: 30,
      });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting", startsInMinutes: -5 }), // 5 min ago
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      expect(event.type).toBe("join");
      expect(event.meeting!.callId).toBe("abc-defg-hij");
    });

    it("should not join meetings started too long ago", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 2,
        maxMinutesAfterStart: 30,
      });
      const meetings = [
        createMeeting({ callId: "abc-defg-hij", title: "Meeting", startsInMinutes: -45 }), // 45 min ago
      ];
      const now = Date.now();

      const event = scheduler.check(meetings, new Set(), new Map(), now);

      expect(event.type).toBe("none");
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      const scheduler = createSchedulerLogic({ joinBeforeMinutes: 1 });

      scheduler.updateConfig({ joinBeforeMinutes: 5, titleExcludeFilters: ["Daily"] });

      const config = scheduler.getConfig();
      expect(config.joinBeforeMinutes).toBe(5);
      expect(config.titleExcludeFilters).toEqual(["Daily"]);
    });

    it("should preserve other config when updating", () => {
      const scheduler = createSchedulerLogic({
        joinBeforeMinutes: 1,
        titleExcludeFilters: ["Standup"],
      });

      scheduler.updateConfig({ joinBeforeMinutes: 5 });

      const config = scheduler.getConfig();
      expect(config.joinBeforeMinutes).toBe(5);
      expect(config.titleExcludeFilters).toEqual(["Standup"]);
    });
  });
});
