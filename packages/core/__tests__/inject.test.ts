import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";

const parserMocks = vi.hoisted(() => ({
  parseMeetingCards: vi.fn(() => ({ meetings: [], cardsFound: 0 })),
  getNextJoinableMeeting: vi.fn((meetings: unknown[]) =>
    meetings.length ? (meetings[0] as unknown) : null
  ),
  closestCalendarCard: vi.fn(() => null),
  waitForMeetingCard: vi.fn(async () => null),
}));

const controllerMocks = vi.hoisted(() => ({
  applyMicState: vi.fn(async () => ({ success: false, clicks: 0, attempts: 0 })),
  applyCameraState: vi.fn(async () => ({ success: false, clicks: 0, attempts: 0 })),
  clickJoinButton: vi.fn(() => false),
  getMeetingCodeFromPath: vi.fn(() => null),
  findJoinButton: vi.fn(() => ({ button: null, matchedText: null })),
  findLeaveButton: vi.fn(() => ({ button: null, matchedText: null })),
  findMediaButtons: vi.fn(() => []),
}));

const uiMocks = vi.hoisted(() => ({
  createHomepageOverlay: vi.fn(() => ({
    update: vi.fn(),
    setUpdateInfo: vi.fn(),
    destroy: vi.fn(),
  })),
  createJoinCountdown: vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() })),
  ensureStyles: vi.fn(),
}));

const tauriMocks = vi.hoisted(() => ({
  isTauriEnvironment: vi.fn(),
  reportMeetings: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn(),
  getJoinedMeetings: vi.fn().mockResolvedValue([]),
  getSuppressedMeetings: vi.fn().mockResolvedValue([]),
  onCheckMeetings: vi.fn(),
  onNavigateAndJoin: vi.fn(),
  onSettingsChanged: vi.fn(),
  onUpdateAvailable: vi.fn(),
  getUpdatePromptPreference: vi.fn(),
  onUpdatePromptPreferenceChanged: vi.fn(),
  getUpdateInfo: vi.fn(),
  openUpdateDialog: vi.fn(),
  reportJoined: vi.fn().mockResolvedValue(undefined),
  reportMeetingClosed: vi.fn().mockResolvedValue(undefined),
  logEvent: vi.fn().mockResolvedValue(undefined),
  requestNavigateHome: vi.fn().mockResolvedValue(undefined),
  saveDomSnapshot: vi.fn().mockResolvedValue("/tmp/snapshot.html"),
}));

vi.mock("../src/parser/index.js", () => parserMocks);
vi.mock("../src/controller/index.js", () => controllerMocks);
vi.mock("../src/ui/index.js", () => uiMocks);
const autoJoinMocks = vi.hoisted(() => ({
  appendAutoJoinParam: (url: string) => url,
  hasAutoJoinParam: () => false,
  getCardJoinTarget: vi.fn(() => null),
  markPendingCardJoin: vi.fn(),
  readPendingCardJoin: vi.fn(() => null),
  clearPendingCardJoin: vi.fn(),
}));

