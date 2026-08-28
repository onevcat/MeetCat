import { describe, expect, it } from "vitest";
import {
  createHomepageReloadWatchdog,
  createMeetingsFingerprint,
  msUntilNextRelevantMeeting,
  DEFAULT_HOMEPAGE_FORCE_STALE_THRESHOLD_MS,
  DEFAULT_HOMEPAGE_UPCOMING_MEETING_GUARD_MS,
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
      "baselineAtMs",
      "baselineFingerprint",
      "baselineNextMeetingStartMs",
      "consecutiveReloadsWithoutChange",
      "lastFingerprint",
      "lastFingerprintChangedAtMs",
      "lastReloadAtMs",
      "regression",
      "reloadCountToday",
      "reloadDayKey",
    ]);
    expect(persisted.consecutiveReloadsWithoutChange).toBe(1);
    expect(persisted.reloadCountToday).toBe(1);
    expect(persisted.lastReloadAtMs).toBe(1_200);
    expect(persisted.lastFingerprint).toBe(fingerprint);
    expect(persisted.lastFingerprintChangedAtMs).toBe(0);
    expect(persisted.baselineFingerprint).toBe(fingerprint);
    expect(persisted.baselineAtMs).toBe(1_200);
    expect(persisted.regression).toBeNull();
    // Runtime-only flags stay out of the persisted state
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

describe("msUntilNextRelevantMeeting", () => {
  it("returns null when there are no meetings", () => {
    expect(msUntilNextRelevantMeeting([], 0)).toBeNull();
  });

  it("ignores meetings that already ended", () => {
    const ended = meeting({
      beginTime: new Date(1_000),
      endTime: new Date(2_000),
    });
    expect(msUntilNextRelevantMeeting([ended], 3_000)).toBeNull();
  });

  it("returns time until the earliest upcoming meeting", () => {
    const near = meeting({
      callId: "aaa-bbbb-ccc",
      beginTime: new Date(5_000),
      endTime: new Date(6_000),
    });
    const far = meeting({
      callId: "xxx-yyyy-zzz",
      beginTime: new Date(9_000),
      endTime: new Date(10_000),
    });
    expect(msUntilNextRelevantMeeting([far, near], 1_000)).toBe(4_000);
  });

  it("returns a negative value for a meeting in progress", () => {
    const ongoing = meeting({
      beginTime: new Date(1_000),
      endTime: new Date(10_000),
    });
    expect(msUntilNextRelevantMeeting([ongoing], 3_000)).toBe(-2_000);
  });
});

describe("HomepageReloadWatchdog upcoming-meeting guard", () => {
  const guardConfig = {
    staleThresholdMs: 1_000,
    backoffScheduleMs: [1_000, 2_000, 4_000],
    dailyReloadLimit: 5,
    getDayKey: () => "day",
    upcomingMeetingGuardMs: 2_000,
    forceStaleThresholdMs: 5_000,
  };
  const fingerprint = createMeetingsFingerprint([meeting()]);

  it("exports a 45-minute default guard window", () => {
    expect(DEFAULT_HOMEPAGE_UPCOMING_MEETING_GUARD_MS).toBe(45 * 60 * 1000);
  });

  it("defers a stale reload when the next meeting starts within the guard window", () => {
    const watchdog = createHomepageReloadWatchdog(guardConfig);
    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    const guarded = watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
      msUntilNextMeeting: 1_500,
    });
    expect(guarded.action).toBe("none");
    expect(guarded.reason).toBe("upcoming_meeting");
  });

  it("guards while a meeting is in progress (negative msUntilNextMeeting)", () => {
    const watchdog = createHomepageReloadWatchdog(guardConfig);
    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    const guarded = watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
      msUntilNextMeeting: -100,
    });
    expect(guarded.action).toBe("none");
    expect(guarded.reason).toBe("upcoming_meeting");
  });

  it("reloads when the next meeting is beyond the guard window or unknown", () => {
    const watchdog = createHomepageReloadWatchdog(guardConfig);
    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    const farMeeting = watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
      msUntilNextMeeting: 10_000,
    });
    expect(farMeeting.action).toBe("reload");

    const other = createHomepageReloadWatchdog(guardConfig);
    other.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });
    const unknown = other.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
    });
    expect(unknown.action).toBe("reload");
  });

  it("guard overrides force_stale in foreground", () => {
    const watchdog = createHomepageReloadWatchdog(guardConfig);
    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: true });

    const guarded = watchdog.evaluate({
      fingerprint,
      nowMs: 6_000, // beyond forceStaleThresholdMs (5_000)
      isHomepage: true,
      isForeground: true,
      msUntilNextMeeting: 1_000,
    });
    expect(guarded.action).toBe("none");
    expect(guarded.reason).toBe("upcoming_meeting");
  });

  it("does not consume backoff or daily counters while guarded", () => {
    const watchdog = createHomepageReloadWatchdog(guardConfig);
    watchdog.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    watchdog.evaluate({
      fingerprint,
      nowMs: 1_200,
      isHomepage: true,
      isForeground: false,
      msUntilNextMeeting: 1_500,
    });

    const afterGuard = watchdog.evaluate({
      fingerprint,
      nowMs: 1_300,
      isHomepage: true,
      isForeground: false,
      msUntilNextMeeting: 10_000,
    });
    expect(afterGuard.action).toBe("reload");
    expect(afterGuard.backoffMs).toBe(1_000); // still at level 0
    expect(afterGuard.reloadCountToday).toBe(1);
  });
});

