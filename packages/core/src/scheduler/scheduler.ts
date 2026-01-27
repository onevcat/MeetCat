import type { Meeting, SchedulerConfig, SchedulerEvent } from "../types.js";
import { DEFAULT_SETTINGS } from "@meetcat/settings";

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: Required<SchedulerConfig> = {
  joinBeforeMinutes: DEFAULT_SETTINGS.joinBeforeMinutes,
  titleExcludeFilters: DEFAULT_SETTINGS.titleExcludeFilters,
  maxMinutesAfterStart: 30, // Not user-configurable, fixed at 30 minutes
};

/**
 * Create a scheduler logic instance
 *
 * @param initialConfig - Initial configuration
 * @returns Scheduler interface with check and updateConfig methods
 */
export function createSchedulerLogic(initialConfig: Partial<SchedulerConfig> = {}) {
  let config: Required<SchedulerConfig> = {
    ...DEFAULT_SCHEDULER_CONFIG,
    ...initialConfig,
  };

  /**
   * Check if any meeting should be joined
   *
   * @param meetings - Array of meetings to check
   * @param alreadyJoined - Set of meeting call IDs that have already been joined
   * @param now - Current timestamp (for testing)
   * @returns SchedulerEvent indicating what action to take
   */
  function check(
    meetings: Meeting[],
    alreadyJoined: Set<string> = new Set(),
    now: number = Date.now()
  ): SchedulerEvent {
    const joinThreshold = config.joinBeforeMinutes * 60 * 1000;
    const maxAfterStart = config.maxMinutesAfterStart * 60 * 1000;

    let nextUpcoming: Meeting | null = null;
    let nextUpcomingMinutes = Infinity;

    for (const meeting of meetings) {
      // Skip already joined
      if (alreadyJoined.has(meeting.callId)) continue;

      // Skip if title matches any exclude filter (case-sensitive)
      if (
        config.titleExcludeFilters.length > 0 &&
        config.titleExcludeFilters.some((filter) => meeting.title.includes(filter))
      ) {
        continue;
      }

      const startTime = meeting.beginTime.getTime();
      const timeUntilStart = startTime - now;

      // Check if it's time to join
      // Join if: within joinThreshold before start, or up to maxAfterStart after start
      const shouldJoin =
        timeUntilStart <= joinThreshold && timeUntilStart > -maxAfterStart;

      if (shouldJoin) {
        return {
          type: "join",
          meeting,
        };
      }

      // Track next upcoming meeting
      if (timeUntilStart > 0 && timeUntilStart < nextUpcomingMinutes * 60000) {
        nextUpcoming = meeting;
        nextUpcomingMinutes = Math.round(timeUntilStart / 60000);
      }
    }

    // Return upcoming info if there's a meeting coming
    if (nextUpcoming) {
      return {
        type: "upcoming",
        meeting: nextUpcoming,
        minutesUntil: nextUpcomingMinutes,
      };
    }

    return {
      type: "none",
      meeting: null,
    };
  }

  /**
   * Update scheduler configuration
   *
   * @param newConfig - Partial configuration to merge
   */
  function updateConfig(newConfig: Partial<SchedulerConfig>): void {
    config = { ...config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  function getConfig(): Required<SchedulerConfig> {
    return { ...config };
  }

  return {
    check,
    updateConfig,
    getConfig,
  };
}

export type Scheduler = ReturnType<typeof createSchedulerLogic>;
