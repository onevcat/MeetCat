import type { JoinButtonResult } from "../types.js";

/**
 * Join button text patterns for multiple languages
 */
export const JOIN_BUTTON_PATTERNS = [
  // Chinese
  "立即加入",
  "仍要加入",
  "加入会议",
  "请求加入",
  // English
  "Join now",
  "Join anyway",
  "Ask to join",
  // Japanese
  "今すぐ参加",
  "参加をリクエスト",
  "参加",
];

const PROMO_ANCHOR_ID = "w5gBed";

function getButtonText(button: Element): string {
  return (button.textContent || "").trim();
}

function getAccessibleButtonText(button: Element): string {
  const element = button as HTMLElement;
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent ||
    ""
  ).trim();
}

function isMenuButton(button: Element): boolean {
  return button.hasAttribute("aria-haspopup") || button.hasAttribute("aria-expanded");
}

function isDisabledButton(button: Element): boolean {
  const element = button as HTMLButtonElement;
  return element.disabled || element.getAttribute("aria-disabled") === "true";
}

function isElementVisible(button: Element, rect?: DOMRect): boolean {
  const element = button as HTMLElement;
  const box = rect ?? element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;

  const doc = element.ownerDocument;
  const win = doc?.defaultView;
  if (!win) return true;

  const style = win.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  return true;
}

function findJoinButtonByTextPatterns(buttons: Element[]): JoinButtonResult | null {
  for (const btn of buttons) {
    const text = getButtonText(btn);

    for (const pattern of JOIN_BUTTON_PATTERNS) {
      if (text.includes(pattern)) {
        return { button: btn, matchedText: pattern };
      }
    }
  }

  return null;
}

function findJoinButtonByHeuristics(
  buttons: Element[]
): JoinButtonResult | null {
  const candidates = buttons
    .map((button, index) => {
      const text = getAccessibleButtonText(button);
      const rect = (button as HTMLElement).getBoundingClientRect();
      const area = rect.width * rect.height;
      return {
        button,
        text,
        rect,
        area,
        index,
        isMenu: isMenuButton(button),
        isDisabled: isDisabledButton(button),
        hasPromoAnchor: (button as HTMLElement).getAttribute("data-promo-anchor-id") ===
          PROMO_ANCHOR_ID,
      };
    })
    .filter((candidate) =>
      candidate.text.length > 0 &&
      candidate.area > 0 &&
      !candidate.isDisabled &&
      isElementVisible(candidate.button, candidate.rect)
    );

  if (candidates.length === 0) return null;

  const nonMenuCandidates = candidates.filter((candidate) => !candidate.isMenu);
  if (nonMenuCandidates.length === 0) return null;

  const promoCandidates = nonMenuCandidates.filter((candidate) => candidate.hasPromoAnchor);
  const finalCandidates = promoCandidates.length > 0 ? promoCandidates : nonMenuCandidates;

  finalCandidates.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    if (b.text.length !== a.text.length) return b.text.length - a.text.length;
    return a.index - b.index;
  });

  const winner = finalCandidates[0];
  return { button: winner.button, matchedText: winner.text || null };
}

/**
 * Find the join button in the meeting page
 *
 * @param container - The document or element to search within
 * @returns JoinButtonResult with button and matched text
 */
export function findJoinButton(container: Document | Element): JoinButtonResult {
  const buttons = Array.from(container.querySelectorAll("button"));

  const strategies = [findJoinButtonByTextPatterns, findJoinButtonByHeuristics];
  for (const strategy of strategies) {
    const result = strategy(buttons);
    if (result?.button) return result;
  }

  return { button: null, matchedText: null };
}

/**
 * Click the join button
 *
 * @param container - The document or element to search within
 * @returns true if button was found and clicked
 */
export function clickJoinButton(container: Document | Element): boolean {
  const { button } = findJoinButton(container);
  if (!button) {
    return false;
  }

  // Click the button
  (button as HTMLElement).click();

  // Also dispatch a proper mouse event for better compatibility
  try {
    const doc = "ownerDocument" in container ? container.ownerDocument : container;
    const win = doc?.defaultView;
    button.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: win || undefined,
      })
    );
  } catch {
    // Ignore MouseEvent errors in test environments
  }

  return true;
}

/**
 * Check if the current URL is a meeting page
 *
 * @param pathname - The pathname to check (e.g., "/abc-defg-hij")
 * @returns The meeting code if valid, null otherwise
 */
export function getMeetingCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/);
  return match ? match[1] : null;
}