describe("HomepageReloadWatchdog fingerprint persistence", () => {
  const persistConfig = {
    staleThresholdMs: 1_000,
    backoffScheduleMs: [1_000, 2_000, 4_000],
    dailyReloadLimit: 5,
    getDayKey: () => "day",
  };
  const fingerprint = createMeetingsFingerprint([meeting()]);

  it("staleness survives a page reload via restored fingerprint state", () => {
    const first = createHomepageReloadWatchdog(persistConfig);
    first.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });
    first.evaluate({ fingerprint, nowMs: 100, isHomepage: true, isForeground: false });

    const second = createHomepageReloadWatchdog({
      ...persistConfig,
      restoredState: first.getPersistableState(),
    });

    // Same fingerprint after reload: staleness clock keeps running from t=0
    // instead of re-initializing, so the stale reload fires immediately.
    const result = second.evaluate({
      fingerprint,
      nowMs: 1_500,
      isHomepage: true,
      isForeground: false,
    });
    expect(result.action).toBe("reload");
    expect(result.staleForMs).toBe(1_500);
  });

  it("a different fingerprint after restore counts as a healthy change", () => {
    const first = createHomepageReloadWatchdog(persistConfig);
    first.evaluate({ fingerprint, nowMs: 0, isHomepage: true, isForeground: false });

    const second = createHomepageReloadWatchdog({
      ...persistConfig,
      restoredState: first.getPersistableState(),
    });
    const changed = second.evaluate({
      fingerprint: createMeetingsFingerprint([meeting({ title: "Other" })]),
      nowMs: 200,
      isHomepage: true,
      isForeground: false,
    });
    expect(changed.reason).toBe("fingerprint_changed");
  });
});

