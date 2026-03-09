import { t } from "@meetcat/i18n";
import type { Meeting } from "../types.js";
import { attachOverlayHideButton } from "./overlay-controls.js";
import { ensureStyles } from "./styles.js";

export interface HomepageOverlayOptions {
  /** URL for the icon image (uses emoji fallback if not provided) */
  iconUrl?: string;
  /** Callback when user hides the overlay */
  onHide?: () => void;
  /** Callback when user clicks update notice */
  onUpdateClick?: () => void;
}

export interface UpdateNotice {
  version: string;
}

export interface HomepageOverlay {
  /** Update the overlay with meeting info */
  update(meeting: Meeting | null): void;
  /** Update or clear update notice */
  setUpdateInfo(update: UpdateNotice | null): void;
  /** Remove the overlay from DOM */
  destroy(): void;
}

/**
 * Format time remaining as mm:ss or hh:mm:ss
 */
function formatTimeRemaining(minutes: number): string {
  if (minutes < 60) {
    const secs = Math.round((minutes % 1) * 60);
    const mins = Math.floor(minutes);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours}h ${mins}m`;
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
  span.textContent = "\u{1F431}";
  return span;
}

/**
 * Create a homepage overlay showing next meeting countdown
 *
 * @param container - The element to append the overlay to (usually document.body)
 * @param options - Optional configuration
 * @returns HomepageOverlay interface
 */
export function createHomepageOverlay(
  container: Element,
  options: HomepageOverlayOptions = {}
): HomepageOverlay {
  const { iconUrl, onHide, onUpdateClick } = options;
  const doc = container.ownerDocument;
  ensureStyles(doc);

  // Create overlay element using DOM API (avoid innerHTML for Trusted Types CSP)
  const overlay = doc.createElement("div");
  overlay.className = "meetcat-overlay meetcat-overlay-bottom-left";

  // Create icon
  const iconEl = createIconElement(doc, iconUrl);
  overlay.appendChild(iconEl);

  // Create text container
  const textDiv = doc.createElement("div");
  textDiv.className = "meetcat-text";

  const titleEl = doc.createElement("div");
  titleEl.className = "meetcat-title";
  titleEl.textContent = t("overlay.noUpcomingMeetings");
  textDiv.appendChild(titleEl);

  const subtitleEl = doc.createElement("div");
  subtitleEl.className = "meetcat-subtitle";
  textDiv.appendChild(subtitleEl);

  const updateRow = doc.createElement("div");
  updateRow.className = "meetcat-update-row";
  updateRow.style.display = "none";

  const updateButton = doc.createElement("button");
  updateButton.type = "button";
  updateButton.className = "meetcat-update-btn";
  updateButton.textContent = t("overlay.updateAvailable");
  updateButton.addEventListener("click", () => onUpdateClick?.());
  updateRow.appendChild(updateButton);
  textDiv.appendChild(updateRow);

  overlay.appendChild(textDiv);

  attachOverlayHideButton(overlay, { onHide });

  // For countdown display in subtitle
  let countdownSpan: HTMLSpanElement | null = null;

  let currentMeeting: Meeting | null = null;
  let currentUpdate: UpdateNotice | null = null;
  let updateInterval: ReturnType<typeof setInterval> | null = null;

  function updateDisplay(): void {
    if (!currentMeeting) {
      titleEl.textContent = t("overlay.noUpcomingMeetings");
      subtitleEl.textContent = "";
      countdownSpan = null;
      return;
    }

    const now = Date.now();
    const startTime = currentMeeting.beginTime.getTime();
    const minutesUntil = (startTime - now) / 60000;

    if (minutesUntil <= 0) {
      // Meeting has started
      titleEl.textContent = t("overlay.inProgress", { title: currentMeeting.title });
      subtitleEl.textContent = "";
      countdownSpan = null;
    } else {
      // Meeting upcoming
      titleEl.textContent = t("overlay.next", { title: currentMeeting.title });

      // Build subtitle using DOM API
      if (!countdownSpan) {
        subtitleEl.textContent = "";
        const inText = doc.createTextNode(t("overlay.in"));
        subtitleEl.appendChild(inText);

        countdownSpan = doc.createElement("span");
        countdownSpan.className = "meetcat-countdown";
        subtitleEl.appendChild(countdownSpan);
      }
      countdownSpan.textContent = formatTimeRemaining(minutesUntil);
    }
  }

  // Start interval for live countdown
  updateInterval = setInterval(updateDisplay, 1000);

  // Append to container
  container.appendChild(overlay);

  return {
    update(meeting: Meeting | null): void {
      currentMeeting = meeting;
      updateDisplay();
    },

    setUpdateInfo(update: UpdateNotice | null): void {
      currentUpdate = update;
      if (!currentUpdate) {
        updateRow.style.display = "none";
        updateButton.textContent = t("overlay.updateAvailable");
        return;
      }
      updateButton.textContent = t("overlay.newVersionAvailable", {
        version: currentUpdate.version,
      });
      updateRow.style.display = "block";
    },

    destroy(): void {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      overlay.remove();
    },
  };
}
