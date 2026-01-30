import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";

// We need to reset the module state between tests
let createOverlayStyles: typeof import("../../src/ui/styles.js").createOverlayStyles;
let ensureStyles: typeof import("../../src/ui/styles.js").ensureStyles;
let OVERLAY_BASE_STYLES: typeof import("../../src/ui/styles.js").OVERLAY_BASE_STYLES;

describe("UI Styles", () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(async () => {
    // Reset module state
    vi.resetModules();
    dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>");
    document = dom.window.document;

    // Re-import to reset the stylesInjected flag
    const module = await import("../../src/ui/styles.js");
    createOverlayStyles = module.createOverlayStyles;
    ensureStyles = module.ensureStyles;
    OVERLAY_BASE_STYLES = module.OVERLAY_BASE_STYLES;

    // Mock global document for createOverlayStyles
    (globalThis as unknown as { document: Document }).document = document;
  });

  describe("OVERLAY_BASE_STYLES", () => {
    it("should contain font-family", () => {
      expect(OVERLAY_BASE_STYLES).toContain("font-family");
    });

    it("should contain z-index", () => {
      expect(OVERLAY_BASE_STYLES).toContain("z-index: 0");
    });
  });

  describe("createOverlayStyles", () => {
    it("should return a style element", () => {
      const style = createOverlayStyles();
      expect(style.tagName).toBe("STYLE");
    });

    it("should contain overlay class styles", () => {
      const style = createOverlayStyles();
      expect(style.textContent).toContain(".meetcat-overlay");
    });

    it("should contain position fixed", () => {
      const style = createOverlayStyles();
      expect(style.textContent).toContain("position: fixed");
    });

    it("should contain bottom-right positioning class", () => {
      const style = createOverlayStyles();
      expect(style.textContent).toContain(".meetcat-overlay-bottom-right");
    });

    it("should contain top-center positioning class", () => {
      const style = createOverlayStyles();
      expect(style.textContent).toContain(".meetcat-overlay-top-center");
    });

    it("should contain icon styles", () => {
      const style = createOverlayStyles();
      expect(style.textContent).toContain(".meetcat-icon");
    });

    it("should contain button styles", () => {
      const style = createOverlayStyles();
      expect(style.textContent).toContain(".meetcat-btn");
    });

    it("should contain progress bar styles", () => {
      const style = createOverlayStyles();
      expect(style.textContent).toContain(".meetcat-progress");
      expect(style.textContent).toContain(".meetcat-progress-bar");
    });
  });

  describe("ensureStyles", () => {
    it("should inject styles into document head", () => {
      expect(document.querySelector("style[data-meetcat]")).toBeNull();
      ensureStyles(document);
      const style = document.querySelector("style[data-meetcat]");
      expect(style).not.toBeNull();
    });

    it("should only inject styles once", () => {
      ensureStyles(document);
      ensureStyles(document);
      const styles = document.querySelectorAll("style[data-meetcat]");
      expect(styles.length).toBe(1);
    });

    it("should not inject if styles already exist", async () => {
      // Manually add a style element with data-meetcat
      const existingStyle = document.createElement("style");
      existingStyle.setAttribute("data-meetcat", "");
      document.head.appendChild(existingStyle);

      // Re-import module to reset state
      vi.resetModules();
      const module = await import("../../src/ui/styles.js");

      module.ensureStyles(document);

      const styles = document.querySelectorAll("style[data-meetcat]");
      expect(styles.length).toBe(1);
    });
  });
});