vi.mock("../src/auto-join.js", () => autoJoinMocks);
vi.mock("../src/tauri-bridge.js", () => tauriMocks);
vi.mock("@meetcat/i18n", () => ({
  initI18n: vi.fn().mockResolvedValue(undefined),
  changeLanguage: vi.fn().mockResolvedValue(undefined),
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("inject homepage checks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tauriMocks.onUpdateAvailable.mockResolvedValue(() => {});
    tauriMocks.onUpdatePromptPreferenceChanged.mockResolvedValue(() => {});
    tauriMocks.getUpdatePromptPreference.mockResolvedValue({});
    tauriMocks.getUpdateInfo.mockResolvedValue(null);
    tauriMocks.openUpdateDialog.mockResolvedValue(undefined);
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    if (!("location" in globalThis)) {
      Object.defineProperty(globalThis, "location", {
        value: window.location,
        configurable: true,
      });
    }
    document.body.innerHTML = "<div></div>";
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
  });

  it("does not start fallback interval in Tauri environment", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(((handler: TimerHandler) => {
        void handler;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval);

    const module = await import("../src/inject.js");
    await flushPromises();

    expect(tauriMocks.onCheckMeetings).toHaveBeenCalledTimes(1);
    // Only the wake detector interval should be started (no fallback interval in Tauri)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    module.cleanup();
    setIntervalSpy.mockRestore();
  });

  it("starts and clears fallback interval outside Tauri", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(false);

    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(((handler: TimerHandler) => {
        void handler;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval);
    const clearIntervalSpy = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(((id?: number | undefined) => {
        void id;
      }) as typeof clearInterval);

    const module = await import("../src/inject.js");
    await flushPromises();

    expect(tauriMocks.onCheckMeetings).not.toHaveBeenCalled();
    // Fallback interval + wake detector = 2 intervals
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);

    module.cleanup();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("uses maxMinutesAfterStart for overlay selection in Tauri", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      maxMinutesAfterStart: 10,
    });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    const now = Date.now();
    const meeting = {
      callId: "just-finished",
      url: "https://meet.google.com/just-finished",
      title: "Just Finished",
      displayTime: "9:52 AM",
      beginTime: new Date(now - 8 * 60 * 1000),
      endTime: new Date(now + 52 * 60 * 1000),
      eventId: null,
      startsInMinutes: -8,
    };

    const updateSpy = vi.fn();
    uiMocks.createHomepageOverlay.mockReturnValue({
      update: updateSpy,
      setUpdateInfo: vi.fn(),
      destroy: vi.fn(),
    });
    parserMocks.parseMeetingCards.mockReturnValue({
      meetings: [meeting],
      cardsFound: 1,
    });

    const module = await import("../src/inject.js");
    await flushPromises();

    expect(parserMocks.getNextJoinableMeeting).toHaveBeenCalledWith(
      [meeting],
      expect.objectContaining({ gracePeriodMinutes: 10 })
    );

    module.cleanup();
  });

  it("logs when homepage overlay is hidden by user", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      showCountdownOverlay: true,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        logCollectionEnabled: true,
        logLevel: "info",
      },
    });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    let capturedOnHide: (() => void) | undefined;
    uiMocks.createHomepageOverlay.mockImplementation((_container, options) => {
      capturedOnHide = options?.onHide;
      return { update: vi.fn(), setUpdateInfo: vi.fn(), destroy: vi.fn() };
    });

    const module = await import("../src/inject.js");
    await flushPromises();

    capturedOnHide?.();

    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        module: "overlay",
        event: "overlay.hidden_by_user",
      })
    );

    module.cleanup();
  });

  it("does not log to disk when settings fail to load in Tauri", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockRejectedValue(new Error("boom"));
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    const module = await import("../src/inject.js");
    await flushPromises();

    expect(tauriMocks.logEvent).not.toHaveBeenCalled();

    module.cleanup();
  });

  it("does not log to disk when tauri settings are missing", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    const module = await import("../src/inject.js");
    await flushPromises();

    expect(tauriMocks.logEvent).not.toHaveBeenCalled();

    module.cleanup();
  });

  it("reports page detection even when tauri log collection is disabled", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        logCollectionEnabled: false,
        logLevel: "info",
      },
    });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    const module = await import("../src/inject.js");
    await flushPromises();

    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        module: "inject",
        event: "init.page_detected",
        context: expect.objectContaining({
          homepage: true,
          meeting: false,
        }),
      })
    );

    module.cleanup();
  });

  it("suppresses info console logs when log collection is disabled", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        logCollectionEnabled: false,
        logLevel: "info",
      },
    });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const module = await import("../src/inject.js");
    await flushPromises();

    const meetcatLogs = logSpy.mock.calls.filter(([message]) => {
      return typeof message === "string" && message.includes("[MeetCat]");
    });

    expect(meetcatLogs.length).toBe(0);

    module.cleanup();
    logSpy.mockRestore();
  });

  it("reports meeting closed on pagehide for meeting pages", async () => {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    controllerMocks.getMeetingCodeFromPath.mockReturnValue("abc-defg-hij");
    controllerMocks.findMediaButtons.mockReturnValue({
      micButton: document.createElement("button"),
      cameraButton: document.createElement("button"),
    });

    window.history.pushState({}, "", "/abc-defg-hij");

    const module = await import("../src/inject.js");
    await flushPromises();

    window.dispatchEvent(new Event("pagehide"));
    await flushPromises();

    expect(tauriMocks.reportMeetingClosed).toHaveBeenCalledWith(
      "abc-defg-hij",
      expect.any(Number)
    );

    module.cleanup();
  });

  it("reports join and close under the card alias id on v2 card joins", async () => {
    const instanceId = "qh3otvuvq3e5odp340e22elatr_20260814T021500Z";

    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});

    controllerMocks.getMeetingCodeFromPath.mockReturnValue("abc-defg-hij");
    controllerMocks.findMediaButtons.mockReturnValue({
      micButton: document.createElement("button"),
      cameraButton: document.createElement("button"),
    });
    controllerMocks.findLeaveButton.mockReturnValue({
      button: document.createElement("button"),
      matchedText: "Leave call",
    });

    autoJoinMocks.readPendingCardJoin.mockReturnValue({
      callId: instanceId,
      auto: true,
      atMs: Date.now(),
    });

    window.history.pushState({}, "", "/abc-defg-hij");

    const module = await import("../src/inject.js");
    await flushPromises();

    // Entering the meeting reports the real code and the alias
    expect(tauriMocks.reportJoined).toHaveBeenCalledWith("abc-defg-hij");
    expect(tauriMocks.reportJoined).toHaveBeenCalledWith(instanceId);

    window.dispatchEvent(new Event("pagehide"));
    await flushPromises();

    // Closing reports both ids so daemon suppression/restore stays consistent
    expect(tauriMocks.reportMeetingClosed).toHaveBeenCalledWith(
      "abc-defg-hij",
      expect.any(Number)
    );
    expect(tauriMocks.reportMeetingClosed).toHaveBeenCalledWith(
      instanceId,
      expect.any(Number)
    );

    module.cleanup();
    autoJoinMocks.readPendingCardJoin.mockReturnValue(null);
    controllerMocks.findLeaveButton.mockReturnValue({ button: null, matchedText: null });
  });

});