describe("HomepageReloadWatchdog empty-regression recovery", () => {
  const rConfig = {
    staleThresholdMs: 1_000,
    backoffScheduleMs: [1_000, 2_000, 4_000],
    dailyReloadLimit: 5,
    getDayKey: () => "day",
    upcomingMeetingGuardMs: 2_000,
    regressionArmWindowMs: 500,
    regressionConfirmChecks: 3,
    regressionRetryCooldownMs: 300,
    regressionMaxSilentRetries: 2,
    regressionFocusLeadMs: 900,
    regressionFocusGraceMs: 600,
  };
  const fp = createMeetingsFingerprint([meeting()]);
  const emptyFp = createMeetingsFingerprint([]);

  function base(nowMs: number, fingerprint: string) {
    return { fingerprint, nowMs, isHomepage: true, isForeground: false };
  }

  it("arms after restore and retries silently once empties are confirmed", () => {
    const before = createHomepageReloadWatchdog(rConfig);
    before.evaluate({ ...base(0, fp), msUntilNextMeeting: 10_000 });
    before.evaluate({ ...base(100, fp), msUntilNextMeeting: 9_900 });

    const after = createHomepageReloadWatchdog({
      ...rConfig,
      restoredState: before.getPersistableState(),
    });

    const e1 = after.evaluate(base(400, emptyFp));
    expect(e1.action).toBe("none");
    expect(e1.reason).toBe("empty_regression_waiting");

    const e2 = after.evaluate(base(500, emptyFp));
    expect(e2.action).toBe("none");
    expect(e2.reason).toBe("empty_regression_waiting");

    const e3 = after.evaluate(base(600, emptyFp));
    expect(e3.action).toBe("reload");
    expect(e3.reason).toBe("empty_regression");
    expect(e3.focus).toBe(false);
    expect(after.hasOpenEmptyRegression()).toBe(true);
  });

  it("does not arm when the restored baseline is stale", () => {
    const before = createHomepageReloadWatchdog(rConfig);
    before.evaluate({ ...base(0, fp), msUntilNextMeeting: 10_000 });

    const after = createHomepageReloadWatchdog({
      ...rConfig,
      restoredState: before.getPersistableState(),
    });

    // First empty arrives past the arm window → legit empty adoption
    const e1 = after.evaluate(base(700, emptyFp));
    expect(e1.reason).toBe("fingerprint_changed");
    expect(after.hasOpenEmptyRegression()).toBe(false);
  });

  it("does not arm for in-page transitions to empty without a reload", () => {
    const watchdog = createHomepageReloadWatchdog(rConfig);
    watchdog.evaluate({ ...base(0, fp), msUntilNextMeeting: 10_000 });

    const e1 = watchdog.evaluate(base(100, emptyFp));
    expect(e1.reason).toBe("fingerprint_changed");

    const e2 = watchdog.evaluate(base(200, emptyFp));
    expect(e2.reason).toBe("not_stale");
    expect(watchdog.hasOpenEmptyRegression()).toBe(false);
  });

  it("arms in-page when its own reload precedes the empties (extension path)", () => {
    const watchdog = createHomepageReloadWatchdog(rConfig);
    watchdog.evaluate({ ...base(0, fp), msUntilNextMeeting: 6_000 });

    const reload = watchdog.evaluate({ ...base(1_200, fp), msUntilNextMeeting: 4_800 });
    expect(reload.action).toBe("reload");

    watchdog.evaluate(base(1_500, emptyFp));
    watchdog.evaluate(base(1_800, emptyFp));
    const e3 = watchdog.evaluate(base(2_100, emptyFp));
    expect(e3.action).toBe("reload");
    expect(e3.reason).toBe("empty_regression");
    expect(watchdog.hasOpenEmptyRegression()).toBe(true);
  });

  it("escalates: silent retries with cooldown, then focused near meeting start, then visible", () => {
    const watchdog = createHomepageReloadWatchdog(rConfig);
    // Meeting starts at t=6_000 (captured in the baseline)
    watchdog.evaluate({ ...base(0, fp), msUntilNextMeeting: 6_000 });
    const staleReload = watchdog.evaluate({ ...base(1_200, fp), msUntilNextMeeting: 4_800 });
    expect(staleReload.action).toBe("reload");
    const consecutiveBefore = staleReload.consecutiveReloadsWithoutChange;

    watchdog.evaluate(base(1_500, emptyFp));
    watchdog.evaluate(base(1_800, emptyFp));
    const silent1 = watchdog.evaluate(base(2_100, emptyFp));
    expect(silent1.reason).toBe("empty_regression");

    // Cooldown (300ms) not yet elapsed
    const waiting = watchdog.evaluate(base(2_200, emptyFp));
    expect(waiting.action).toBe("none");
    expect(waiting.reason).toBe("empty_regression_waiting");

    const silent2 = watchdog.evaluate(base(2_500, emptyFp));
    expect(silent2.reason).toBe("empty_regression");

    // Silent retries exhausted (max 2)
    const exhausted = watchdog.evaluate(base(2_900, emptyFp));
    expect(exhausted.action).toBe("none");
    expect(exhausted.reason).toBe("empty_regression_waiting");

    // Inside the focus window [5_100, 6_600] → focused reload, once
    const focused = watchdog.evaluate(base(5_200, emptyFp));
    expect(focused.action).toBe("reload");
    expect(focused.reason).toBe("empty_regression_focused");
    expect(focused.focus).toBe(true);

    const afterFocused = watchdog.evaluate(base(5_300, emptyFp));
    expect(afterFocused.reason).toBe("empty_regression_waiting");

    // Page becomes visible → one visible retry
    const visible = watchdog.evaluate({ ...base(5_400, emptyFp), isVisible: true });
    expect(visible.action).toBe("reload");
    expect(visible.reason).toBe("empty_regression_visible");
    expect(visible.focus).toBe(false);

    const afterVisible = watchdog.evaluate({ ...base(5_500, emptyFp), isVisible: true });
    expect(afterVisible.reason).toBe("empty_regression_waiting");

    // Regression retries never escalate the stale-reload backoff
    expect(afterVisible.consecutiveReloadsWithoutChange).toBe(consecutiveBefore);

    // A healthy parse closes the episode
    const recovered = watchdog.evaluate({
      ...base(5_600, createMeetingsFingerprint([meeting({ title: "Other" })])),
      msUntilNextMeeting: 400,
    });
    expect(recovered.reason).toBe("fingerprint_changed");
    expect(watchdog.hasOpenEmptyRegression()).toBe(false);
  });

  it("prefers a visible retry as the first attempt when the page is visible", () => {
    const watchdog = createHomepageReloadWatchdog(rConfig);
    watchdog.evaluate({ ...base(0, fp), msUntilNextMeeting: 6_000 });
    const reload = watchdog.evaluate({ ...base(1_200, fp), msUntilNextMeeting: 4_800 });
    expect(reload.action).toBe("reload");

    watchdog.evaluate({ ...base(1_500, emptyFp), isVisible: true });
    watchdog.evaluate({ ...base(1_800, emptyFp), isVisible: true });
    const first = watchdog.evaluate({ ...base(2_100, emptyFp), isVisible: true });
    expect(first.action).toBe("reload");
    expect(first.reason).toBe("empty_regression_visible");
  });

  it("regression retries bypass the daily reload limit", () => {
    const watchdog = createHomepageReloadWatchdog({ ...rConfig, dailyReloadLimit: 1 });
    watchdog.evaluate({ ...base(0, fp), msUntilNextMeeting: 6_000 });
    const reload = watchdog.evaluate({ ...base(1_200, fp), msUntilNextMeeting: 4_800 });
    expect(reload.action).toBe("reload");
    expect(reload.reloadCountToday).toBe(1); // daily limit reached

    watchdog.evaluate(base(1_500, emptyFp));
    watchdog.evaluate(base(1_800, emptyFp));
    const retry = watchdog.evaluate(base(2_100, emptyFp));
    expect(retry.action).toBe("reload");
    expect(retry.reason).toBe("empty_regression");
  });

  it("an open episode survives persistence across reloads with its retry budget", () => {
    const first = createHomepageReloadWatchdog(rConfig);
    first.evaluate({ ...base(0, fp), msUntilNextMeeting: 6_000 });
    first.evaluate({ ...base(1_200, fp), msUntilNextMeeting: 4_800 });
    first.evaluate(base(1_500, emptyFp));
    first.evaluate(base(1_800, emptyFp));
    const silent1 = first.evaluate(base(2_100, emptyFp));
    expect(silent1.reason).toBe("empty_regression");

    const second = createHomepageReloadWatchdog({
      ...rConfig,
      restoredState: first.getPersistableState(),
    });
    expect(second.hasOpenEmptyRegression()).toBe(true);

    // Empty confirmation restarts per page load, even though the streak start
    // is now beyond the arm window (the episode itself keeps it armed)
    second.evaluate(base(2_200, emptyFp));
    second.evaluate(base(2_250, emptyFp));
    const confirmed = second.evaluate(base(2_300, emptyFp));
    // Cooldown from the restored lastReloadAtMs (2_100) still applies
    expect(confirmed.reason).toBe("empty_regression_waiting");

    const silent2 = second.evaluate(base(2_500, emptyFp));
    expect(silent2.action).toBe("reload");
    expect(silent2.reason).toBe("empty_regression");

    // Budget exhausted
    const waiting = second.evaluate(base(2_900, emptyFp));
    expect(waiting.reason).toBe("empty_regression_waiting");
  });
});

