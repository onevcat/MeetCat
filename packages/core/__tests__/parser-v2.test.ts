import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseHomepageV2,
  parseCalendarCard,
  findCalendarCards,
  findMeetingCardById,
  closestCalendarCard,
  extractDurationMinutes,
  extractBeginClockMinutes,
  CALENDAR_INSTANCE_ID_PATTERN,
  BARE_EVENT_ID_PATTERN,
} from "../src/parser/homepage-v2.js";
import { parseMeetingCards, getNextJoinableMeeting } from "../src/parser/meeting-cards.js";
import { getCardJoinTarget, CARD_JOIN_PARAM } from "../src/auto-join.js";

/**
 * Markup captured from the redesigned Meet homepage (2026-08, /home).
 * Structure is faithful to a real DOM snapshot; obfuscated class names are
 * kept as captured but must not be relied upon by the parser.
 */
const INSTANCE_ID = "qh3otvuvq3e5odp340e22elatr_20260814T021500Z";

function cardMarkup(options: {
  instanceId?: string;
  title?: string;
  timeText?: string;
  liStyle?: string;
  suffix?: string;
} = {}): string {
  const {
    instanceId = INSTANCE_ID,
    title = "ANDD Daily",
    timeText = "11:15 – 12:00",
    liStyle = "",
    suffix = "",
  } = options;
  const uid = `ucc-${instanceId.slice(0, 6)}${suffix}`;
  return `
    <li class="UAyOQb tlX8fd"${liStyle ? ` style="${liStyle}"` : ""}>
      <div class="FXtCSc zqsO3d">
        <div class="K4vxLd-WsjYwc BiMis" jsname="Dq2Egc">
          <div class="K4vxLd-aGsRMb">
            <div class="d5NbRd-EScbFb-JIbuQc xVUa2b" tabindex="0"
                 aria-label="${title}"
                 aria-labelledby="${uid}-t ${uid}-h"
                 id="${instanceId}"
                 data-a11y-recover="${instanceId},,"
                 data-focus-priority="1" role="button"></div>
          </div>
        </div>
      </div>
      <div class="UvbCjd">
        <div class="KNKSdd">
          <div id="${uid}-h">
            <div class="Bfp9ie wKzHNd"><span class="PtyNB">${timeText}</span></div>
          </div>
        </div>
        <div class="HrfZSe">
          <div class="PegvGd" role="heading" aria-level="4" id="${uid}-t">${title}</div>
        </div>
      </div>
    </li>`;
}

function scheduleMarkup(cards: string): string {
  return `
    <section class="jOkAme" aria-labelledby="ucc-4">
      <div class="x9kkPc tlX8fd" role="heading" aria-level="3" id="ucc-4">已安排</div>
      <ol class="TFXMX KQZntb">${cards}</ol>
    </section>`;
}