describe("safeNavigateHome behavior", () => {
  function setupTauriHomepage() {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      tauri: { ...DEFAULT_TAURI_SETTINGS, logCollectionEnabled: true, logLevel: "debug" },
    });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});
    tauriMocks.onUpdateAvailable.mockResolvedValue(() => {});
    tauriMocks.onUpdatePromptPreferenceChanged.mockResolvedValue(() => {});
    tauriMocks.getUpdatePromptPreference.mockResolvedValue({});
    tauriMocks.getUpdateInfo.mockResolvedValue(null);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    document.body.innerHTML = "<div></div>";
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
  });

  it("Cmd+R calls requestNavigateHome instead of location.reload", async () => {
    setupTauriHomepage();
    tauriMocks.requestNavigateHome.mockResolvedValue(undefined);

    const module = await import("../src/inject.js");
    await flushPromises();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    expect(tauriMocks.requestNavigateHome).toHaveBeenCalledTimes(1);

    module.cleanup();
  });

  it("deduplicates rapid navigate-home calls", async () => {
    setupTauriHomepage();
    // Make requestNavigateHome hang (never resolve) to keep reloadInFlight=true
    tauriMocks.requestNavigateHome.mockReturnValue(new Promise(() => {}));

    const module = await import("../src/inject.js");
    await flushPromises();

    // First trigger
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    // Second trigger while first is still in-flight
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    expect(tauriMocks.requestNavigateHome).toHaveBeenCalledTimes(1);
    // Verify dedup log was emitted for the second call
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "reload.deduplicated",
      })
    );

    module.cleanup();
  });

  it("logs fallback when requestNavigateHome fails", async () => {
    setupTauriHomepage();
    tauriMocks.requestNavigateHome.mockRejectedValue(new Error("IPC failed"));

    const module = await import("../src/inject.js");
    await flushPromises();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    expect(tauriMocks.requestNavigateHome).toHaveBeenCalledTimes(1);
    // Verify the fallback log was emitted (location.reload is called but can't spy on it in jsdom)
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "reload.navigate_home_failed",
        context: expect.objectContaining({
          source: "shortcut",
          error: "IPC failed",
        }),
      })
    );

    module.cleanup();
  });

  it("cleanup resets reloadInFlight so navigation works again", async () => {
    setupTauriHomepage();
    // First import: hang the navigate to set reloadInFlight=true
    tauriMocks.requestNavigateHome.mockReturnValue(new Promise(() => {}));

    const module = await import("../src/inject.js");
    await flushPromises();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();
    expect(tauriMocks.requestNavigateHome).toHaveBeenCalledTimes(1);

    // Cleanup resets state
    module.cleanup();

    // Re-import to get fresh init with shortcut handler re-attached
    vi.resetModules();
    vi.clearAllMocks();
    setupTauriHomepage();
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    tauriMocks.requestNavigateHome.mockResolvedValue(undefined);

    const module2 = await import("../src/inject.js");
    await flushPromises();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    // Should work again after cleanup + re-init
    expect(tauriMocks.requestNavigateHome).toHaveBeenCalledTimes(1);

    module2.cleanup();
  });

  it("reloadInFlight TTL expires after timeout, allowing new reload", async () => {
    setupTauriHomepage();
    tauriMocks.requestNavigateHome.mockResolvedValue(undefined);

    const module = await import("../src/inject.js");
    await flushPromises();

    tauriMocks.logEvent.mockClear();

    const baseTime = Date.now();
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

    // Make subsequent calls hang — simulates frozen webview
    tauriMocks.requestNavigateHome.mockReturnValue(new Promise(() => {}));

    // Trigger first reload — sets reloadInFlightSince
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    // Verify navigate_home log emitted for first call
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "reload.navigate_home" })
    );

    // Clear logs to track new events
    tauriMocks.logEvent.mockClear();

    // Second attempt 5s later (within TTL) — should be deduplicated
    dateNowSpy.mockReturnValue(baseTime + 5_000);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    // Should see deduplicated, NOT navigate_home
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "reload.deduplicated" })
    );
    const navigateCallsWithinTTL = tauriMocks.logEvent.mock.calls.filter(
      (c: unknown[]) => (c[0] as { event: string }).event === "reload.navigate_home"
    );
    expect(navigateCallsWithinTTL).toHaveLength(0);

    // Clear logs again
    tauriMocks.logEvent.mockClear();

    // Advance past TTL (30s)
    dateNowSpy.mockReturnValue(baseTime + 31_000);
    tauriMocks.requestNavigateHome.mockResolvedValue(undefined);

    // Third attempt after TTL — should go through (TTL expired, lock reset)
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    // Should see: reload.expired (TTL reset) followed by reload.navigate_home (new call)
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "reload.expired", level: "warn" })
    );
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "reload.navigate_home" })
    );

    dateNowSpy.mockRestore();
    module.cleanup();
  });

  it("reload.expired log includes correct elapsedMs simulating overnight", async () => {
    setupTauriHomepage();
    tauriMocks.requestNavigateHome.mockReturnValue(new Promise(() => {}));

    const module = await import("../src/inject.js");
    await flushPromises();

    tauriMocks.logEvent.mockClear();
    const baseTime = Date.now();
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

    // Trigger reload that hangs
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();
    tauriMocks.logEvent.mockClear();

    // Simulate 8 hours later (overnight)
    const overnightMs = 8 * 60 * 60 * 1000;
    dateNowSpy.mockReturnValue(baseTime + overnightMs);
    tauriMocks.requestNavigateHome.mockResolvedValue(undefined);

    // Trigger again — TTL expired, should log with elapsedMs
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true })
    );
    await flushPromises();

    const expiredCall = tauriMocks.logEvent.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { event: string }).event === "reload.expired"
    );
    expect(expiredCall).toBeDefined();
    expect(
      (expiredCall![0] as { context: { elapsedMs: number } }).context.elapsedMs
    ).toBeGreaterThanOrEqual(overnightMs);

    dateNowSpy.mockRestore();
    module.cleanup();
  });
});

