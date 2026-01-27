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

      const meeting = parseMeetingCard(card, now);

      expect(meeting).not.toBeNull();
      expect(meeting!.callId).toBe("abc-defg-hij");
      expect(meeting!.url).toBe("https://meet.google.com/abc-defg-hij");
      expect(meeting!.title).toBe("Team Standup");
      expect(meeting!.displayTime).toBe("10:00 AM");
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
      const alreadyJoined = new Set(["soon-meet-ing"]);
      const next = getNextJoinableMeeting(meetings, { now, alreadyJoined });

      expect(next).not.toBeNull();
      expect(next!.callId).toBe("late-meet-ing");
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
  });
});
