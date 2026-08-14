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

describe("pending card join flag", () => {
  it("round-trips through sessionStorage", async () => {
    const { markPendingCardJoin, readPendingCardJoin, clearPendingCardJoin } =
      await import("../src/auto-join.js");

    const now = 1_000_000;
    markPendingCardJoin("event_20260814T021500Z", true, now);

    const pending = readPendingCardJoin(now + 1000);
    expect(pending).toEqual({
      callId: "event_20260814T021500Z",
      auto: true,
      atMs: now,
    });

    clearPendingCardJoin();
    expect(readPendingCardJoin(now + 1000)).toBeNull();
  });

  it("expires after the TTL", async () => {
    const { markPendingCardJoin, readPendingCardJoin, clearPendingCardJoin } =
      await import("../src/auto-join.js");

    const now = 1_000_000;
    markPendingCardJoin("event_20260814T021500Z", false, now);

    expect(readPendingCardJoin(now + 3 * 60 * 1000 + 1)).toBeNull();
    clearPendingCardJoin();
  });

  it("ignores corrupted storage payloads", async () => {
    const { readPendingCardJoin } = await import("../src/auto-join.js");

    sessionStorage.setItem("__meetcat_card_join", "not json");
    expect(readPendingCardJoin()).toBeNull();

    sessionStorage.setItem("__meetcat_card_join", JSON.stringify({ callId: 42 }));
    expect(readPendingCardJoin()).toBeNull();
    sessionStorage.removeItem("__meetcat_card_join");
  });
});
