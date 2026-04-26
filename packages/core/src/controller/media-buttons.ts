import type {
  MediaApplyResult,
  MediaApplyOptions,
  MediaButtons,
  MediaStateResult,
} from "../types.js";

/**
 * Selector for media toggle buttons (mic/camera)
 */
export const MEDIA_BUTTON_SELECTOR = '[role="button"][data-is-muted]';

/**
 * Find mic and camera toggle buttons in the meeting page
 *
 * @param container - The document or element to search within
 * @returns MediaButtons with mic and camera button references
 */
export function findMediaButtons(container: Document | Element): MediaButtons {
  const buttons = container.querySelectorAll(MEDIA_BUTTON_SELECTOR);
  // Index 0 = mic, Index 1 = camera (based on DOM order)
  return {
    micButton: buttons[0] || null,
    cameraButton: buttons[1] || null,
  };
}

/**
 * Check if a media button is in muted/off state
 *
 * @param button - The button element
 * @returns true if muted, false if unmuted, null if button not found
 */
export function isMuted(button: Element | null): boolean | null {
  if (!button) return null;
  const value = (button as HTMLElement).dataset.isMuted;
  if (value === undefined || value === "") return null;
  return value === "true";
}

/**
 * Set the mic state
 *
 * @param container - The document or element to search within
 * @param enabled - true for unmuted, false for muted
 * @returns MediaStateResult indicating success and whether state changed
 */
export function setMicState(
  container: Document | Element,
  enabled: boolean
): MediaStateResult {
  const { micButton } = findMediaButtons(container);
  if (!micButton) {
    return { success: false, changed: false };
  }

  const currentlyMuted = isMuted(micButton);
  if (currentlyMuted === null) {
    return { success: false, changed: false };
  }

  // Determine if we need to click
  // enabled=true (want unmuted) + currentlyMuted=true → need to click
  // enabled=false (want muted) + currentlyMuted=false → need to click
  const needsClick = enabled === currentlyMuted;

  if (needsClick) {
    (micButton as HTMLElement).click();
    return { success: true, changed: true };
  }

  return { success: true, changed: false };
}

/**
 * Set the camera state
 *
 * @param container - The document or element to search within
 * @param enabled - true for on, false for off
 * @returns MediaStateResult indicating success and whether state changed
 */
export function setCameraState(
  container: Document | Element,
  enabled: boolean
): MediaStateResult {
  const { cameraButton } = findMediaButtons(container);
  if (!cameraButton) {
    return { success: false, changed: false };
  }

  const currentlyOff = isMuted(cameraButton);
  if (currentlyOff === null) {
    return { success: false, changed: false };
  }

  // Same logic as mic
  const needsClick = enabled === currentlyOff;

  if (needsClick) {
    (cameraButton as HTMLElement).click();
    return { success: true, changed: true };
  }

  return { success: true, changed: false };
}

const DEFAULT_APPLY_OPTIONS: Required<MediaApplyOptions> = {
  maxAttempts: 3,
  verifyDelayMs: 200,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyMediaButton(
  container: Document | Element,
  kind: "mic" | "camera",
  enabled: boolean,
  options: MediaApplyOptions
): Promise<MediaApplyResult> {
  const { maxAttempts, verifyDelayMs } = { ...DEFAULT_APPLY_OPTIONS, ...options };
  const desiredOff = !enabled;
  let clicks = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { micButton, cameraButton } = findMediaButtons(container);
    const button = kind === "mic" ? micButton : cameraButton;
    if (!button) {
      return { success: false, clicks, attempts: attempt };
    }
    const currentlyOff = isMuted(button);
    if (currentlyOff === null) {
      return { success: false, clicks, attempts: attempt };
    }
    if (currentlyOff === desiredOff) {
      return { success: true, clicks, attempts: attempt };
    }
    (button as HTMLElement).click();
    clicks++;
    await delay(verifyDelayMs);
  }

  // Final verification after the last click
  const { micButton, cameraButton } = findMediaButtons(container);
  const button = kind === "mic" ? micButton : cameraButton;
  if (!button) {
    return { success: false, clicks, attempts: maxAttempts };
  }
  const currentlyOff = isMuted(button);
  if (currentlyOff === null) {
    return { success: false, clicks, attempts: maxAttempts };
  }
  return {
    success: currentlyOff === desiredOff,
    clicks,
    attempts: maxAttempts,
  };
}

/**
 * Set the mic state with verification and retry.
 *
 * Useful when Meet's preview page has rendered the button DOM but its event
 * handlers aren't fully wired yet — a single `setMicState` click may be
 * silently dropped, leaving the user with the wrong mic state.
 */
export function applyMicState(
  container: Document | Element,
  enabled: boolean,
  options: MediaApplyOptions = {}
): Promise<MediaApplyResult> {
  return applyMediaButton(container, "mic", enabled, options);
}

/**
 * Set the camera state with verification and retry.
 */
export function applyCameraState(
  container: Document | Element,
  enabled: boolean,
  options: MediaApplyOptions = {}
): Promise<MediaApplyResult> {
  return applyMediaButton(container, "camera", enabled, options);
}
