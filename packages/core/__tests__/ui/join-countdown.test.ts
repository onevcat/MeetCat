import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createJoinCountdown } from "../../src/ui/join-countdown.js";

describe("Join Countdown", () => {
  let dom: JSDOM;
  let document: Document;
  let container: HTMLElement;
  let onComplete: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>");
    document = dom.window.document;
    container = document.body;
    onComplete = vi.fn();
    onCancel = vi.fn();

    // Mock global document for styles
    (globalThis as unknown as { document: Document }).document = document;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe("createJoinCountdown", () => {
    it("should create a countdown overlay", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      const overlay = container.querySelector(".meetcat-overlay");
      expect(overlay).not.toBeNull();
      countdown.destroy();
    });

    it("should display initial seconds", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 10,
        onComplete,
        onCancel,
      });

      const countdownEl = container.querySelector(".meetcat-countdown");
      expect(countdownEl?.textContent).toBe("10s");
      countdown.destroy();
    });

    it("should use emoji icon by default", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      const icon = container.querySelector(".meetcat-icon");
      expect(icon?.tagName).toBe("SPAN");
      expect(icon?.textContent).toBe("🐱");
      countdown.destroy();
    });

    it("should use image icon when iconUrl provided", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
        iconUrl: "/icon.png",
      });

      const icon = container.querySelector(".meetcat-icon") as HTMLImageElement;
      expect(icon?.tagName).toBe("IMG");
      countdown.destroy();
    });

    it("should show progress bar at 100%", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      const progressBar = container.querySelector(".meetcat-progress-bar") as HTMLElement;
      expect(progressBar?.style.width).toBe("100%");
      countdown.destroy();
    });

    it("should have a cancel button", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      const cancelBtn = container.querySelector(".meetcat-btn-cancel");
      expect(cancelBtn).not.toBeNull();
      expect(cancelBtn?.textContent).toBe("Cancel");
      countdown.destroy();
    });
  });

  describe("start", () => {
    it("should decrement countdown each second", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      countdown.start();

      vi.advanceTimersByTime(1000);
      const countdownEl = container.querySelector(".meetcat-countdown");
      expect(countdownEl?.textContent).toBe("4s");
      countdown.destroy();
    });

    it("should update progress bar", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 10,
        onComplete,
        onCancel,
      });

      countdown.start();

      vi.advanceTimersByTime(5000);
      const progressBar = container.querySelector(".meetcat-progress-bar") as HTMLElement;
      expect(progressBar?.style.width).toBe("50%");
      countdown.destroy();
    });

    it("should call onComplete when countdown reaches 0", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 3,
        onComplete,
        onCancel,
      });

      countdown.start();

      vi.advanceTimersByTime(3000);
      expect(onComplete).toHaveBeenCalledTimes(1);
      countdown.destroy();
    });

    it("should not restart if already started", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      countdown.start();
      countdown.start(); // Second call should be ignored

      vi.advanceTimersByTime(5000);
      expect(onComplete).toHaveBeenCalledTimes(1);
      countdown.destroy();
    });
  });

  describe("cancel", () => {
    it("should call onCancel when cancelled", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 10,
        onComplete,
        onCancel,
      });

      countdown.start();
      countdown.cancel();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
      countdown.destroy();
    });

    it("should stop the countdown timer", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 3,
        onComplete,
        onCancel,
      });

      countdown.start();
      vi.advanceTimersByTime(1000);
      countdown.cancel();
      vi.advanceTimersByTime(5000);

      expect(onComplete).not.toHaveBeenCalled();
      countdown.destroy();
    });

    it("should trigger onCancel when cancel button is clicked", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 10,
        onComplete,
        onCancel,
      });

      countdown.start();

      const cancelBtn = container.querySelector(".meetcat-btn-cancel") as HTMLButtonElement;
      cancelBtn.click();

      expect(onCancel).toHaveBeenCalledTimes(1);
      countdown.destroy();
    });
  });

  describe("destroy", () => {
    it("should remove overlay from DOM", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      expect(container.querySelector(".meetcat-overlay")).not.toBeNull();
      countdown.destroy();
      expect(container.querySelector(".meetcat-overlay")).toBeNull();
    });

    it("should stop the countdown timer", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 3,
        onComplete,
        onCancel,
      });

      countdown.start();
      countdown.destroy();
      vi.advanceTimersByTime(5000);

      expect(onComplete).not.toHaveBeenCalled();
    });

    it("should not call onComplete after destroy", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 2,
        onComplete,
        onCancel,
      });

      countdown.start();
      vi.advanceTimersByTime(1000);
      countdown.destroy();
      vi.advanceTimersByTime(2000);

      expect(onComplete).not.toHaveBeenCalled();
    });

    it("should not call onCancel after destroy when clicking cancelled button", () => {
      const countdown = createJoinCountdown(container, {
        seconds: 5,
        onComplete,
        onCancel,
      });

      countdown.start();
      countdown.destroy();

      // The button is removed, so this shouldn't do anything
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
