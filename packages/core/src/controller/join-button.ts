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

/**
 * Find the join button in the meeting page
 *
 * @param container - The document or element to search within
 * @returns JoinButtonResult with button and matched text
 */
export function findJoinButton(container: Document | Element): JoinButtonResult {
  const buttons = container.querySelectorAll("button");

  for (const btn of buttons) {
    const text = btn.textContent?.trim() || "";

    for (const pattern of JOIN_BUTTON_PATTERNS) {
      if (text.includes(pattern)) {
        return { button: btn, matchedText: pattern };
      }
    }
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
