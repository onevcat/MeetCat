import { beforeEach, describe, expect, it, vi } from "vitest";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("content scripts i18n initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    window.history.pushState({}, "", "/");
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("initializes i18n before creating the homepage overlay", async () => {
    const initI18n = vi.fn().mockResolvedValue(undefined);
    const createHomepageOverlay = vi.fn(() => ({
      update: vi.fn(),
      setUpdateInfo: vi.fn(),
      destroy: vi.fn(),
    }));

    vi.doMock("@meetcat/i18n", () => ({
      initI18n,
    }));
    vi.doMock("@meetcat/core", () => ({
      parseMeetingCards: vi.fn(() => ({ meetings: [] })),
      getNextJoinableMeeting: vi.fn(() => null),
      createHomepageOverlay,
    }));

    await import("../../src/content-scripts/homepage.ts");
    await flushPromises();

    expect(initI18n).toHaveBeenCalledWith("auto");
    expect(createHomepageOverlay).toHaveBeenCalled();
    expect(initI18n.mock.invocationCallOrder[0]).toBeLessThan(
      createHomepageOverlay.mock.invocationCallOrder[0]
    );
  });

  it("initializes i18n before creating the meeting countdown", async () => {
    const initI18n = vi.fn().mockResolvedValue(undefined);
    const createJoinCountdown = vi.fn(() => ({
      start: vi.fn(),
      destroy: vi.fn(),
    }));

    window.history.pushState({}, "", "/abc-defg-hij");

    vi.doMock("@meetcat/i18n", () => ({
      initI18n,
    }));
    vi.doMock("@meetcat/core", () => ({
      findMediaButtons: vi.fn(() => ({
        micButton: document.createElement("button"),
        cameraButton: document.createElement("button"),
      })),
      setMicState: vi.fn(),
      setCameraState: vi.fn(),
      clickJoinButton: vi.fn(() => true),
      findJoinButton: vi.fn(() => ({ button: document.createElement("button"), matchedText: "" })),
      findLeaveButton: vi.fn(() => ({ button: null, matchedText: null })),
      getMeetingCodeFromPath: vi.fn(() => "abc-defg-hij"),
      createJoinCountdown,
      hasAutoJoinParam: vi.fn(() => true),
    }));

    await import("../../src/content-scripts/meeting.ts");
    await flushPromises();

    expect(initI18n).toHaveBeenCalledWith("auto");
    expect(createJoinCountdown).toHaveBeenCalled();
    expect(initI18n.mock.invocationCallOrder[0]).toBeLessThan(
      createJoinCountdown.mock.invocationCallOrder[0]
    );
  });
});