describe("HomepageReloadWatchdog external navigation + post-load rescue", () => {
  const xConfig = {
    staleThresholdMs: 1_000,
    backoffScheduleMs: [1_000, 2_000, 4_000],
    dailyReloadLimit: 5,
    getDayKey: () => "day",
    regressionConfirmChecks: 3,
    postLoadRescueWindowMs: 5_000,
  };
  const fp = createMeetingsFingerprint([meeting()]);
  const emptyFp = createMeetingsFingerprint([]);

  function base(nowMs: number, fingerprint: string) {
    return { fingerprint, nowMs, isHomepage: true, isForeground: false };
  }

  // Persisted state matching the observed overnight shape: long-empty page,
  // escalated failure streak, recent reload holding an active cooldown.
  function overnightState(overrides: Record<string, unknown> = {}) {
    return {
      consecutiveReloadsWithoutChange: 2,
      lastReloadAtMs: 9_500,
      reloadCountToday: 3,
      reloadDayKey: "day",
      lastFingerprint: emptyFp,
      lastFingerprintChangedAtMs: 1_000,
      baselineFingerprint: null,
      baselineAtMs: null,
      baselineNextMeetingStartMs: null,
      regression: null,
      ...overrides,
    };
  }

  it("an external load resets the reload-failure streak", () => {
    const restored = overnightState({
      lastFingerprint: fp,
      lastReloadAtMs: 1_500,
    });

    const selfLoad = createHomepageReloadWatchdog({
      ...xConfig,
      restoredState: restored,
    });
    const selfReload = selfLoad.evaluate(base(10_000, fp));
    expect(selfReload.action).toBe("reload");
    expect(selfReload.backoffMs).toBe(4_000); // streak preserved: level 2

    const externalLoad = createHomepageReloadWatchdog({
      ...xConfig,
      restoredState: restored,
      externalNavigation: true,
    });
    const externalReload = externalLoad.evaluate(base(10_000, fp));
    expect(externalReload.action).toBe("reload");
    expect(externalReload.backoffMs).toBe(1_000); // streak reset: level 0
  });

  it("rescues a stale empty page past the cooldown after confirm checks", () => {
    const watchdog = createHomepageReloadWatchdog({
      ...xConfig,
      restoredState: overnightState(),
      externalNavigation: true,
    });

    const e1 = watchdog.evaluate(base(10_000, emptyFp));
    expect(e1.action).toBe("none");
    expect(e1.reason).toBe("cooldown");

    const e2 = watchdog.evaluate(base(10_030, emptyFp));
    expect(e2.reason).toBe("cooldown");

    const e3 = watchdog.evaluate(base(10_060, emptyFp));
    expect(e3.action).toBe("reload");
    expect(e3.reason).toBe("post_load_empty");
    // Error recovery: the rescue does not escalate the stale backoff
    expect(e3.consecutiveReloadsWithoutChange).toBe(0);
    expect(e3.reloadCountToday).toBe(4);
  });

  it("the rescue is one-shot per page load", () => {
    const watchdog = createHomepageReloadWatchdog({
      ...xConfig,
      restoredState: overnightState(),
      externalNavigation: true,
    });

    watchdog.evaluate(base(10_000, emptyFp));
    watchdog.evaluate(base(10_030, emptyFp));
    const rescued = watchdog.evaluate(base(10_060, emptyFp));
    expect(rescued.reason).toBe("post_load_empty");

    const after = watchdog.evaluate(base(10_090, emptyFp));
    expect(after.action).toBe("none");
    expect(after.reason).toBe("cooldown");
  });

  it("the rescue expires outside its window", () => {
    const watchdog = createHomepageReloadWatchdog({
      ...xConfig,
      restoredState: overnightState({ lastReloadAtMs: 19_500 }),
      externalNavigation: true,
    });

    // Window opens at the first evaluate (10_000) and closes at 15_000
    watchdog.evaluate(base(10_000, emptyFp));
    watchdog.evaluate(base(10_030, emptyFp));
    const late = watchdog.evaluate(base(20_030, emptyFp));
    expect(late.action).toBe("none");
    expect(late.reason).toBe("cooldown");
  });

  it("does not rescue after a self-initiated load", () => {
    const watchdog = createHomepageReloadWatchdog({
      ...xConfig,
      restoredState: overnightState(),
    });

    watchdog.evaluate(base(10_000, emptyFp));
    watchdog.evaluate(base(10_030, emptyFp));
    const e3 = watchdog.evaluate(base(10_060, emptyFp));
    expect(e3.action).toBe("none");
    expect(e3.reason).toBe("cooldown");
    expect(e3.backoffMs).toBe(4_000); // streak preserved too
  });

  it("the rescue respects the daily reload limit", () => {
    const watchdog = createHomepageReloadWatchdog({
      ...xConfig,
      restoredState: overnightState({ reloadCountToday: 5 }),
      externalNavigation: true,
    });

    watchdog.evaluate(base(10_000, emptyFp));
    watchdog.evaluate(base(10_030, emptyFp));
    const e3 = watchdog.evaluate(base(10_060, emptyFp));
    expect(e3.action).toBe("none");
  });

  it("never rescues on a brand-new session without restored state", () => {
    const watchdog = createHomepageReloadWatchdog({
      ...xConfig,
      externalNavigation: true,
    });

    // Legitimately empty schedule on first launch: stays quiet even once
    // the empty fingerprint turns stale within the rescue window
    watchdog.evaluate(base(0, emptyFp));
    watchdog.evaluate(base(1_100, emptyFp));
    watchdog.evaluate(base(1_200, emptyFp));
    const e4 = watchdog.evaluate(base(1_300, emptyFp));
    expect(e4.reason).not.toBe("post_load_empty");
  });
});
