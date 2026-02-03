/**
 * Base styles for MeetCat overlays
 */
export const OVERLAY_BASE_STYLES = `
  font-family: 'Google Sans', Roboto, Arial, sans-serif;
  font-size: 14px;
  color: #202124;
  z-index: 9999;
`;

/**
 * Create a style element with MeetCat overlay CSS
 */
export function createOverlayStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    .meetcat-overlay {
      ${OVERLAY_BASE_STYLES}
      position: fixed;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(60,64,67,0.3), 0 4px 8px rgba(60,64,67,0.15);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .meetcat-overlay-bottom-left {
      bottom: 24px;
      left: 24px;
    }

    .meetcat-overlay-top-center {
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
    }

    .meetcat-icon {
      font-size: 20px;
      line-height: 1;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    img.meetcat-icon {
      object-fit: cover;
      border-radius: 6px;
    }

    .meetcat-text {
      flex: 1;
    }

    .meetcat-title {
      font-weight: 500;
      color: #202124;
    }

    .meetcat-subtitle {
      font-size: 12px;
      color: #5f6368;
      margin-top: 2px;
    }

    .meetcat-countdown {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      color: #1a73e8;
    }

    .meetcat-btn {
      background: none;
      border: 1px solid #dadce0;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 14px;
      font-weight: 500;
      color: #1a73e8;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .meetcat-btn:hover {
      background-color: #f1f3f4;
    }

    .meetcat-btn-cancel {
      color: #5f6368;
    }

    .meetcat-btn-icon {
      background: none;
      border: none;
      padding: 0;
      margin-left: 8px;
      width: 24px;
      height: 24px;
      color: #9aa0a6;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    .meetcat-hide-btn {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    .meetcat-overlay:hover .meetcat-hide-btn,
    .meetcat-overlay:focus-within .meetcat-hide-btn {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }

    .meetcat-hide-btn:hover {
      color: #5f6368;
    }

    .meetcat-progress {
      width: 100%;
      height: 3px;
      background: #e8eaed;
      border-radius: 1.5px;
      margin-top: 8px;
      overflow: hidden;
    }

    .meetcat-progress-bar {
      height: 100%;
      background: #1a73e8;
      transition: width 0.1s linear;
    }
  `;
  return style;
}

/**
 * Ensure overlay styles are injected into the document
 */
let stylesInjected = false;

export function ensureStyles(doc: Document): void {
  if (stylesInjected) return;
  if (doc.querySelector("style[data-meetcat]")) {
    stylesInjected = true;
    return;
  }

  const style = createOverlayStyles();
  style.setAttribute("data-meetcat", "");
  doc.head.appendChild(style);
  stylesInjected = true;
}