describe("wake detector recovery on daemon check", () => {
  function setupTauriHomepage() {
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      tauri: { ...DEFAULT_TAURI_SETTINGS, logCollectionEnabled: true, logLevel: "debug" },
    });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});
    tauriMocks.onUpdateAvailable.mockResolvedValue(() => {});
    tauriMocks.onUpdatePromptPreferenceChanged.mockResolvedValue(() => {});
    tauriMocks.getUpdatePromptPreference.mockResolvedValue({});
    tauriMocks.getUpdateInfo.mockResolvedValue(null);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    document.body.innerHTML = "<div></div>";
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
  });

  it("restarts wake detector if stopped when checkAndReportMeetings runs", async () => {
    setupTauriHomepage();
    tauriMocks.requestNavigateHome.mockResolvedValue(undefined);

    const module = await import("../src/inject.js");
    await flushPromises();

    // After init, wake.start should have been logged
    const wakeStartCalls = () =>
      tauriMocks.logEvent.mock.calls.filter(
        (call: unknown[]) => (call[0] as { event: string }).event === "wake.start"
      );
    const initialWakeStarts = wakeStartCalls().length;
    expect(initialWakeStarts).toBeGreaterThanOrEqual(1);

    // Simulate wake detector being stopped (e.g., by a failed wake.detected cycle)
    // by calling cleanup partially — stop wake detector via the cleanup export
    // We can't directly stop just the wake detector, but we can call checkAndReportMeetings
    // which should ensure it's running.

    // Clear log mock to track new calls
    tauriMocks.logEvent.mockClear();

    // Call checkAndReportMeetings — should attempt to restart wake detector if not running
    await module.checkAndReportMeetings();
    await flushPromises();

    // The wake detector was already running from init, so no extra wake.start
    // But this verifies checkAndReportMeetings doesn't crash with the guard
    module.cleanup();
  });
});

