import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createWakeDetector,
  DEFAULT_WAKE_DETECT_INTERVAL_MS,
} from "../src/utils/wake-detector.js";

describe("WakeDetector", () => {
  const BASE_TIME = new Date("2026-03-03T00:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers({ now: BASE_TIME });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Simulate system wake: jump Date.now forward, then advance timer clock
   * by one interval so the next tick fires and observes the time gap.
   */
  function simulateWake(jumpMs: number, intervalMs: number): void {
    vi.setSystemTime(Date.now() + jumpMs);
    vi.advanceTimersByTime(intervalMs);
  }

  it("does not fire callback during normal ticks", () => {
    const detector = createWakeDetector({ intervalMs: 100, thresholdMs: 1_000 });
    const onWake = vi.fn();

    detector.start(onWake);
    vi.advanceTimersByTime(500); // 5 normal ticks
    detector.stop();

    expect(onWake).not.toHaveBeenCalled();
  });

  it("fires callback when elapsed time exceeds threshold", () => {
    const detector = createWakeDetector({ intervalMs: 100, thresholdMs: 1_000 });
    const onWake = vi.fn();

    detector.start(onWake);
    vi.advanceTimersByTime(100); // one normal tick to establish lastTickMs
    expect(onWake).not.toHaveBeenCalled();

    simulateWake(2_000, 100);

    expect(onWake).toHaveBeenCalledTimes(1);
    expect(onWake).toHaveBeenCalledWith(
      expect.objectContaining({ thresholdMs: 1_000 }),
    );
    expect(onWake.mock.calls[0][0].elapsedMs).toBeGreaterThanOrEqual(1_000);
  });

  it("stops itself after detecting wake", () => {
    const detector = createWakeDetector({ intervalMs: 100, thresholdMs: 1_000 });
    const onWake = vi.fn();

    detector.start(onWake);
    vi.advanceTimersByTime(100);

    simulateWake(2_000, 100);
    expect(detector.isRunning()).toBe(false);

    // Further time jumps should not fire again
    simulateWake(5_000, 100);
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate start calls", () => {
    const detector = createWakeDetector({ intervalMs: 100, thresholdMs: 1_000 });
    const onWake1 = vi.fn();
    const onWake2 = vi.fn();

    detector.start(onWake1);
    detector.start(onWake2); // should be ignored

    vi.advanceTimersByTime(100);
    simulateWake(2_000, 100);

    expect(onWake1).toHaveBeenCalledTimes(1);
    expect(onWake2).not.toHaveBeenCalled();
  });

  it("can be restarted after stop", () => {
    const detector = createWakeDetector({ intervalMs: 100, thresholdMs: 1_000 });
    const onWake = vi.fn();

    detector.start(onWake);
    detector.stop();
    expect(detector.isRunning()).toBe(false);

    detector.start(onWake);
    expect(detector.isRunning()).toBe(true);

    vi.advanceTimersByTime(100);
    simulateWake(2_000, 100);
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("stop is safe to call when not running", () => {
    const detector = createWakeDetector();
    expect(() => detector.stop()).not.toThrow();
    expect(detector.isRunning()).toBe(false);
  });

  it("clamps thresholdMs to at least intervalMs", () => {
    // thresholdMs (100) < intervalMs (500), so it should be clamped to 500.
    const detector = createWakeDetector({ intervalMs: 500, thresholdMs: 100 });
    const onWake = vi.fn();

    detector.start(onWake);

    // A normal 500ms tick: elapsed = 500. If threshold were unclamped (100),
    // this would fire (500 > 100). But threshold is clamped to 500,
    // and 500 is not > 500 (strict), so it must not fire.
    vi.advanceTimersByTime(500);
    expect(onWake).not.toHaveBeenCalled();

    // A small time jump makes elapsed > clamped threshold
    simulateWake(100, 500); // elapsed ≈ 600 > 500
    expect(onWake).toHaveBeenCalledTimes(1);

    detector.stop();
  });

  it("uses default interval when no config provided", () => {
    const detector = createWakeDetector();
    const onWake = vi.fn();

    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    detector.start(onWake);

    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      DEFAULT_WAKE_DETECT_INTERVAL_MS,
    );

    detector.stop();
    setIntervalSpy.mockRestore();
  });

  it("reports correct elapsedMs in wake event", () => {
    const detector = createWakeDetector({ intervalMs: 10_000, thresholdMs: 60_000 });
    const onWake = vi.fn();

    detector.start(onWake);
    vi.advanceTimersByTime(10_000); // one normal tick

    // Simulate 5-minute sleep
    simulateWake(5 * 60 * 1_000, 10_000);

    expect(onWake).toHaveBeenCalledTimes(1);
    const event = onWake.mock.calls[0][0];
    expect(event.elapsedMs).toBeGreaterThanOrEqual(60_000);
    expect(event.thresholdMs).toBe(60_000);
  });
});
