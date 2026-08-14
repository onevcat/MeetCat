import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseHomepageV2,
  parseCalendarCard,
  findCalendarCards,
  findMeetingCardById,
  closestCalendarCard,
  extractDurationMinutes,
  CALENDAR_INSTANCE_ID_PATTERN,
} from "../src/parser/homepage-v2.js";
import { parseMeetingCards } from "../src/parser/meeting-cards.js";
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

  describe("parseMeetingCards generation fallback", () => {
    it("prefers v1 cards when present", () => {
      const now = Date.now();
      render(`
        <div data-call-id="abc-defg-hij"
             data-begin-time="${now + 600000}"
             data-end-time="${now + 4200000}"
             aria-label="10:00. Legacy Meeting.">
          <div>Legacy Meeting</div>
        </div>
        ${scheduleMarkup(cardMarkup())}
      `);

      const result = parseMeetingCards(document, now);

      expect(result.parser).toBe("v1");
      expect(result.meetings[0].callId).toBe("abc-defg-hij");
    });

    it("falls back to v2 cards when no v1 cards exist", () => {
      render(scheduleMarkup(cardMarkup()));

      const result = parseMeetingCards(document, Date.UTC(2026, 7, 14, 2, 0, 0));

      expect(result.parser).toBe("v2");
      expect(result.meetings[0].callId).toBe(INSTANCE_ID);
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
