import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createHomepageOverlay } from "../../src/ui/homepage-overlay.js";
import type { Meeting } from "../../src/types.js";

describe("Homepage Overlay", () => {
  let dom: JSDOM;
  let document: Document;
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>");
    document = dom.window.document;
    container = document.body;

    // Mock global document for styles
    (globalThis as unknown as { document: Document }).document = document;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  function createMeeting(options: Partial<Meeting> = {}): Meeting {
    const now = Date.now();
    return {
      callId: "test-meet-id",
      url: "https://meet.google.com/test-meet-id",
      title: "Test Meeting",
      displayTime: "10:00 AM",
      beginTime: new Date(now + 10 * 60 * 1000), // 10 minutes from now
      endTime: new Date(now + 70 * 60 * 1000),
      eventId: null,
      startsInMinutes: 10,
      ...options,
    };
  }

  describe("createHomepageOverlay", () => {
    it("should create an overlay element", () => {
      const overlay = createHomepageOverlay(container);
      const el = container.querySelector(".meetcat-overlay");
      expect(el).not.toBeNull();
      overlay.destroy();
    });

    it("should show default message when no meeting", () => {
      const overlay = createHomepageOverlay(container);
      const title = container.querySelector(".meetcat-title");
      expect(title?.textContent).toBe("No upcoming meetings");
      overlay.destroy();
    });

    it("should use emoji icon by default", () => {
      const overlay = createHomepageOverlay(container);
      const icon = container.querySelector(".meetcat-icon");
      expect(icon?.tagName).toBe("SPAN");
      expect(icon?.textContent).toBe("🐱");
      overlay.destroy();
    });

    it("should use image icon when iconUrl provided", () => {
      const overlay = createHomepageOverlay(container, { iconUrl: "/test-icon.png" });
      const icon = container.querySelector(".meetcat-icon") as HTMLImageElement;
      expect(icon?.tagName).toBe("IMG");
      expect(icon?.src).toContain("test-icon.png");
      overlay.destroy();
    });
  });

  describe("update", () => {
    it("should display meeting title", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting({ title: "Daily Standup" });

      overlay.update(meeting);

      const title = container.querySelector(".meetcat-title");
      expect(title?.textContent).toContain("Daily Standup");
      overlay.destroy();
    });

    it("should show countdown for upcoming meeting", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting({
        beginTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
      });

      overlay.update(meeting);

      const subtitle = container.querySelector(".meetcat-subtitle");
      expect(subtitle?.textContent).toContain("in");
      overlay.destroy();
    });

    it("should show in progress for started meeting", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting({
        title: "Started Meeting",
        beginTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      });

      overlay.update(meeting);

      const title = container.querySelector(".meetcat-title");
      expect(title?.textContent).toContain("In progress:");
      expect(title?.textContent).toContain("Started Meeting");
      overlay.destroy();
    });

    it("should clear meeting info when set to null", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting();

      overlay.update(meeting);
      overlay.update(null);

      const title = container.querySelector(".meetcat-title");
      expect(title?.textContent).toBe("No upcoming meetings");
      overlay.destroy();
    });

    it("should update countdown periodically", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting({
        beginTime: new Date(Date.now() + 10 * 60 * 1000),
      });

      overlay.update(meeting);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // The display should still be updating (interval is running)
      const countdown = container.querySelector(".meetcat-countdown");
      expect(countdown).not.toBeNull();
      overlay.destroy();
    });
  });

  describe("destroy", () => {
    it("should remove overlay from DOM", () => {
      const overlay = createHomepageOverlay(container);
      expect(container.querySelector(".meetcat-overlay")).not.toBeNull();

      overlay.destroy();

      expect(container.querySelector(".meetcat-overlay")).toBeNull();
    });

    it("should stop the update interval", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting();
      overlay.update(meeting);

      overlay.destroy();

      // Should not throw even after advancing timers
      vi.advanceTimersByTime(5000);
    });
  });

  describe("formatTimeRemaining", () => {
    it("should format time correctly for minutes", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting({
        beginTime: new Date(Date.now() + 5 * 60 * 1000 + 30 * 1000), // 5:30
      });

      overlay.update(meeting);

      const countdown = container.querySelector(".meetcat-countdown");
      expect(countdown?.textContent).toMatch(/5:\d{2}/);
      overlay.destroy();
    });

    it("should format time with hours for long durations", () => {
      const overlay = createHomepageOverlay(container);
      const meeting = createMeeting({
        beginTime: new Date(Date.now() + 90 * 60 * 1000), // 1.5 hours
      });

      overlay.update(meeting);

      const countdown = container.querySelector(".meetcat-countdown");
      expect(countdown?.textContent).toContain("h");
      overlay.destroy();
    });
  });
});
