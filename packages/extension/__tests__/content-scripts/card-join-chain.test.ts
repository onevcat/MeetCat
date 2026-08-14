import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Full v2 card-join chain across both content scripts, using the REAL
 * @meetcat/core card helpers so the sessionStorage hand-off between the
 * homepage script (card click) and the meeting script (auto-join intent,
 * alias reporting) is exercised end to end. Only the parts jsdom cannot
 * provide (i18n resources, Meet's real pre-join buttons) are mocked.
 */

const INSTANCE_ID = "qh3otvuvq3e5odp340e22elatr_20260814T021500Z";
const CARD_JOIN_STORAGE_KEY = "__meetcat_card_join";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

// Markup captured from the redesigned Meet homepage (2026-08, /home)
function v2CardMarkup(): string {
  return `
    <section aria-labelledby="ucc-4">
      <div role="heading" aria-level="3" id="ucc-4">Scheduled</div>
      <ol>
        <li>
          <div role="button" tabindex="0"
               aria-label="ANDD Daily"
               aria-labelledby="ucc-t ucc-h"
               id="${INSTANCE_ID}"
               data-a11y-recover="${INSTANCE_ID},,"></div>
          <div id="ucc-h"><span>11:15 – 12:00</span></div>
          <div role="heading" aria-level="4" id="ucc-t">ANDD Daily</div>
        </li>
      </ol>
    </section>`;
}

describe("v2 card-join chain", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    sessionStorage.clear();
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("homepage script clicks the card from a meetcatJoin url and stores the auto-join flag", async () => {
    window.history.pushState(
      {},
      "",
      `/home?meetcatJoin=${INSTANCE_ID}&meetcatAuto=1`
    );
    document.body.innerHTML = v2CardMarkup();

    const card = document.getElementById(INSTANCE_ID) as HTMLElement;
    const clicked = vi.fn();
    card.addEventListener("click", clicked);

    vi.doMock("@meetcat/i18n", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@meetcat/i18n")>();
      return { ...actual, initI18n: vi.fn().mockResolvedValue(undefined) };
    });

    await import("../../src/content-scripts/homepage.ts");
    await flushPromises();
    await flushPromises();

    // The card was clicked so Meet resolves the meeting itself
    expect(clicked).toHaveBeenCalledTimes(1);

    // The auto-join intent survives Meet's navigation via sessionStorage
    const pending = JSON.parse(sessionStorage.getItem(CARD_JOIN_STORAGE_KEY)!);
    expect(pending.callId).toBe(INSTANCE_ID);
    expect(pending.auto).toBe(true);

    // Join params are stripped so a reload cannot re-trigger the click
    expect(window.location.search).not.toContain("meetcatJoin");
    expect(window.location.search).not.toContain("meetcatAuto");
  });

  it("meeting script consumes the flag: auto-join intent plus join/close alias reports", async () => {
    // Seed the flag exactly as the homepage script would have
    const { markPendingCardJoin } = await import("@meetcat/core");
    markPendingCardJoin(INSTANCE_ID, true);

    window.history.pushState({}, "", "/abc-defg-hij");

    const joinButton = document.createElement("button");
    joinButton.textContent = "Join now";
    document.body.appendChild(joinButton);

    const createJoinCountdown = vi.fn(() => ({ start: vi.fn(), destroy: vi.fn() }));

    vi.doMock("@meetcat/i18n", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@meetcat/i18n")>();
      return { ...actual, initI18n: vi.fn().mockResolvedValue(undefined) };
    });
    // Partial mock: fake Meet's pre-join controls, keep the real card-join helpers
    vi.doMock("@meetcat/core", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@meetcat/core")>();
      return {
        ...actual,
        findMediaButtons: () => ({
          micButton: document.createElement("button"),
          cameraButton: document.createElement("button"),
        }),
        applyMicState: vi.fn().mockResolvedValue({ success: true, clicks: 0, attempts: 1 }),
        applyCameraState: vi.fn().mockResolvedValue({ success: true, clicks: 0, attempts: 1 }),
        clickJoinButton: vi.fn(() => true),
        findJoinButton: vi.fn(() => ({ button: joinButton, matchedText: "Join now" })),
        findLeaveButton: vi.fn(() => ({ button: null, matchedText: null })),
        createJoinCountdown,
      };
    });

    await import("../../src/content-scripts/meeting.ts");
    await flushPromises();
    await flushPromises();

    // The pending flag (auto: true) requested the auto-join countdown even
    // though the URL carries no meetcatAuto param
    expect(createJoinCountdown).toHaveBeenCalled();

    joinButton.click();
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "MEETING_JOINED",
      callId: "abc-defg-hij",
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "MEETING_JOINED",
      callId: INSTANCE_ID,
    });

    window.dispatchEvent(new Event("pagehide"));
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "MEETING_CLOSED",
      callId: "abc-defg-hij",
      closedAtMs: expect.any(Number),
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "MEETING_CLOSED",
      callId: INSTANCE_ID,
      closedAtMs: expect.any(Number),
    });
  });
});