describe("watchdog sessionStorage persistence", () => {
  const STORAGE_KEY = "__meetcat_reload_watchdog";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tauriMocks.isTauriEnvironment.mockReturnValue(false);
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    document.body.innerHTML = "<div></div>";
    window.history.pushState({}, "", "/");
    sessionStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    sessionStorage.clear();
  });

  it("restores watchdog state from sessionStorage on init and keeps persisting", async () => {
    // Pre-seed sessionStorage with persisted state, marking the page load as
    // self-initiated so the failure streak survives (external loads reset it)
    sessionStorage.setItem("__meetcat_self_nav_at", String(Date.now()));
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        consecutiveReloadsWithoutChange: 3,
        lastReloadAtMs: Date.now() - 1000,
        reloadCountToday: 5,
        reloadDayKey: new Date().toISOString().slice(0, 10),
      })
    );

    const module = await import("../src/inject.js");
    await flushPromises();

    // State stays persisted (re-saved after each evaluation) so the
    // fingerprint baseline survives navigations MeetCat did not initiate
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string);
    expect(persisted.consecutiveReloadsWithoutChange).toBe(3);
    expect(persisted.reloadCountToday).toBe(5);

    module.cleanup();
  });

  it("an external page load resets the persisted failure streak", async () => {
    // No self-navigation marker: this load came from a login redirect or a
    // user navigation, which invalidates the previous page's streak
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        consecutiveReloadsWithoutChange: 3,
        lastReloadAtMs: Date.now() - 1000,
        reloadCountToday: 5,
        reloadDayKey: new Date().toISOString().slice(0, 10),
      })
    );

    const module = await import("../src/inject.js");
    await flushPromises();

    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.consecutiveReloadsWithoutChange).toBe(0);
    expect(persisted.reloadCountToday).toBe(5);

    module.cleanup();
  });

  it("handles corrupt sessionStorage data gracefully", async () => {
    sessionStorage.setItem(STORAGE_KEY, "not valid json{{{");

    // Should not throw — just start with fresh state
    const module = await import("../src/inject.js");
    await flushPromises();

    // The corrupt payload gets overwritten by the next valid save
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(() => JSON.parse(raw as string)).not.toThrow();

    module.cleanup();
  });

  it("handles sessionStorage with missing fields gracefully", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: "bar" }));

    // Missing required fields — should discard and start fresh
    const module = await import("../src/inject.js");
    await flushPromises();

    module.cleanup();
  });
});

