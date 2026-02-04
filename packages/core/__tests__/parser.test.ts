import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseMeetingCards,
  parseMeetingCard,
  getNextJoinableMeeting,
  MEETING_CARD_SELECTOR,
} from "../src/parser/meeting-cards.js";
import type { Meeting } from "../src/types.js";

describe("Parser", () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    document = dom.window.document;
  });

  function createMeetingCard(options: {
    callId: string;
    beginTime: number;
    endTime: number;
    title?: string;
    displayTime?: string;
    eventId?: string;
  }): HTMLElement {
    const card = document.createElement("div");
    card.setAttribute("data-call-id", options.callId);
    card.setAttribute("data-begin-time", options.beginTime.toString());
    card.setAttribute("data-end-time", options.endTime.toString());
    if (options.eventId) {
      card.setAttribute("data-event-id", options.eventId);
    }

    // Add title element
    const titleEl = document.createElement("div");
    titleEl.className = "mobgod";
    titleEl.textContent = options.title || "Test Meeting";
    card.appendChild(titleEl);

    // Add time element
    const timeEl = document.createElement("div");
    timeEl.className = "AKhouc";
    timeEl.textContent = options.displayTime || "10:00 AM";
    card.appendChild(timeEl);

    return card;
  }

  describe("parseMeetingCard", () => {
    it("should parse a valid meeting card", () => {
      const now = Date.now();
      const card = createMeetingCard({
        callId: "abc-defg-hij",
        beginTime: now + 10 * 60 * 1000, // 10 minutes from now
        endTime: now + 70 * 60 * 1000,
        title: "Team Standup",
        displayTime: "10:00 AM",
        eventId: "event123",
      });
      card.setAttribute("aria-label", "10:00 AM to 11:00 AM. Team Standup.");

      const meeting = parseMeetingCard(card, now);

      expect(meeting).not.toBeNull();
      expect(meeting!.callId).toBe("abc-defg-hij");
      expect(meeting!.url).toBe("https://meet.google.com/abc-defg-hij");
      expect(meeting!.title).toBe("Team Standup");
      expect(meeting!.displayTime).toBeDefined();
      expect(meeting!.eventId).toBe("event123");
      expect(meeting!.startsInMinutes).toBe(10);
    });

    it("should return null for card without call-id", () => {
      const card = document.createElement("div");
      const meeting = parseMeetingCard(card);
      expect(meeting).toBeNull();
    });

    it("should return null for card without begin-time", () => {
      const card = document.createElement("div");
      card.setAttribute("data-call-id", "abc-defg-hij");
      const meeting = parseMeetingCard(card);
      expect(meeting).toBeNull();
    });

    it("should handle negative startsInMinutes for past meetings", () => {
      const now = Date.now();
      const card = createMeetingCard({
        callId: "abc-defg-hij",
        beginTime: now - 10 * 60 * 1000, // 10 minutes ago
        endTime: now + 50 * 60 * 1000,
      });

      const meeting = parseMeetingCard(card, now);

      expect(meeting).not.toBeNull();
      expect(meeting!.startsInMinutes).toBe(-10);
    });

    it("should return null for invalid begin/end timestamps", () => {
      const now = Date.now();
      const card = document.createElement("div");
      card.setAttribute("data-call-id", "abc-defg-hij");
      card.setAttribute("data-begin-time", "not-a-number");
      card.setAttribute("data-end-time", (now + 60 * 60 * 1000).toString());

      const meeting = parseMeetingCard(card, now);

      expect(meeting).toBeNull();
    });

    it("should use aria-label title when title element is missing", () => {
      const now = Date.now();
      const card = document.createElement("div");
      card.setAttribute("data-call-id", "abc-defg-hij");
      card.setAttribute("data-begin-time", (now + 5 * 60 * 1000).toString());
      card.setAttribute("data-end-time", (now + 65 * 60 * 1000).toString());
      card.setAttribute("aria-label", "10:00。From Aria Label");

      const meeting = parseMeetingCard(card, now);

      expect(meeting).not.toBeNull();
      expect(meeting!.title).toBe("From Aria Label");
    });

    it("should fall back to Unknown title when no title is available", () => {
      const now = Date.now();
      const card = document.createElement("div");
      card.setAttribute("data-call-id", "abc-defg-hij");
      card.setAttribute("data-begin-time", (now + 5 * 60 * 1000).toString());
      card.setAttribute("data-end-time", (now + 65 * 60 * 1000).toString());
      card.setAttribute("aria-label", "No separator");

      const meeting = parseMeetingCard(card, now);

      expect(meeting).not.toBeNull();
      expect(meeting!.title).toBe("No separator");
    });

    it("should extract title from aria label when classnames change", () => {
      const now = Date.now();
      const card = createMeetingCard({
        callId: "abc-defg-hij",
        beginTime: now + 10 * 60 * 1000,
        endTime: now + 70 * 60 * 1000,
      });
      card.querySelector(".mobgod")?.remove();
      card.querySelector(".AKhouc")?.remove();
      card.setAttribute("aria-label", "11:30 PM to 12:30 AM. 123123.");

      const meeting = parseMeetingCard(card, now);

      expect(meeting).not.toBeNull();
      expect(meeting!.title).toBe("123123");
    });

    it("should return null for hidden cards", () => {
      const now = Date.now();
      const card = createMeetingCard({
        callId: "abc-defg-hij",
        beginTime: now + 10 * 60 * 1000,
        endTime: now + 70 * 60 * 1000,
      });
      card.setAttribute("aria-hidden", "true");

      const meeting = parseMeetingCard(card, now);

      expect(meeting).toBeNull();
    });

    it("should return null when a parent is hidden", () => {
      const now = Date.now();
      const wrapper = document.createElement("div");
      wrapper.setAttribute("hidden", "");
      const card = createMeetingCard({
        callId: "parent-hidden",
        beginTime: now + 10 * 60 * 1000,
        endTime: now + 70 * 60 * 1000,
      });
      wrapper.appendChild(card);
      document.body.appendChild(wrapper);

      const meeting = parseMeetingCard(card, now);

      expect(meeting).toBeNull();
    });
  });

  describe("parseMeetingCards", () => {
    it("should parse multiple meeting cards", () => {
      const now = Date.now();
      const card1 = createMeetingCard({
        callId: "abc-defg-hij",
        beginTime: now + 30 * 60 * 1000,
        endTime: now + 90 * 60 * 1000,
        title: "Meeting 1",
      });
      const card2 = createMeetingCard({
        callId: "klm-nopq-rst",
        beginTime: now + 10 * 60 * 1000,
        endTime: now + 70 * 60 * 1000,
        title: "Meeting 2",
      });

      document.body.appendChild(card1);
      document.body.appendChild(card2);

      const result = parseMeetingCards(document, now);

      expect(result.cardsFound).toBe(2);
      expect(result.meetings).toHaveLength(2);
      // Should be sorted by start time
      expect(result.meetings[0].title).toBe("Meeting 2"); // Earlier
      expect(result.meetings[1].title).toBe("Meeting 1"); // Later
    });

    it("should return empty array when no cards found", () => {
      const result = parseMeetingCards(document);

      expect(result.cardsFound).toBe(0);
      expect(result.meetings).toHaveLength(0);
    });

    it("should work with container element", () => {
      const now = Date.now();
      const container = document.createElement("div");
      const card = createMeetingCard({
        callId: "abc-defg-hij",
        beginTime: now + 10 * 60 * 1000,
        endTime: now + 70 * 60 * 1000,
      });
      container.appendChild(card);
      document.body.appendChild(container);

      const result = parseMeetingCards(container, now);

      expect(result.cardsFound).toBe(1);
      expect(result.meetings).toHaveLength(1);
    });

    it("should ignore hidden cards", () => {
      const now = Date.now();
      const visible = createMeetingCard({
        callId: "abc-defg-hij",
        beginTime: now + 10 * 60 * 1000,
        endTime: now + 70 * 60 * 1000,
        title: "Visible Meeting",
      });
      const hidden = createMeetingCard({
        callId: "klm-nopq-rst",
        beginTime: now + 20 * 60 * 1000,
        endTime: now + 80 * 60 * 1000,
        title: "Hidden Meeting",
      });
      hidden.setAttribute("style", "display: none;");

      document.body.appendChild(visible);
      document.body.appendChild(hidden);

      const result = parseMeetingCards(document, now);

      expect(result.cardsFound).toBe(2);
      expect(result.meetings).toHaveLength(1);
      expect(result.meetings[0].title).toBe("Visible Meeting");
      expect(result.hiddenCards).toBe(1);
      expect(result.hiddenReasons?.["inline-style-hidden"]).toBe(1);
    });
  });

  describe("getNextJoinableMeeting", () => {
    const now = Date.now();
    const meetings: Meeting[] = [
      {
        callId: "past-meet-ing",
        url: "https://meet.google.com/past-meet-ing",
        title: "Past Meeting",
        displayTime: "8:00 AM",
        beginTime: new Date(now - 60 * 60 * 1000), // 1 hour ago
        endTime: new Date(now),
        eventId: null,
        startsInMinutes: -60,
      },
      {
        callId: "soon-meet-ing",
        url: "https://meet.google.com/soon-meet-ing",
        title: "Soon Meeting",
        displayTime: "10:00 AM",
        beginTime: new Date(now + 2 * 60 * 1000), // 2 minutes from now
        endTime: new Date(now + 62 * 60 * 1000),
        eventId: null,
        startsInMinutes: 2,
      },
      {
        callId: "late-meet-ing",
        url: "https://meet.google.com/late-meet-ing",
        title: "Late Meeting",
        displayTime: "2:00 PM",
        beginTime: new Date(now + 4 * 60 * 60 * 1000), // 4 hours from now
        endTime: new Date(now + 5 * 60 * 60 * 1000),
        eventId: null,
        startsInMinutes: 240,
      },
    ];

    it("should return the next upcoming meeting", () => {
      const next = getNextJoinableMeeting(meetings, { now });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("soon-meet-ing");
    });

    it("should skip already joined meetings", () => {
      const recentlyStarted: Meeting = {
        callId: "just-star-ted",
        url: "https://meet.google.com/just-star-ted",
        title: "Just Started",
        displayTime: "9:58 AM",
        beginTime: new Date(now - 2 * 60 * 1000), // 2 minutes ago
        endTime: new Date(now + 58 * 60 * 1000),
        eventId: null,
        startsInMinutes: -2,
      };
      const alreadyJoined = new Set(["just-star-ted"]);
      const next = getNextJoinableMeeting([recentlyStarted, ...meetings], {
        now,
        alreadyJoined,
      });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("soon-meet-ing");
    });

    it("should not skip already joined meetings before they start", () => {
      const alreadyJoined = new Set(["soon-meet-ing"]);
      const next = getNextJoinableMeeting(meetings, { now, alreadyJoined });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("soon-meet-ing");
    });

    it("should filter by title", () => {
      const next = getNextJoinableMeeting(meetings, {
        now,
        titleFilter: "Late",
      });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("late-meet-ing");
    });

    it("should return null when no meetings match", () => {
      const next = getNextJoinableMeeting(meetings, {
        now,
        titleFilter: "NonExistent",
      });

      expect(next).toBeNull();
    });

    it("should include recently started meetings within grace period", () => {
      const recentlyStarted: Meeting = {
        callId: "just-star-ted",
        url: "https://meet.google.com/just-star-ted",
        title: "Just Started",
        displayTime: "9:58 AM",
        beginTime: new Date(now - 2 * 60 * 1000), // 2 minutes ago
        endTime: new Date(now + 58 * 60 * 1000),
        eventId: null,
        startsInMinutes: -2,
      };

      const next = getNextJoinableMeeting([recentlyStarted], {
        now,
        gracePeriodMinutes: 5,
      });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("just-star-ted");
    });

    it("should skip suppressed meetings after trigger time", () => {
      const startingSoon: Meeting = {
        callId: "starting-soon",
        url: "https://meet.google.com/starting-soon",
        title: "Starting Soon",
        displayTime: "10:00 AM",
        beginTime: new Date(now + 2 * 60 * 1000),
        endTime: new Date(now + 62 * 60 * 1000),
        eventId: null,
        startsInMinutes: 2,
      };

      const next = getNextJoinableMeeting([startingSoon], {
        now,
        joinBeforeMinutes: 1,
        suppressedMeetings: new Set(["starting-soon"]),
      });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("starting-soon");

      const afterTrigger = now + 90 * 1000;
      const nextAfterTrigger = getNextJoinableMeeting([startingSoon], {
        now: afterTrigger,
        joinBeforeMinutes: 1,
        suppressedMeetings: new Set(["starting-soon"]),
      });

      expect(nextAfterTrigger).toBeNull();
    });

    it("should skip meetings that have already ended", () => {
      const endedMeeting: Meeting = {
        callId: "ended-meet-ing",
        url: "https://meet.google.com/ended-meet-ing",
        title: "Ended Meeting",
        displayTime: "9:00 AM",
        beginTime: new Date(now - 30 * 60 * 1000),
        endTime: new Date(now - 5 * 60 * 1000),
        eventId: null,
        startsInMinutes: -30,
      };

      const next = getNextJoinableMeeting([endedMeeting], { now });

      expect(next).toBeNull();
    });

    it("should use default grace period when not provided", () => {
      const startedWithinDefault: Meeting = {
        callId: "started-7m-ago",
        url: "https://meet.google.com/started-7m-ago",
        title: "Started 7 Minutes Ago",
        displayTime: "9:53 AM",
        beginTime: new Date(now - 7 * 60 * 1000), // 7 minutes ago
        endTime: new Date(now + 53 * 60 * 1000),
        eventId: null,
        startsInMinutes: -7,
      };

      const next = getNextJoinableMeeting([startedWithinDefault], { now });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("started-7m-ago");
    });
  });
});