describe("Homepage v2 parser", () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    document = dom.window.document;
  });

  function render(html: string): void {
    document.body.innerHTML = html;
  }

  describe("CALENDAR_INSTANCE_ID_PATTERN", () => {
    it("matches calendar instance ids", () => {
      expect(CALENDAR_INSTANCE_ID_PATTERN.test(INSTANCE_ID)).toBe(true);
    });

    it("rejects other element ids", () => {
      expect(CALENDAR_INSTANCE_ID_PATTERN.test("ucc-5")).toBe(false);
      expect(CALENDAR_INSTANCE_ID_PATTERN.test("qh3otvuvq3e5odp340e22elatr")).toBe(false);
      expect(CALENDAR_INSTANCE_ID_PATTERN.test("abc-defg-hij")).toBe(false);
    });
  });

  describe("parseCalendarCard", () => {
    it("parses a real captured card", () => {
      render(scheduleMarkup(cardMarkup()));
      const card = document.getElementById(INSTANCE_ID) as HTMLElement;
      const now = Date.UTC(2026, 7, 14, 2, 0, 0); // 15 min before start

      const meeting = parseCalendarCard(card, now);

      expect(meeting).not.toBeNull();
      expect(meeting!.callId).toBe(INSTANCE_ID);
      expect(meeting!.eventId).toBe("qh3otvuvq3e5odp340e22elatr");
      expect(meeting!.title).toBe("ANDD Daily");
      expect(meeting!.beginTime.getTime()).toBe(Date.UTC(2026, 7, 14, 2, 15, 0));
      // 11:15 – 12:00 → 45 minutes
      expect(meeting!.endTime.getTime()).toBe(Date.UTC(2026, 7, 14, 3, 0, 0));
      expect(meeting!.startsInMinutes).toBe(15);
      expect(getCardJoinTarget(meeting!.url)).toBe(INSTANCE_ID);
    });

    it("falls back to 60 minutes when no time range is displayed", () => {
      render(scheduleMarkup(cardMarkup({ timeText: "全天" })));
      const card = document.getElementById(INSTANCE_ID) as HTMLElement;

      const meeting = parseCalendarCard(card, Date.UTC(2026, 7, 14, 2, 0, 0));

      expect(meeting!.endTime.getTime() - meeting!.beginTime.getTime()).toBe(
        60 * 60 * 1000
      );
    });

    it("uses labelled heading when aria-label is missing", () => {
      render(scheduleMarkup(cardMarkup({ title: "Weekly Sync" })));
      const card = document.getElementById(INSTANCE_ID) as HTMLElement;
      card.removeAttribute("aria-label");

      const meeting = parseCalendarCard(card, Date.now());

      expect(meeting!.title).toBe("Weekly Sync");
    });
  });

  describe("parseHomepageV2", () => {
    it("parses and sorts multiple cards", () => {
      const early = "aaaabbbbccccdddd_20260814T003000Z";
      const late = "eeeeffffgggghhhh_20260814T060000Z";
      render(
        scheduleMarkup(
          cardMarkup({ instanceId: late, title: "Late", timeText: "15:00 – 16:00", suffix: "b" }) +
            cardMarkup({ instanceId: early, title: "Early", timeText: "9:30 – 10:00", suffix: "a" })
        )
      );

      const result = parseHomepageV2(document, Date.UTC(2026, 7, 14, 0, 0, 0));

      expect(result.parser).toBe("v2");
      expect(result.cardsFound).toBe(2);
      expect(result.meetings.map((m) => m.title)).toEqual(["Early", "Late"]);
    });

    it("skips hidden cards", () => {
      render(
        scheduleMarkup(
          cardMarkup({ liStyle: "display: none" }) +
            cardMarkup({
              instanceId: "eeeeffffgggghhhh_20260814T060000Z",
              title: "Visible",
              suffix: "v",
            })
        )
      );

      const result = parseHomepageV2(document, Date.UTC(2026, 7, 14, 0, 0, 0));

      expect(result.cardsFound).toBe(2);
      expect(result.hiddenCards).toBe(1);
      expect(result.meetings).toHaveLength(1);
      expect(result.meetings[0].title).toBe("Visible");
    });

    it("returns empty result when no cards exist", () => {
      render("<div>nothing here</div>");
      const result = parseHomepageV2(document);
      expect(result.cardsFound).toBe(0);
      expect(result.meetings).toHaveLength(0);
    });
  });

  describe("parseMeetingCards generation compatibility", () => {
    // Google decides which frontend each user gets, so every generation must
    // keep working, and stale/hidden markup left over from one generation
    // must never mask the generation that actually renders the schedule.

    function v1CardMarkup(
      now: number,
      options: { hidden?: boolean; broken?: boolean } = {}
    ): string {
      const { hidden = false, broken = false } = options;
      const times = broken
        ? ""
        : `data-begin-time="${now + 600000}" data-end-time="${now + 4200000}"`;
      return `
        <div data-call-id="abc-defg-hij" ${times}
             ${hidden ? 'style="display: none"' : ""}
             aria-label="10:00. Legacy Meeting.">
          <div>Legacy Meeting</div>
        </div>`;
    }

    it("parses a pure v1 page", () => {
      const now = Date.now();
      render(v1CardMarkup(now));

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v1");
      expect(result.meetings[0].callId).toBe("abc-defg-hij");
    });

    it("parses a pure v2 page", () => {
      render(scheduleMarkup(cardMarkup()));

      const result = parseMeetingCards(document, Date.UTC(2026, 7, 14, 2, 0, 0));

      expect(result.parser).toBe("v2");
      expect(result.meetings[0].callId).toBe(INSTANCE_ID);
    });

    it("ignores hidden v1 leftovers and parses visible v2 cards", () => {
      const now = Date.now();
      render(v1CardMarkup(now, { hidden: true }) + scheduleMarkup(cardMarkup()));

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v2");
      expect(result.meetings).toHaveLength(1);
      expect(result.meetings[0].callId).toBe(INSTANCE_ID);
    });

    it("ignores unparseable v1 nodes and parses visible v2 cards", () => {
      const now = Date.now();
      render(v1CardMarkup(now, { broken: true }) + scheduleMarkup(cardMarkup()));

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v2");
      expect(result.meetings[0].callId).toBe(INSTANCE_ID);
    });

    it("falls back to visible v1 cards when v2 yields no meetings", () => {
      const now = Date.now();
      render(
        scheduleMarkup(cardMarkup({ liStyle: "display: none" })) + v1CardMarkup(now)
      );

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v1");
      expect(result.meetings[0].callId).toBe("abc-defg-hij");
    });

    it("prefers the newest generation when both render meetings", () => {
      const now = Date.now();
      render(v1CardMarkup(now) + scheduleMarkup(cardMarkup()));

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v2");
      expect(result.meetings[0].callId).toBe(INSTANCE_ID);
    });

    it("keeps diagnostics from the generation with markup when nothing parses", () => {
      const now = Date.now();
      render(v1CardMarkup(now, { hidden: true }));

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v1");
      expect(result.cardsFound).toBe(1);
      expect(result.hiddenCards).toBe(1);
      expect(result.meetings).toHaveLength(0);
    });

    /**
     * The redesigned homepage shows ended meetings in a VISIBLE "Past"
     * section (v1 never rendered those). The parser is expected to see
     * them — exclusion is the job of the downstream joinability checks
     * (endTime, grace window), which must never pick a past meeting.
     */
    it("parses visible past-section cards but never makes them joinable", () => {
      // ANDD Daily 11:15–12:00 UTC+9 as captured; "now" is 5 min after end
      const now = Date.UTC(2026, 7, 14, 3, 5, 0);
      render(`
        <section aria-labelledby="ucc-past">
          <div role="heading" aria-level="3" id="ucc-past">过去</div>
          <ol>${cardMarkup()}</ol>
        </section>`);

      const result = parseMeetingCards(document, now);

      // The card is visible, so the parser reports it faithfully
      expect(result.parser).toBe("v2");
      expect(result.meetings).toHaveLength(1);
      expect(result.meetings[0].endTime.getTime()).toBeLessThanOrEqual(now);

      // ...but it can never become the next joinable meeting
      expect(getNextJoinableMeeting(result.meetings, { now })).toBeNull();
    });

    it("keeps past-section cards outside the grace window even if endTime overshoots", () => {
      // Duration text unparseable → endTime falls back to begin + 60 min,
      // which is still in the future here; the grace window must exclude it
      const now = Date.UTC(2026, 7, 14, 2, 45, 0); // 30 min after start
      render(scheduleMarkup(cardMarkup({ timeText: "全天" })));

      const result = parseMeetingCards(document, now);

      expect(result.meetings).toHaveLength(1);
      expect(result.meetings[0].endTime.getTime()).toBeGreaterThan(now);
      expect(
        getNextJoinableMeeting(result.meetings, { now, gracePeriodMinutes: 10 })
      ).toBeNull();
    });

    it("returns an empty v2 result on a page without any meeting markup", () => {
      render("<div>nothing</div>");

      const result = parseMeetingCards(document);

      expect(result.parser).toBe("v2");
      expect(result.cardsFound).toBe(0);
      expect(result.meetings).toHaveLength(0);
    });
  });

  /**
   * Events that reuse another event's meeting code (Calendar shows the
   * 「この会議コードは別の予定のものです」banner) render with a BARE event id —
   * no `_<timestamp>Z` instance suffix — and carry no machine-readable time.
   * Captured from a real snapshot on 2026-08-20. The homepage renders one
   * day at a time, so sibling instance-id cards anchor the calendar date and
   * the clock time comes from the localized label text.
   */
  describe("reused-meeting-code cards (bare event id)", () => {
    const BARE_ID = "3n4i5i5mf9v3lqf03ipnct6g4a";
    const ANCHOR_ID = "cvegrqhmio0aildgefsp3pf0ad_20260820T060000Z";
    const ANCHOR_BEGIN_MS = Date.UTC(2026, 7, 20, 6, 0, 0);

    /** Local-midnight-based expectation mirroring the wall-clock contract. */
    function localTimeOnDayOf(ms: number, hours: number, minutes: number): number {
      const d = new Date(ms);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes).getTime();
    }

    it("BARE_EVENT_ID_PATTERN matches bare event ids only", () => {
      expect(BARE_EVENT_ID_PATTERN.test(BARE_ID)).toBe(true);
      expect(BARE_EVENT_ID_PATTERN.test(ANCHOR_ID)).toBe(false);
      expect(BARE_EVENT_ID_PATTERN.test("ucc-5")).toBe(false);
      expect(BARE_EVENT_ID_PATTERN.test("abc-defg-hij")).toBe(false);
    });

    it("parses a bare-id card, anchoring the date to a sibling instance card", () => {
      render(
        scheduleMarkup(
          cardMarkup({ instanceId: ANCHOR_ID, title: "ANDD Team Time", timeText: "15:00 – 16:00", suffix: "a" }) +
            cardMarkup({ instanceId: BARE_ID, title: "test2", timeText: "17:15 – 18:15", suffix: "b" })
        )
      );
      const expectedBegin = localTimeOnDayOf(ANCHOR_BEGIN_MS, 17, 15);
      const now = expectedBegin - 30 * 60 * 1000;

      const result = parseHomepageV2(document, now);

      expect(result.cardsFound).toBe(2);
      expect(result.meetings).toHaveLength(2);
      const meeting = result.meetings.find((m) => m.title === "test2")!;
      expect(meeting.callId).toBe(BARE_ID);
      expect(meeting.eventId).toBe(BARE_ID);
      expect(meeting.beginTime.getTime()).toBe(expectedBegin);
      expect(meeting.endTime.getTime()).toBe(expectedBegin + 60 * 60 * 1000);
      expect(getCardJoinTarget(meeting.url)).toBe(BARE_ID);
    });

    it("anchors to instance cards in the visible past section (captured scenario)", () => {
      // Real 2026-08-20 layout: past section holds anchored cards, the
      // reused-code meeting sits alone in the scheduled section.
      render(`
        <section aria-labelledby="ucc-past">
          <div role="heading" aria-level="3" id="ucc-past">过去</div>
          <ol>${cardMarkup({ instanceId: ANCHOR_ID, title: "ANDD Team Time", timeText: "15:00 – 16:00", suffix: "a" })}</ol>
        </section>
        ${scheduleMarkup(cardMarkup({ instanceId: BARE_ID, title: "test2", timeText: "17:15 – 18:15", suffix: "b" }))}`);
      const expectedBegin = localTimeOnDayOf(ANCHOR_BEGIN_MS, 17, 15);
      const now = expectedBegin - 15 * 60 * 1000;

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v2");
      expect(result.meetings).toHaveLength(2);
      const next = getNextJoinableMeeting(result.meetings, { now });
      expect(next?.callId).toBe(BARE_ID);
      expect(next?.beginTime.getTime()).toBe(expectedBegin);
    });

    it("anchors to a visible instance card even when 'now' is another day", () => {
      render(
        scheduleMarkup(
          cardMarkup({ instanceId: ANCHOR_ID, title: "ANDD Team Time", timeText: "15:00 – 16:00", suffix: "a" }) +
            cardMarkup({ instanceId: BARE_ID, title: "test2", timeText: "17:15 – 18:15", suffix: "b" })
        )
      );
      const now = ANCHOR_BEGIN_MS + 3 * 24 * 60 * 60 * 1000;

      const result = parseHomepageV2(document, now);

      const meeting = result.meetings.find((m) => m.callId === BARE_ID)!;
      expect(meeting.beginTime.getTime()).toBe(localTimeOnDayOf(ANCHOR_BEGIN_MS, 17, 15));
    });

    it("never anchors to a hidden instance card from another day", () => {
      // Stale hidden markup must not date visible bare-id cards; with no
      // visible anchor the current local date is the correct fallback.
      const staleId = "qh3otvuvq3e5odp340e22elatr_20260819T021500Z";
      render(
        scheduleMarkup(
          cardMarkup({ instanceId: staleId, title: "Stale", timeText: "11:15 – 12:00", liStyle: "display: none", suffix: "s" }) +
            cardMarkup({ instanceId: BARE_ID, title: "test2", timeText: "17:15 – 18:15", suffix: "b" })
        )
      );
      const now = Date.UTC(2026, 7, 20, 6, 30, 0);

      const result = parseHomepageV2(document, now);

      const meeting = result.meetings.find((m) => m.callId === BARE_ID)!;
      expect(meeting.beginTime.getTime()).toBe(localTimeOnDayOf(now, 17, 15));
      expect(result.hiddenCards).toBe(1);
    });

    it("falls back to the current local date without an anchor sibling", () => {
      render(scheduleMarkup(cardMarkup({ instanceId: BARE_ID, title: "test2", timeText: "17:15 – 18:15" })));
      const now = Date.UTC(2026, 7, 20, 3, 0, 0);

      const result = parseHomepageV2(document, now);

      expect(result.meetings).toHaveLength(1);
      expect(result.meetings[0].beginTime.getTime()).toBe(localTimeOnDayOf(now, 17, 15));
    });

    it("ignores bare-id buttons without a displayed time range", () => {
      render(scheduleMarkup(cardMarkup({ instanceId: BARE_ID, title: "test2", timeText: "全天" })));

      const result = parseHomepageV2(document, Date.UTC(2026, 7, 20, 3, 0, 0));

      expect(result.cardsFound).toBe(0);
      expect(result.meetings).toHaveLength(0);
    });

    it("card lookup helpers accept bare event ids", () => {
      render(scheduleMarkup(cardMarkup({ instanceId: BARE_ID, title: "test2", timeText: "17:15 – 18:15" })));
      const card = document.getElementById(BARE_ID) as HTMLElement;
      const inner = document.createElement("span");
      card.appendChild(inner);

      expect(findMeetingCardById(document, BARE_ID)?.id).toBe(BARE_ID);
      expect(closestCalendarCard(inner)?.id).toBe(BARE_ID);
      expect(findMeetingCardById(document, "ucc-5")).toBeNull();
    });
  });

  describe("extractBeginClockMinutes", () => {
    it("parses 24h ranges", () => {
      expect(extractBeginClockMinutes(["17:15 – 18:15"])).toBe(17 * 60 + 15);
    });

    it("applies a trailing meridiem shared by the range", () => {
      expect(extractBeginClockMinutes(["5:15 – 6:15 PM"])).toBe(17 * 60 + 15);
    });

    it("parses the captured en-US format with per-token meridiems", () => {
      // Verbatim from a real en-US homepage card (2026-08-20)
      expect(extractBeginClockMinutes(["5:45 PM – 6:45 PM"])).toBe(17 * 60 + 45);
      // Same format with the narrow no-break space (U+202F) ICU emits
      expect(extractBeginClockMinutes(["5:45\u202FPM – 6:45\u202FPM"])).toBe(17 * 60 + 45);
      expect(extractBeginClockMinutes(["11:30 AM – 12:30 PM"])).toBe(11 * 60 + 30);
    });

    it("uses the meridiem attached to the start token", () => {
      expect(extractBeginClockMinutes(["11:30 AM – 1:00 PM"])).toBe(11 * 60 + 30);
      expect(extractBeginClockMinutes(["12:30 AM – 1:00 AM"])).toBe(30);
    });

    it("supports CJK prefix meridiems", () => {
      expect(extractBeginClockMinutes(["午後5:15～6:15"])).toBe(17 * 60 + 15);
      expect(extractBeginClockMinutes(["上午9:30 – 10:00"])).toBe(9 * 60 + 30);
    });

    it("supports Korean prefix meridiems (CLDR ko-KR format)", () => {
      // Verbatim from a real ko homepage card (2026-08-20)
      expect(extractBeginClockMinutes(["오후 5:45 – 오후 6:45"])).toBe(17 * 60 + 45);
      expect(extractBeginClockMinutes(["오전 9:30 – 오전 10:00"])).toBe(9 * 60 + 30);
      expect(extractBeginClockMinutes(["오전 11:30 – 오후 12:30"])).toBe(11 * 60 + 30);
    });

    it("ignores texts without a range", () => {
      expect(extractBeginClockMinutes(["全天"])).toBeNull();
      expect(extractBeginClockMinutes(["test2", "17:15 – 18:15"])).toBe(17 * 60 + 15);
      expect(extractBeginClockMinutes([])).toBeNull();
    });
  });

  describe("card lookup helpers", () => {
    it("finds cards by instance id", () => {
      render(scheduleMarkup(cardMarkup()));
      expect(findMeetingCardById(document, INSTANCE_ID)?.id).toBe(INSTANCE_ID);
      expect(findMeetingCardById(document, "eeeeffffgggghhhh_20260814T060000Z")).toBeNull();
      expect(findMeetingCardById(document, "not-an-instance-id")).toBeNull();
    });

    it("finds all calendar cards", () => {
      render(scheduleMarkup(cardMarkup()));
      const cards = findCalendarCards(document);
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe(INSTANCE_ID);
    });

    it("resolves the card from a click target inside it", () => {
      render(scheduleMarkup(cardMarkup()));
      const card = document.getElementById(INSTANCE_ID) as HTMLElement;
      const inner = document.createElement("span");
      card.appendChild(inner);

      expect(closestCalendarCard(inner)?.id).toBe(INSTANCE_ID);
      expect(closestCalendarCard(document.body)).toBeNull();
    });
  });

  describe("extractDurationMinutes", () => {
    it("parses 24h ranges", () => {
      expect(extractDurationMinutes(["11:15 – 12:00"])).toBe(45);
    });

    it("parses 12h ranges crossing noon", () => {
      expect(extractDurationMinutes(["11:15 AM – 1:00 PM"])).toBe(105);
    });

    it("unwraps ranges crossing midnight", () => {
      expect(extractDurationMinutes(["23:30 – 0:15"])).toBe(45);
    });

    it("returns null without a range", () => {
      expect(extractDurationMinutes(["全天"])).toBeNull();
      expect(extractDurationMinutes([])).toBeNull();
    });
  });
});

describe("card join url helpers", () => {
  it("round-trips the instance id through the join url", () => {
    const url = `https://meet.google.com/home?${CARD_JOIN_PARAM}=${INSTANCE_ID}`;
    expect(getCardJoinTarget(url)).toBe(INSTANCE_ID);
  });

  it("returns null for urls without the param", () => {
    expect(getCardJoinTarget("https://meet.google.com/abc-defg-hij")).toBeNull();
    expect(getCardJoinTarget("not a url")).toBeNull();
  });
});