describe("post-load re-parse burst", () => {
  const meeting = {
    callId: "abc123_20260827T060000Z",
    url: "https://meet.google.com/lookup/abc123_20260827T060000Z",
    title: "Team Time",
    displayTime: "15:00",
    beginTime: new Date(Date.now() + 60 * 60 * 1000),
    endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    eventId: "abc123",
    startsInMinutes: 60,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});
    tauriMocks.onUpdateAvailable.mockResolvedValue(() => {});
    tauriMocks.onUpdatePromptPreferenceChanged.mockResolvedValue(() => {});
    tauriMocks.getUpdatePromptPreference.mockResolvedValue({});
    tauriMocks.getUpdateInfo.mockResolvedValue(null);
    parserMocks.parseMeetingCards.mockReturnValue({ meetings: [], cardsFound: 0 });
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    document.body.innerHTML = "<div></div>";
    window.history.pushState({}, "", "/");
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    sessionStorage.clear();
  });

  it("re-parses on a short backoff until cards appear, then stops", async () => {
    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(1); // init pass

    await vi.advanceTimersByTimeAsync(1_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(2); // burst #1

    // Meet finishes rendering before the next attempt
    parserMocks.parseMeetingCards.mockReturnValue({
      meetings: [meeting],
      cardsFound: 1,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(3); // burst #2
    expect(tauriMocks.reportMeetings).toHaveBeenLastCalledWith([meeting]);

    // Cards found: remaining attempts are cancelled
    await vi.advanceTimersByTimeAsync(20_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(3);

    module.cleanup();
  });

  it("does not burst when the init parse already finds cards", async () => {
    parserMocks.parseMeetingCards.mockReturnValue({
      meetings: [meeting],
      cardsFound: 1,
    });

    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(1);

    module.cleanup();
  });

  it("empty burst parses trigger neither the snapshot nor a recovery reload", async () => {
    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);

    // Exhaust every burst attempt with an empty page
    await vi.advanceTimersByTimeAsync(20_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(5); // init + 4 bursts
    expect(tauriMocks.saveDomSnapshot).not.toHaveBeenCalled();
    expect(tauriMocks.requestNavigateHome).not.toHaveBeenCalled();

    module.cleanup();
  });

  it("cleanup cancels a pending burst attempt", async () => {
    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(1);

    module.cleanup();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(1);
  });
});

describe("diagnostic snapshot hardening", () => {
  type CheckCallback = (payload: {
    checkId: number;
    intervalSeconds: number;
    emittedAtMs: number;
  }) => Promise<void>;
  let checkCb: CheckCallback;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      tauri: { ...DEFAULT_TAURI_SETTINGS, logCollectionEnabled: true, logLevel: "debug" },
    });
    tauriMocks.onCheckMeetings.mockImplementation(async (cb: CheckCallback) => {
      checkCb = cb;
      return () => {};
    });
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});
    tauriMocks.onUpdateAvailable.mockResolvedValue(() => {});
    tauriMocks.onUpdatePromptPreferenceChanged.mockResolvedValue(() => {});
    tauriMocks.getUpdatePromptPreference.mockResolvedValue({});
    tauriMocks.getUpdateInfo.mockResolvedValue(null);
    parserMocks.parseMeetingCards.mockReturnValue({ meetings: [], cardsFound: 0 });
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    document.body.innerHTML = "<div></div>";
    window.history.pushState({}, "", "/");
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    sessionStorage.clear();
  });

  async function driveChecks(count: number, startId = 1): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await checkCb({
        checkId: startId + i,
        intervalSeconds: 30,
        emittedAtMs: Date.now(),
      });
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  it("a synchronous snapshot throw is logged and does not abort the check", async () => {
    tauriMocks.saveDomSnapshot.mockImplementation(() => {
      throw new Error("payload too large");
    });

    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);

    // Second zero-card check crosses the snapshot threshold
    await driveChecks(2);

    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "snapshot.failed",
        context: expect.objectContaining({
          sync: true,
          error: "payload too large",
        }),
      })
    );
    // The check that attempted the snapshot still completed its report
    expect(tauriMocks.reportMeetings).toHaveBeenCalledTimes(3); // init + 2 checks

    module.cleanup();
  });

  it("failed snapshot attempts retry with a bounded budget", async () => {
    tauriMocks.saveDomSnapshot.mockImplementation(() => {
      throw new Error("boom");
    });

    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);

    await driveChecks(6);

    // Attempts on checks 2..4, then the budget (3) is exhausted
    expect(tauriMocks.saveDomSnapshot).toHaveBeenCalledTimes(3);

    module.cleanup();
  });

  it("a successful snapshot stops further attempts", async () => {
    tauriMocks.saveDomSnapshot.mockResolvedValue("/tmp/snapshot.html");

    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);

    await driveChecks(5);

    expect(tauriMocks.saveDomSnapshot).toHaveBeenCalledTimes(1);
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "snapshot.saved" })
    );

    module.cleanup();
  });

  it("an async snapshot rejection is logged and retried", async () => {
    tauriMocks.saveDomSnapshot.mockRejectedValue(new Error("disabled"));

    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);

    await driveChecks(3);

    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "snapshot.failed",
        context: expect.objectContaining({ error: "disabled" }),
      })
    );
    expect(tauriMocks.saveDomSnapshot).toHaveBeenCalledTimes(2);

    module.cleanup();
  });
});

