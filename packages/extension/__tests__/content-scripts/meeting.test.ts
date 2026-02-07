import { beforeEach, describe, expect, it, vi } from "vitest";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("meeting content script", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    window.history.pushState({}, "", "/abc-defg-hij");
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("reports joined when user manually clicks the join button", async () => {
    const joinButton = document.createElement("button");
    joinButton.textContent = "Join now";
    document.body.appendChild(joinButton);

    vi.doMock("@meetcat/core", () => ({
      findMediaButtons: () => ({
        micButton: document.createElement("button"),
        cameraButton: document.createElement("button"),
      }),
      setMicState: vi.fn(),
      setCameraState: vi.fn(),
      clickJoinButton: vi.fn(() => true),
      findJoinButton: vi.fn(() => ({ button: joinButton, matchedText: "Join now" })),
      findLeaveButton: vi.fn(() => ({ button: null, matchedText: null })),
      getMeetingCodeFromPath: vi.fn(() => "abc-defg-hij"),
      createJoinCountdown: vi.fn(() => ({
        start: vi.fn(),
        destroy: vi.fn(),
      })),
      hasAutoJoinParam: vi.fn(() => false),
    }));

    await import("../../src/content-scripts/meeting.ts");
    await flushPromises();

    joinButton.click();
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "MEETING_JOINED",
      callId: "abc-defg-hij",
    });
  });
});
