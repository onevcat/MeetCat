export interface OverlayHideOptions {
  title?: string;
}

function createEyeIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "currentColor");

  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zm11 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
  );
  svg.appendChild(path);

  return svg;
}

export function attachOverlayHideButton(
  overlay: HTMLElement,
  options: OverlayHideOptions = {}
): void {
  const doc = overlay.ownerDocument;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "meetcat-btn-icon meetcat-hide-btn";

  const title = options.title ?? "Temporarily hide";
  button.title = title;
  button.setAttribute("aria-label", title);

  button.appendChild(createEyeIcon(doc));

  button.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  overlay.appendChild(button);
}
