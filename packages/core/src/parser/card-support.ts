/**
 * Shared helpers for homepage meeting-card parsers (legacy and calendar).
 */

export function getHiddenReason(card: Element): string | null {
  if (card.closest("[hidden]")) return "ancestor-hidden";
  if (card.closest("[aria-hidden='true']")) return "ancestor-aria-hidden";

  const styleAttr = card.getAttribute("style") || "";
  if (styleAttr.includes("display: none") || styleAttr.includes("visibility: hidden")) {
    return "inline-style-hidden";
  }

  const view = card.ownerDocument?.defaultView;
  const computed = view?.getComputedStyle?.(card as Element);
  if (computed && (computed.display === "none" || computed.visibility === "hidden")) {
    return "computed-style-hidden";
  }

  const HTMLElementCtor = view?.HTMLElement;
  if (HTMLElementCtor && card instanceof HTMLElementCtor) {
    const { display, visibility } = card.style;
    if (display === "none" || visibility === "hidden") {
      return "inline-style-hidden";
    }

    const isJsdom = view?.navigator?.userAgent?.includes("jsdom");
    if (!isJsdom && card.getClientRects().length === 0) {
      return "no-client-rects";
    }
  }

  return null;
}

export function formatDisplayTime(beginTimeMs: number, doc: Document | null): string {
  const view = doc?.defaultView;
  if (!view?.Intl?.DateTimeFormat) return "";
  const formatter = new view.Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return formatter.format(new Date(beginTimeMs));
}