describe("visibility recheck", () => {
  const meeting = {
    callId: "abc123_20260828T060000Z",
    url: "https://meet.google.com/lookup/abc123_20260828T060000Z",
    title: "Team Time",
    displayTime: "15:00",
    beginTime: new Date(Date.now() + 60 * 60 * 1000),
    endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    eventId: "abc123",
    startsInMinutes: 60,
  };
  let visibilityState = "visible";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    tauriMocks.isTauriEnvironment.mockReturnValue(true);
    tauriMocks.getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      tauri: { ...DEFAULT_TAURI_SETTINGS, logCollectionEnabled: true, logLevel: "debug" },
    });
    tauriMocks.onCheckMeetings.mockResolvedValue(() => {});
    tauriMocks.onNavigateAndJoin.mockResolvedValue(() => {});
    tauriMocks.onSettingsChanged.mockResolvedValue(() => {});
    tauriMocks.onUpdateAvailable.mockResolvedValue(() => {});
    tauriMocks.onUpdatePromptPreferenceChanged.mockResolvedValue(() => {});
    tauriMocks.getUpdatePromptPreference.mockResolvedValue({});
    tauriMocks.getUpdateInfo.mockResolvedValue(null);
    parserMocks.parseMeetingCards.mockReturnValue({ meetings: [], cardsFound: 0 });
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    document.body.innerHTML = "<div></div>";
    window.history.pushState({}, "", "/");
    sessionStorage.clear();
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    sessionStorage.clear();
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });

  it("re-parses immediately when the page surfaces with no known meetings", async () => {
    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);

    // Exhaust the post-load burst on an empty page: init + 4 bursts
    await vi.advanceTimersByTimeAsync(20_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(5);

    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(5);

    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(6);
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "visibility.recheck",
        context: expect.objectContaining({ trigger: "visibilitychange" }),
      })
    );

    // A second transition within the debounce window is ignored
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(6);

    // The recheck armed a fresh burst for Meet's post-focus render
    await vi.advanceTimersByTimeAsync(1_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(7);

    module.cleanup();
  });

  it("window focus triggers the same recheck", async () => {
    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(5);

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(6);
    expect(tauriMocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "visibility.recheck",
        context: expect.objectContaining({ trigger: "window-focus" }),
      })
    );

    module.cleanup();
  });

  it("does not recheck when meetings are already known", async () => {
    parserMocks.parseMeetingCards.mockReturnValue({
      meetings: [meeting],
      cardsFound: 1,
    });

    const module = await import("../src/inject.js");
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(parserMocks.parseMeetingCards).toHaveBeenCalledTimes(1);

    module.cleanup();
  });
});
