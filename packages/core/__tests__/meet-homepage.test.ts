import { describe, expect, it } from "vitest";
import { isMeetHomepageUrl } from "../src/utils/meet-homepage.js";

describe("isMeetHomepageUrl", () => {
  it("accepts base homepage", () => {
    expect(isMeetHomepageUrl("https://meet.google.com/")).toBe(true);
  });

  it("accepts landing page", () => {
    expect(isMeetHomepageUrl("https://meet.google.com/landing")).toBe(true);
  });

  it("rejects calling landing page", () => {
    expect(isMeetHomepageUrl("https://meet.google.com/landing?calling=1")).toBe(false);
  });

  it("rejects meeting pages", () => {
    expect(isMeetHomepageUrl("https://meet.google.com/abc-defg-hij")).toBe(false);
  });
});
