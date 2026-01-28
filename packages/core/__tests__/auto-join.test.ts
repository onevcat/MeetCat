import { describe, it, expect } from "vitest";
import { appendAutoJoinParam, hasAutoJoinParam } from "../src/auto-join.js";

describe("auto-join url helpers", () => {
  it("should append auto-join param to meeting url", () => {
    const url = "https://meet.google.com/abc-defg-hij";
    const result = appendAutoJoinParam(url);

    expect(hasAutoJoinParam(result)).toBe(true);

    const parsed = new URL(result);
    expect(parsed.searchParams.get("meetcatAuto")).toBe("1");
  });

  it("should preserve existing query and hash", () => {
    const url = "https://meet.google.com/abc-defg-hij?foo=bar#section";
    const result = appendAutoJoinParam(url);
    const parsed = new URL(result);

    expect(parsed.searchParams.get("foo")).toBe("bar");
    expect(parsed.searchParams.get("meetcatAuto")).toBe("1");
    expect(parsed.hash).toBe("#section");
  });

  it("should override existing auto-join param value", () => {
    const url = "https://meet.google.com/abc-defg-hij?meetcatAuto=0";
    const result = appendAutoJoinParam(url);
    const parsed = new URL(result);

    expect(parsed.searchParams.get("meetcatAuto")).toBe("1");
  });

  it("should append auto-join param for relative urls", () => {
    const url = "abc-defg-hij?foo=bar";
    const result = appendAutoJoinParam(url);
    const parsed = new URL(result);

    expect(parsed.origin).toBe("https://meet.google.com");
    expect(parsed.pathname).toBe("/abc-defg-hij");
    expect(parsed.searchParams.get("foo")).toBe("bar");
    expect(parsed.searchParams.get("meetcatAuto")).toBe("1");
  });

  it("should return original url when url parsing fails", () => {
    const url = "http://[";
    expect(appendAutoJoinParam(url)).toBe(url);
  });

  it("should return false when auto-join param is missing", () => {
    const url = "https://meet.google.com/abc-defg-hij?foo=bar";
    expect(hasAutoJoinParam(url)).toBe(false);
  });

  it("should return false when url parsing fails", () => {
    expect(hasAutoJoinParam("http://[")).toBe(false);
  });
});
