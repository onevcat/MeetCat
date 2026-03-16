import { describe, expect, it } from "vitest";
import {
  createHomepageReloadWatchdog,
  createMeetingsFingerprint,
  DEFAULT_HOMEPAGE_FORCE_STALE_THRESHOLD_MS,
} from "../src/utils/homepage-reload-watchdog.js";
import type { Meeting } from "../src/types.js";

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  const beginTime = overrides.beginTime ?? new Date("2026-02-06T10:00:00.000Z");
  const endTime = overrides.endTime ?? new Date("2026-02-06T11:00:00.000Z");
  return {
    callId: overrides.callId ?? "abc-defg-hij",
    url: overrides.url ?? "https://meet.google.com/abc-defg-hij",
    title: overrides.title ?? "Daily Standup",
    displayTime: overrides.displayTime ?? "10:00 AM",
    beginTime,
    endTime,
    eventId: overrides.eventId ?? "event-1",
    startsInMinutes: overrides.startsInMinutes ?? 5,
  };
}

describe("createMeetingsFingerprint", () => {
  it("ignores relative fields and display formatting noise", () => {
    const base = meeting({
      displayTime: "10:00 AM",
      startsInMinutes: 5,
      title: "Daily   Standup",
    });
    const changed = meeting({
      displayTime: "10:01 AM",
      startsInMinutes: 4,
      title: "Daily Standup",
    });

    expect(createMeetingsFingerprint([base])).toBe(createMeetingsFingerprint([changed]));
  });

  it("changes when stable identity fields change", () => {
    const base = meeting();
    const changedCallId = meeting({ callId: "xyz-uvwx-rst", url: "https://meet.google.com/xyz-uvwx-rst" });
    const changedTitle = meeting({ title: "Weekly Planning" });
    const changedBegin = meeting({ beginTime: new Date("2026-02-06T10:30:00.000Z") });

    const baseFingerprint = createMeetingsFingerprint([base]);

    expect(createMeetingsFingerprint([changedCallId])).not.toBe(baseFingerprint);
    expect(createMeetingsFingerprint([changedTitle])).not.toBe(baseFingerprint);
    expect(createMeetingsFingerprint([changedBegin])).not.toBe(baseFingerprint);
  });

  it("returns stable value for empty array", () => {
    expect(createMeetingsFingerprint([])).toBe("0:empty");
    expect(createMeetingsFingerprint([])).toBe(createMeetingsFingerprint([]));
  });

  it("handles meetings with invalid dates gracefully", () => {
    const m = meeting({
      beginTime: new Date("invalid"),
      endTime: new Date("invalid"),
    });
    const fingerprint = createMeetingsFingerprint([m]);
    expect(fingerprint).toMatch(/^1:/);
    // Should be stable across calls
    expect(createMeetingsFingerprint([m])).toBe(fingerprint);
  });

  it("produces same fingerprint regardless of meeting order", () => {
    const m1 = meeting({ callId: "aaa-bbbb-ccc", title: "Alpha" });
    const m2 = meeting({ callId: "xxx-yyyy-zzz", title: "Beta" });
    expect(createMeetingsFingerprint([m1, m2])).toBe(createMeetingsFingerprint([m2, m1]));
  });
});

