import { describe, expect, it } from "vitest";
import { HomepageRecoveryController } from "../../src/service-worker/homepage-recovery.js";
import type { Meeting } from "@meetcat/core";

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    callId: overrides.callId ?? "abc-defg-hij",
    url: overrides.url ?? "https://meet.google.com/abc-defg-hij",
    title: overrides.title ?? "Daily Standup",
    displayTime: overrides.displayTime ?? "10:00 AM",
    beginTime: overrides.beginTime ?? new Date("2026-02-06T10:00:00.000Z"),
    endTime: overrides.endTime ?? new Date("2026-02-06T11:00:00.000Z"),
    eventId: overrides.eventId ?? "event-1",
    startsInMinutes: overrides.startsInMinutes ?? 5,
  };
}

describe("HomepageRecoveryController", () => {
  it("defers in foreground and reloads in background with backoff", () => {
    const controller = new HomepageRecoveryController({
      staleThresholdMs: 1_000,
      backoffScheduleMs: [1_000, 2_000, 4_000],
      dailyReloadLimit: 5,
      getDayKey: () => "fixed",
    });
    const meetings = [meeting()];

    controller.evaluate({
      meetings,
      nowMs: 0,
      isHomepage: true,
      isForeground: true,
    });

    const deferred = controller.evaluate({
      meetings,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: true,
    });
    expect(deferred.evaluation.action).toBe("defer");
    expect(controller.hasPendingReload()).toBe(true);

    const reloaded = controller.evaluate({
      meetings,
      nowMs: 1_250,
      isHomepage: true,
      isForeground: false,
    });
    expect(reloaded.evaluation.action).toBe("reload");
    expect(controller.hasPendingReload()).toBe(false);

    const inCooldown = controller.evaluate({
      meetings,
      nowMs: 2_900,
      isHomepage: true,
      isForeground: false,
    });
    expect(inCooldown.evaluation.reason).toBe("cooldown");
  });

  it("resets the stale chain when fingerprint changes", () => {
    const controller = new HomepageRecoveryController({
      staleThresholdMs: 1_000,
      backoffScheduleMs: [1_000, 2_000, 4_000],
      dailyReloadLimit: 5,
      getDayKey: () => "fixed",
    });
    const meetingsA = [meeting({ title: "A" })];
    const meetingsB = [meeting({ title: "B" })];

    controller.evaluate({
      meetings: meetingsA,
      nowMs: 0,
      isHomepage: true,
      isForeground: false,
    });
    controller.evaluate({
      meetings: meetingsA,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
    });

    const changed = controller.evaluate({
      meetings: meetingsB,
      nowMs: 1_300,
      isHomepage: true,
      isForeground: false,
    });
    expect(changed.evaluation.reason).toBe("fingerprint_changed");

    const reloadAfterReset = controller.evaluate({
      meetings: meetingsB,
      nowMs: 2_400,
      isHomepage: true,
      isForeground: false,
    });
    expect(reloadAfterReset.evaluation.action).toBe("reload");
    expect(reloadAfterReset.evaluation.backoffMs).toBe(1_000);
  });
});
