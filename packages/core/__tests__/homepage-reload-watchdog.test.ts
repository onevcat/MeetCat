import { describe, expect, it } from "vitest";
import {
  createHomepageReloadWatchdog,
  createMeetingsFingerprint,
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
});
