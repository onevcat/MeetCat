import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  findMediaButtons,
  isMuted,
  setMicState,
  setCameraState,
  MEDIA_BUTTON_SELECTOR,
} from "../src/controller/media-buttons.js";
import {
  findJoinButton,
  findLeaveButton,
  clickJoinButton,
  getMeetingCodeFromPath,
} from "../src/controller/join-button.js";

describe("Controller - Media Buttons", () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    document = dom.window.document;
  });

  function createMediaButton(isMuted: boolean): HTMLElement {
    const button = document.createElement("div");
    button.setAttribute("role", "button");
    button.dataset.isMuted = isMuted.toString();
    return button;
  }

  function createUnknownMediaButton(): HTMLElement {
    const button = document.createElement("div");
    button.setAttribute("role", "button");
    button.setAttribute("data-is-muted", "");
    return button;
  }

  describe("findMediaButtons", () => {
    it("should find mic and camera buttons", () => {
      const micBtn = createMediaButton(true);
      const camBtn = createMediaButton(false);
      document.body.appendChild(micBtn);
      document.body.appendChild(camBtn);

      const { micButton, cameraButton } = findMediaButtons(document);

      expect(micButton).toBe(micBtn);
      expect(cameraButton).toBe(camBtn);
    });

    it("should return null when buttons not found", () => {
      const { micButton, cameraButton } = findMediaButtons(document);

      expect(micButton).toBeNull();
      expect(cameraButton).toBeNull();
    });

    it("should return null for camera when only one button exists", () => {
      const micBtn = createMediaButton(true);
      document.body.appendChild(micBtn);

      const { micButton, cameraButton } = findMediaButtons(document);

      expect(micButton).toBe(micBtn);
      expect(cameraButton).toBeNull();
    });
  });

  describe("isMuted", () => {
    it("should return true for muted button", () => {
      const button = createMediaButton(true);
      expect(isMuted(button)).toBe(true);
    });

    it("should return false for unmuted button", () => {
      const button = createMediaButton(false);
      expect(isMuted(button)).toBe(false);
    });

    it("should return null for null button", () => {
      expect(isMuted(null)).toBeNull();
    });
  });

  describe("setMicState", () => {
    it("should click mic button to mute when currently unmuted", () => {
      const micBtn = createMediaButton(false); // unmuted
      const camBtn = createMediaButton(true);
      document.body.appendChild(micBtn);
      document.body.appendChild(camBtn);

      const clickSpy = vi.spyOn(micBtn, "click");

      const result = setMicState(document, false); // want muted

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    it("should not click when already in desired state", () => {
      const micBtn = createMediaButton(true); // muted
      const camBtn = createMediaButton(true);
      document.body.appendChild(micBtn);
      document.body.appendChild(camBtn);

      const clickSpy = vi.spyOn(micBtn, "click");

      const result = setMicState(document, false); // want muted

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it("should return failure when button not found", () => {
      const result = setMicState(document, false);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(false);
    });

    it("should return failure when muted state cannot be determined", () => {
      const micBtn = createUnknownMediaButton();
      const camBtn = createMediaButton(true);
      document.body.appendChild(micBtn);
      document.body.appendChild(camBtn);

      const result = setMicState(document, true);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(false);
    });
  });

  describe("setCameraState", () => {
    it("should click camera button to turn on when currently off", () => {
      const micBtn = createMediaButton(true);
      const camBtn = createMediaButton(true); // off
      document.body.appendChild(micBtn);
      document.body.appendChild(camBtn);

      const clickSpy = vi.spyOn(camBtn, "click");

      const result = setCameraState(document, true); // want on

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    it("should not click when camera already in desired state", () => {
      const micBtn = createMediaButton(true);
      const camBtn = createMediaButton(false); // on
      document.body.appendChild(micBtn);
      document.body.appendChild(camBtn);

      const clickSpy = vi.spyOn(camBtn, "click");

      const result = setCameraState(document, true); // want on

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it("should return failure when camera button not found", () => {
      const result = setCameraState(document, true);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(false);
    });

    it("should return failure when muted state cannot be determined", () => {
      const micBtn = createMediaButton(true);
      const camBtn = createUnknownMediaButton();
      document.body.appendChild(micBtn);
      document.body.appendChild(camBtn);

      const result = setCameraState(document, true);

      expect(result.success).toBe(false);
      expect(result.changed).toBe(false);
    });
  });
});

describe("Controller - Join Button", () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    document = dom.window.document;
  });

  function createJoinButton(text: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = text;
    return button;
  }

  describe("findJoinButton", () => {
    it("should find button with English text", () => {
      const button = createJoinButton("Join now");
      document.body.appendChild(button);

      const result = findJoinButton(document);

      expect(result.button).toBe(button);
      expect(result.matchedText).toBe("Join now");
    });

    it("should find button with Chinese text", () => {
      const button = createJoinButton("立即加入");
      document.body.appendChild(button);

      const result = findJoinButton(document);

      expect(result.button).toBe(button);
      expect(result.matchedText).toBe("立即加入");
    });

    it("should find button with Japanese text", () => {
      const button = createJoinButton("今すぐ参加");
      document.body.appendChild(button);

      const result = findJoinButton(document);

      expect(result.button).toBe(button);
      expect(result.matchedText).toBe("今すぐ参加");
    });

    it("should return null when no join button found", () => {
      const button = createJoinButton("Cancel");
      document.body.appendChild(button);

      const result = findJoinButton(document);

      expect(result.button).toBeNull();
      expect(result.matchedText).toBeNull();
    });

    it("should find button with partial match", () => {
      const button = createJoinButton("Click to Join now please");
      document.body.appendChild(button);

      const result = findJoinButton(document);

      expect(result.button).toBe(button);
      expect(result.matchedText).toBe("Join now");
    });

    it("should handle button with empty text", () => {
      const button = createJoinButton("");
      button.textContent = null;
      document.body.appendChild(button);

      const result = findJoinButton(document);

      expect(result.button).toBeNull();
      expect(result.matchedText).toBeNull();
    });

    it("should fall back to the largest visible non-menu button", () => {
      const menuButton = createJoinButton("Other ways to join");
      menuButton.setAttribute("aria-haspopup", "menu");
      menuButton.getBoundingClientRect = () =>
        ({ width: 200, height: 40 } as DOMRect);
      document.body.appendChild(menuButton);

      const smallButton = createJoinButton("Allow microphone and camera");
      smallButton.getBoundingClientRect = () =>
        ({ width: 160, height: 32 } as DOMRect);
      document.body.appendChild(smallButton);

      const joinButton = createJoinButton("Join now");
      joinButton.textContent = "";
      joinButton.setAttribute("aria-label", "Join now");
      joinButton.getBoundingClientRect = () =>
        ({ width: 240, height: 56 } as DOMRect);
      document.body.appendChild(joinButton);

      const result = findJoinButton(document);

      expect(result.button).toBe(joinButton);
      expect(result.matchedText).toBe("Join now");
    });

    it("should prefer promo anchor candidates when text patterns are missing", () => {
      const promoButton = createJoinButton("");
      promoButton.setAttribute("data-promo-anchor-id", "w5gBed");
      promoButton.setAttribute("aria-label", "Primary action");
      promoButton.getBoundingClientRect = () =>
        ({ width: 220, height: 52 } as DOMRect);
      document.body.appendChild(promoButton);

      const otherButton = createJoinButton("Allow microphone and camera");
      otherButton.getBoundingClientRect = () =>
        ({ width: 260, height: 36 } as DOMRect);
      document.body.appendChild(otherButton);

      const result = findJoinButton(document);

      expect(result.button).toBe(promoButton);
      expect(result.matchedText).toBe("Primary action");
    });

    it("should not select leave button candidates", () => {
      const leaveButton = createJoinButton("Leave call");
      leaveButton.getBoundingClientRect = () =>
        ({ width: 300, height: 60 } as DOMRect);
      document.body.appendChild(leaveButton);

      const result = findJoinButton(document);

      expect(result.button).toBeNull();
      expect(result.matchedText).toBeNull();
    });
  });

  describe("findLeaveButton", () => {
    it("should detect leave button via call_end icon", () => {
      const button = document.createElement("button");
      const icon = document.createElement("i");
      icon.setAttribute("data-google-symbols-override", "true");
      icon.textContent = "call_end";
      button.appendChild(icon);
      document.body.appendChild(button);

      const result = findLeaveButton(document);

      expect(result.button).toBe(button);
      expect(result.matchedText).toBe("call_end");
    });

    it("should detect leave button via text patterns", () => {
      const button = createJoinButton("退出通话");
      document.body.appendChild(button);

      const result = findLeaveButton(document);

      expect(result.button).toBe(button);
      expect(result.matchedText).toBe("退出通话");
    });
  });

  describe("clickJoinButton", () => {
    it("should click the join button", () => {
      const button = createJoinButton("Join now");
      document.body.appendChild(button);

      const clickSpy = vi.spyOn(button, "click");

      const result = clickJoinButton(document);

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    it("should return false when button not found", () => {
      const result = clickJoinButton(document);
      expect(result).toBe(false);
    });

    it("should ignore MouseEvent errors", () => {
      const button = createJoinButton("Join now");
      document.body.appendChild(button);

      const clickSpy = vi.spyOn(button, "click");
      const originalMouseEvent = globalThis.MouseEvent;
      globalThis.MouseEvent = class {
        constructor() {
          throw new Error("Boom");
        }
      } as typeof MouseEvent;

      const result = clickJoinButton(document);

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();

      globalThis.MouseEvent = originalMouseEvent;
    });

    it("should handle container without ownerDocument", () => {
      const button = createJoinButton("Join now");
      const container = {
        querySelectorAll: () => [button],
      } as unknown as Document;

      const clickSpy = vi.spyOn(button, "click");

      const result = clickJoinButton(container);

      expect(result).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe("getMeetingCodeFromPath", () => {
    it("should extract valid meeting code", () => {
      expect(getMeetingCodeFromPath("/abc-defg-hij")).toBe("abc-defg-hij");
    });

    it("should return null for homepage", () => {
      expect(getMeetingCodeFromPath("/")).toBeNull();
    });

    it("should return null for invalid format", () => {
      expect(getMeetingCodeFromPath("/abc-def-ghi")).toBeNull(); // wrong length
      expect(getMeetingCodeFromPath("/ABC-DEFG-HIJ")).toBeNull(); // uppercase
      expect(getMeetingCodeFromPath("/abcdefghij")).toBeNull(); // no dashes
    });

    it("should return null for paths with extra segments", () => {
      expect(getMeetingCodeFromPath("/abc-defg-hij/extra")).toBeNull();
    });
  });
});
