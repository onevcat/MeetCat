const MEETING_PATH_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function isMeetHomepageUrl(url: string): boolean {
  if (!url.startsWith("https://meet.google.com/")) return false;

  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get("calling") === "1") return false;

    const path = parsed.pathname.replace(/\/$/, "");
    if (path === "") return true;

    const slug = path.startsWith("/") ? path.slice(1) : path;
    return !MEETING_PATH_PATTERN.test(slug);
  } catch {
    return false;
  }
}
