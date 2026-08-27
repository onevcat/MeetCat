/**
 * Serialize the live DOM for a diagnostic snapshot.
 *
 * Inline script bodies are stripped: Meet embeds large JSON payloads there
 * (account identity, session state) that carry no value for parser debugging.
 * Markup, attributes, visible text, and styles are kept verbatim — they are
 * exactly what the parsers and their failure modes are diagnosed from.
 * <noscript>/<template> subtrees are dropped for the same reason.
 */
export function captureSnapshotHtml(doc: Document): string {
  const documentElement = doc.documentElement;
  if (!documentElement) return "";

  const root = documentElement.cloneNode(true) as HTMLElement;
  for (const el of root.querySelectorAll("script")) {
    el.textContent = "";
  }
  for (const el of root.querySelectorAll("noscript, template")) {
    el.remove();
  }
  return root.outerHTML;
}
