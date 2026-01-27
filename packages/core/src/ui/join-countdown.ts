import { ensureStyles } from "./styles.js";

export interface JoinCountdownOptions {
  /** Total seconds for countdown */
  seconds: number;
  /** Callback when countdown completes */
  onComplete: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** URL for the icon image (uses emoji fallback if not provided) */
  iconUrl?: string;
}

export interface JoinCountdown {
  /** Start the countdown */
  start(): void;
  /** Cancel the countdown */
  cancel(): void;
  /** Remove the overlay from DOM */
  destroy(): void;
}

/**
 * Create icon element (img or span with emoji)
 */
function createIconElement(doc: Document, iconUrl?: string): HTMLElement {
  if (iconUrl) {
    const img = doc.createElement("img");
    img.className = "meetcat-icon";
    img.src = iconUrl;
    img.alt = "MeetCat";
    return img;
  }
  const span = doc.createElement("span");
  span.className = "meetcat-icon";
  span.textContent = "🐱";
  return span;
}

/**
 * Create a join countdown overlay on the meeting page
 *
 * @param container - The element to append the overlay to (usually document.body)
 * @param options - Countdown options
 * @returns JoinCountdown interface
 */
export function createJoinCountdown(
  container: Element,
  options: JoinCountdownOptions
): JoinCountdown {
  const { seconds, onComplete, onCancel, iconUrl } = options;
  const doc = container.ownerDocument;
  ensureStyles(doc);

  // Create overlay element using DOM API (avoid innerHTML for Trusted Types CSP)
  const overlay = doc.createElement("div");
  overlay.className = "meetcat-overlay meetcat-overlay-top-center";

  // Create icon
  const iconEl = createIconElement(doc, iconUrl);
  overlay.appendChild(iconEl);

  // Create text container
  const textDiv = doc.createElement("div");
  textDiv.className = "meetcat-text";

  // Create title with countdown
  const titleDiv = doc.createElement("div");
  titleDiv.className = "meetcat-title";

  const titleText = doc.createTextNode("Auto-joining in ");
  titleDiv.appendChild(titleText);

  const countdownEl = doc.createElement("span");
  countdownEl.className = "meetcat-countdown";
  countdownEl.textContent = `${seconds}s`;
  titleDiv.appendChild(countdownEl);

  textDiv.appendChild(titleDiv);

  // Create progress bar
  const progressDiv = doc.createElement("div");
  progressDiv.className = "meetcat-progress";

  const progressBar = doc.createElement("div");
  progressBar.className = "meetcat-progress-bar";
  progressBar.style.width = "100%";
  progressDiv.appendChild(progressBar);

  textDiv.appendChild(progressDiv);
  overlay.appendChild(textDiv);

  // Create cancel button
  const cancelBtn = doc.createElement("button");
  cancelBtn.className = "meetcat-btn meetcat-btn-cancel";
  cancelBtn.textContent = "Cancel";
  overlay.appendChild(cancelBtn);

  let remainingSeconds = seconds;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isDestroyed = false;

  function updateDisplay(): void {
    countdownEl.textContent = `${remainingSeconds}s`;
    const progress = (remainingSeconds / seconds) * 100;
    progressBar.style.width = `${progress}%`;
  }

  function handleCancel(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (!isDestroyed) {
      onCancel();
    }
  }

  cancelBtn.addEventListener("click", handleCancel);

  // Append to container
  container.appendChild(overlay);

  return {
    start(): void {
      if (intervalId) return;

      intervalId = setInterval(() => {
        remainingSeconds--;
        updateDisplay();

        if (remainingSeconds <= 0) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          if (!isDestroyed) {
            onComplete();
          }
        }
      }, 1000);
    },

    cancel(): void {
      handleCancel();
    },

    destroy(): void {
      isDestroyed = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      cancelBtn.removeEventListener("click", handleCancel);
      overlay.remove();
    },
  };
}
