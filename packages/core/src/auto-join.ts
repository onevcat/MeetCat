const AUTO_JOIN_PARAM = "meetcatAuto";

/**
 * Append MeetCat auto-join marker to a meeting URL.
 */
export function appendAutoJoinParam(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(AUTO_JOIN_PARAM, "1");
    return parsed.toString();
  } catch (error) {
    try {
      const parsed = new URL(url, "https://meet.google.com");
      parsed.searchParams.set(AUTO_JOIN_PARAM, "1");
      return parsed.toString();
    } catch (fallbackError) {
      return url;
    }
  }
}

/**
 * Check if a URL contains the MeetCat auto-join marker.
 */
export function hasAutoJoinParam(url: string): boolean {
  try {
    const parsed = new URL(url, "https://meet.google.com");
    return parsed.searchParams.has(AUTO_JOIN_PARAM);
  } catch (error) {
    return false;
  }
}
