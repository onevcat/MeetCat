import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";

const parserMocks = vi.hoisted(() => ({
  parseMeetingCards: vi.fn(() => ({ meetings: [], cardsFound: 0 })),
  getNextJoinableMeeting: vi.fn((meetings: unknown[]) =>
    meetings.length ? (meetings[0] as unknown) : null
  ),
}));

const controllerMocks = vi.hoisted(() => ({
  setMicState: vi.fn(),
  setCameraState: vi.fn(),
  clickJoinButton: vi.fn(() => false),
  getMeetingCodeFromPath: vi.fn(() => null),
  findJoinButton: vi.fn(() => ({ button: null, matchedText: null })),
  findLeaveButton: vi.fn(() => ({ button: null, matchedText: null })),
  findMediaButtons: vi.fn(() => []),
}));

const uiMocks = vi.hoisted(() => ({
  createHomepageOverlay: vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() })),
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
  reportJoined: vi.fn(),
  reportMeetingClosed: vi.fn().mockResolvedValue(undefined),
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/parser/index.js", () => parserMocks);
vi.mock("../src/controller/index.js", () => controllerMocks);
vi.mock("../src/ui/index.js", () => uiMocks);
vi.mock("../src/auto-join.js", () => ({
  appendAutoJoinParam: (url: string) => url,
  hasAutoJoinParam: () => false,
}));
vi.mock("../src/tauri-bridge.js", () => tauriMocks);

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("inject homepage checks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as unknown as { __meetcatInitialized?: string }).__meetcatInitialized;
    if (!("location" in globalThis)) {
      Object.defineProperty(globalThis, "location", {
        value: window.location,
        configurable: true,
      });
    }
    document.body.innerHTML = "<div></div>";
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
    expect(setIntervalSpy).not.toHaveBeenCalled();

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
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    module.cleanup();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

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
      return { update: vi.fn(), destroy: vi.fn() };
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
});
