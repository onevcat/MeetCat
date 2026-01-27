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
  clickJoinButton,
  getMeetingCodeFromPath,
  JOIN_BUTTON_PATTERNS,
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
