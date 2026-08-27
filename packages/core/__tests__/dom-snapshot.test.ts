import { describe, expect, it } from "vitest";
import { captureSnapshotHtml } from "../src/utils/dom-snapshot.js";

describe("captureSnapshotHtml", () => {
  it("keeps markup, attributes, text, and styles verbatim", () => {
    document.body.innerHTML = `
      <div role="button" id="abc123_20260827T021500Z" aria-labelledby="t1 t2">
        <span id="t1">ANDD Daily</span>
        <span id="t2">11:15 – 12:00</span>
      </div>
      <style>.card { display: none; }</style>
    `;

    const html = captureSnapshotHtml(document);
    expect(html).toContain('id="abc123_20260827T021500Z"');
    expect(html).toContain('aria-labelledby="t1 t2"');
    expect(html).toContain("ANDD Daily");
    expect(html).toContain("11:15 – 12:00");
    expect(html).toContain(".card { display: none; }");
  });

  it("strips inline script bodies but keeps the tags and their src", () => {
    document.body.innerHTML = "<div>content</div>";
    const inline = document.createElement("script");
    inline.textContent = 'window.SECRET = {"email":"user@example.com"};';
    document.body.appendChild(inline);
    const external = document.createElement("script");
    external.setAttribute("src", "https://example.com/app.js");
    document.body.appendChild(external);

    const html = captureSnapshotHtml(document);
    expect(html).not.toContain("SECRET");
    expect(html).not.toContain("user@example.com");
    expect(html).toContain("<script></script>");
    expect(html).toContain('src="https://example.com/app.js"');
  });

  it("drops noscript and template subtrees", () => {
    document.body.innerHTML = `
      <noscript>enable javascript user@example.com</noscript>
      <template><div>hidden payload</div></template>
      <div>visible</div>
    `;

    const html = captureSnapshotHtml(document);
    expect(html).not.toContain("enable javascript");
    expect(html).not.toContain("hidden payload");
    expect(html).toContain("visible");
  });

  it("does not mutate the live document", () => {
    document.body.innerHTML = "<div>content</div>";
    const script = document.createElement("script");
    script.textContent = "window.KEEP_ME = true;";
    document.body.appendChild(script);

    captureSnapshotHtml(document);
    expect(document.querySelector("script")?.textContent).toBe(
      "window.KEEP_ME = true;"
    );
  });
});