describe("HomepageReloadWatchdog", () => {
  const config = {
    staleThresholdMs: 1_000,
    backoffScheduleMs: [1_000, 2_000, 4_000],
    dailyReloadLimit: 3,
    getDayKey: (nowMs: number) => (nowMs < 10_000 ? "day-a" : "day-b"),
  };

  it("defers when stale in foreground, then reloads after background", () => {
    const watchdog = createHomepageReloadWatchdog(config);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({
      fingerprint,
      nowMs: 0,
      isHomepage: true,
      isForeground: true,
    });

    const deferred = watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: true,
    });
    expect(deferred.action).toBe("defer");
    expect(deferred.reason).toBe("foreground");
    expect(deferred.pendingReload).toBe(true);
    expect(deferred.stateChanged).toBe(true);

    const reloaded = watchdog.evaluate({
      fingerprint,
      nowMs: 1_250,
      isHomepage: true,
      isForeground: false,
    });
    expect(reloaded.action).toBe("reload");
    expect(reloaded.reason).toBe("reload");
    expect(reloaded.pendingReload).toBe(false);
    expect(reloaded.consecutiveReloadsWithoutChange).toBe(1);
  });

  it("applies exponential backoff 30->60->120 style progression", () => {
    const watchdog = createHomepageReloadWatchdog(config);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({
      fingerprint,
      nowMs: 0,
      isHomepage: true,
      isForeground: false,
    });

    const firstReload = watchdog.evaluate({
      fingerprint,
      nowMs: 1_100,
      isHomepage: true,
      isForeground: false,
    });
    expect(firstReload.action).toBe("reload");

    const cooldown2 = watchdog.evaluate({
      fingerprint,
      nowMs: 2_900,
      isHomepage: true,
      isForeground: false,
    });
    expect(cooldown2.reason).toBe("cooldown");
    expect(cooldown2.cooldownRemainingMs).toBeGreaterThan(0);

    const secondReload = watchdog.evaluate({
      fingerprint,
      nowMs: 3_200,
      isHomepage: true,
      isForeground: false,
    });
    expect(secondReload.action).toBe("reload");
    expect(secondReload.consecutiveReloadsWithoutChange).toBe(2);

    const cooldown3 = watchdog.evaluate({
      fingerprint,
      nowMs: 6_900,
      isHomepage: true,
      isForeground: false,
    });
    expect(cooldown3.reason).toBe("cooldown");

    const thirdReload = watchdog.evaluate({
      fingerprint,
      nowMs: 7_300,
      isHomepage: true,
      isForeground: false,
    });
    expect(thirdReload.action).toBe("reload");
    expect(thirdReload.consecutiveReloadsWithoutChange).toBe(3);
  });

  it("resets pending and backoff when fingerprint changes", () => {
    const watchdog = createHomepageReloadWatchdog(config);
    const fingerprintA = createMeetingsFingerprint([meeting({ title: "A" })]);
    const fingerprintB = createMeetingsFingerprint([meeting({ title: "B" })]);

    watchdog.evaluate({
      fingerprint: fingerprintA,
      nowMs: 0,
      isHomepage: true,
      isForeground: false,
    });
    watchdog.evaluate({
      fingerprint: fingerprintA,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: true,
    });

    const changed = watchdog.evaluate({
      fingerprint: fingerprintB,
      nowMs: 1_300,
      isHomepage: true,
      isForeground: true,
    });
    expect(changed.reason).toBe("fingerprint_changed");
    expect(changed.pendingReload).toBe(false);
    expect(changed.consecutiveReloadsWithoutChange).toBe(0);

    const freshReload = watchdog.evaluate({
      fingerprint: fingerprintB,
      nowMs: 2_400,
      isHomepage: true,
      isForeground: false,
    });
    expect(freshReload.action).toBe("reload");
    expect(freshReload.backoffMs).toBe(1_000);
  });

  it("enforces daily limit and resets on next day", () => {
    const watchdog = createHomepageReloadWatchdog({
      ...config,
      dailyReloadLimit: 2,
    });
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({
      fingerprint,
      nowMs: 0,
      isHomepage: true,
      isForeground: false,
    });

    watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
    });
    watchdog.evaluate({
      fingerprint,
      nowMs: 3_400,
      isHomepage: true,
      isForeground: false,
    });

    const limited = watchdog.evaluate({
      fingerprint,
      nowMs: 8_000,
      isHomepage: true,
      isForeground: false,
    });
    expect(limited.reason).toBe("daily_limit");
    expect(limited.reloadCountToday).toBe(2);

    const nextDayReload = watchdog.evaluate({
      fingerprint,
      nowMs: 12_500,
      isHomepage: true,
      isForeground: false,
    });
    expect(nextDayReload.action).toBe("reload");
    expect(nextDayReload.reloadCountToday).toBe(1);
  });

  it("never reloads outside homepage", () => {
    const watchdog = createHomepageReloadWatchdog(config);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({
      fingerprint,
      nowMs: 0,
      isHomepage: true,
      isForeground: false,
    });

    const result = watchdog.evaluate({
      fingerprint,
      nowMs: 1_500,
      isHomepage: false,
      isForeground: false,
    });
    expect(result.action).toBe("none");
    expect(result.reason).toBe("not_homepage");
  });

  it("returns not_stale when fingerprint is unchanged within threshold", () => {
    const watchdog = createHomepageReloadWatchdog(config);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    const result = watchdog.evaluate({
      fingerprint,
      nowMs: 500, // < staleThresholdMs (1000)
      isHomepage: true,
      isForeground: false,
    });
    expect(result.action).toBe("none");
    expect(result.reason).toBe("not_stale");
    expect(result.staleForMs).toBe(500);
  });

  it("daily limit blocks force_stale reload", () => {
    const forceConfig = {
      ...config,
      dailyReloadLimit: 1,
      forceStaleThresholdMs: 5_000,
    };
    const watchdog = createHomepageReloadWatchdog(forceConfig);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    // Use up the daily limit with a background reload
    const reloaded = watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
    });
    expect(reloaded.action).toBe("reload");
    expect(reloaded.reloadCountToday).toBe(1);

    // Now exceed force threshold in foreground — daily_limit should block it
    const blocked = watchdog.evaluate({
      fingerprint,
      nowMs: 6_000,
      isHomepage: true,
      isForeground: true,
    });
    expect(blocked.action).toBe("none");
    expect(blocked.reason).toBe("daily_limit");
  });

  it("clamps forceStaleThresholdMs to at least staleThresholdMs", () => {
    const clampConfig = {
      staleThresholdMs: 2_000,
      forceStaleThresholdMs: 500, // lower than staleThresholdMs
      backoffScheduleMs: [1_000],
      dailyReloadLimit: 8,
      getDayKey: () => "day",
    };
    const watchdog = createHomepageReloadWatchdog(clampConfig);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: true });

    // At 1_500ms: past the configured forceStaleThresholdMs (500) but within
    // staleThresholdMs (2_000). If clamping works, this should be not_stale.
    const result = watchdog.evaluate({
      fingerprint,
      nowMs: 1_500,
      isHomepage: true,
      isForeground: true,
    });
    expect(result.action).toBe("none");
    expect(result.reason).toBe("not_stale");

    // At 2_500ms: past staleThresholdMs but force threshold is clamped to 2_000,
    // so it should force reload in foreground.
    const forced = watchdog.evaluate({
      fingerprint,
      nowMs: 2_500,
      isHomepage: true,
      isForeground: true,
    });
    expect(forced.action).toBe("reload");
    expect(forced.reason).toBe("force_stale");
  });

  it("uses default 4-hour force stale threshold when not configured", () => {
    const defaultWatchdog = createHomepageReloadWatchdog({
      staleThresholdMs: 1_000,
      backoffScheduleMs: [1_000],
      dailyReloadLimit: 8,
      getDayKey: () => "day",
    });
    const fingerprint = createMeetingsFingerprint([meeting()]);

    defaultWatchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: true });

    // At 2 hours: should defer (< 4h force threshold)
    const deferred = defaultWatchdog.evaluate({
      fingerprint,
      nowMs: 2 * 60 * 60 * 1000,
      isHomepage: true,
      isForeground: true,
    });
    expect(deferred.action).toBe("defer");
    expect(deferred.reason).toBe("foreground");

    // At 4h+1ms: should force reload
    const forced = defaultWatchdog.evaluate({
      fingerprint,
      nowMs: DEFAULT_HOMEPAGE_FORCE_STALE_THRESHOLD_MS + 1,
      isHomepage: true,
      isForeground: true,
    });
    expect(forced.action).toBe("reload");
    expect(forced.reason).toBe("force_stale");
  });

  it("force reloads in foreground when stale exceeds force threshold", () => {
    const forceConfig = {
      ...config,
      forceStaleThresholdMs: 5_000,
    };
    const watchdog = createHomepageReloadWatchdog(forceConfig);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({
      fingerprint,
      nowMs: 0,
      isHomepage: true,
      isForeground: true,
    });

    // Under force threshold: should defer
    const deferred = watchdog.evaluate({
      fingerprint,
      nowMs: 2_000,
      isHomepage: true,
      isForeground: true,
    });
    expect(deferred.action).toBe("defer");
    expect(deferred.reason).toBe("foreground");

    // Over force threshold: should force reload even in foreground
    const forced = watchdog.evaluate({
      fingerprint,
      nowMs: 6_000,
      isHomepage: true,
      isForeground: true,
    });
    expect(forced.action).toBe("reload");
    expect(forced.reason).toBe("force_stale");
    expect(forced.reloadCountToday).toBe(1);
  });

  it("restores backoff state from restoredState config", () => {
    const fingerprint = createMeetingsFingerprint([meeting()]);

    // Simulate: first watchdog did 2 reloads, then page reloaded
    const firstWatchdog = createHomepageReloadWatchdog(config);
    firstWatchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });
    firstWatchdog.evaluate({ fingerprint, nowMs: 1_200, isHomepage: true, isForeground: false });
    firstWatchdog.evaluate({ fingerprint, nowMs: 3_400, isHomepage: true, isForeground: false });
    const persisted = firstWatchdog.getPersistableState();

    expect(persisted.consecutiveReloadsWithoutChange).toBe(2);
    expect(persisted.reloadCountToday).toBe(2);

    // Create a new watchdog (simulating page reload) with restored state.
    // Use continuous wall-clock timestamps: page reloads at ~T=3500
    const secondWatchdog = createHomepageReloadWatchdog({
      ...config,
      restoredState: persisted,
    });
    // Init fingerprint at T=3600 (shortly after reload)
    secondWatchdog.evaluate({ fingerprint, nowMs: 3_600, isHomepage: true, isForeground: false });

    // Backoff should be at level 2 (4_000ms), so cooldown until T=3400+4000=7400
    const cooldown = secondWatchdog.evaluate({
      fingerprint,
      nowMs: 7_000,
      isHomepage: true,
      isForeground: false,
    });
    expect(cooldown.reason).toBe("cooldown");
    expect(cooldown.backoffMs).toBe(4_000);

    // After full backoff, should reload and increment to 3
    const reloaded = secondWatchdog.evaluate({
      fingerprint,
      nowMs: 7_500,
      isHomepage: true,
      isForeground: false,
    });
    expect(reloaded.action).toBe("reload");
    expect(reloaded.consecutiveReloadsWithoutChange).toBe(3);
    expect(reloaded.reloadCountToday).toBe(3);
  });

  it("getPersistableState returns only persistable fields", () => {
    const watchdog = createHomepageReloadWatchdog(config);
    const fingerprint = createMeetingsFingerprint([meeting()]);

    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });
    watchdog.evaluate({ fingerprint, nowMs: 1_200, isHomepage: true, isForeground: false });

    const persisted = watchdog.getPersistableState();
    const keys = Object.keys(persisted).sort();
    expect(keys).toEqual([
      "consecutiveReloadsWithoutChange",
      "lastReloadAtMs",
      "reloadCountToday",
      "reloadDayKey",
    ]);
    expect(persisted.consecutiveReloadsWithoutChange).toBe(1);
    expect(persisted.reloadCountToday).toBe(1);
    expect(persisted.lastReloadAtMs).toBe(1_200);
    // Should NOT contain fingerprint or pendingReload
    expect(persisted).not.toHaveProperty("lastFingerprint");
    expect(persisted).not.toHaveProperty("pendingReload");
  });

  it("restored daily counter resets when day changes", () => {
    const fingerprint = createMeetingsFingerprint([meeting()]);

    const watchdog = createHomepageReloadWatchdog({
      ...config,
      restoredState: {
        consecutiveReloadsWithoutChange: 2,
        lastReloadAtMs: 5_000,
        reloadCountToday: 3,
        reloadDayKey: "day-a", // getDayKey returns "day-b" for nowMs >= 10_000
      },
    });

    // Init at T=10_000 → new day ("day-b"), daily counter should reset
    watchdog.evaluate({ fingerprint, nowMs: 10_000, isHomepage: true, isForeground: false });

    const result = watchdog.evaluate({
      fingerprint,
      nowMs: 15_000,
      isHomepage: true,
      isForeground: false,
    });
    expect(result.action).toBe("reload");
    expect(result.reloadCountToday).toBe(1); // reset from 3 to 0, then +1
    // backoff level should still be preserved
    expect(result.backoffMs).toBe(4_000); // level 2
  });

  it("ignores invalid restoredState gracefully", () => {
    const fingerprint = createMeetingsFingerprint([meeting()]);

    // Partial/invalid restored state — should not crash
    const watchdog = createHomepageReloadWatchdog({
      ...config,
      restoredState: undefined,
    });
    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    const result = watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
    });
    expect(result.action).toBe("reload");
    expect(result.consecutiveReloadsWithoutChange).toBe(1); // fresh start
  });
});
