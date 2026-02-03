import type { Meeting } from "@meetcat/core";

/**
 * Message types for extension communication
 */
export type MessageType =
  | "MEETINGS_UPDATED"
  | "MEETING_JOINED"
  | "MEETING_CLOSED"
  | "OPEN_MEETING"
  | "GET_SETTINGS"
  | "UPDATE_SETTINGS"
  | "GET_STATUS";

/**
 * Base message interface
 */
export interface BaseMessage {
  type: MessageType;
}

/**
 * Meetings updated message (content script → service worker)
 */
export interface MeetingsUpdatedMessage extends BaseMessage {
  type: "MEETINGS_UPDATED";
  meetings: Meeting[];
}

/**
 * Meeting joined message (content script → service worker)
 */
export interface MeetingJoinedMessage extends BaseMessage {
  type: "MEETING_JOINED";
  callId: string;
}

/**
 * Meeting closed message (content script → service worker)
 */
export interface MeetingClosedMessage extends BaseMessage {
  type: "MEETING_CLOSED";
  callId: string;
  closedAtMs: number;
}

/**
 * Open meeting message (service worker → tabs)
 */
export interface OpenMeetingMessage extends BaseMessage {
  type: "OPEN_MEETING";
  meeting: Meeting;
}

/**
 * Get settings request
 */
export interface GetSettingsMessage extends BaseMessage {
  type: "GET_SETTINGS";
}

/**
 * Update settings message
 */
export interface UpdateSettingsMessage extends BaseMessage {
  type: "UPDATE_SETTINGS";
  settings: Partial<import("@meetcat/settings").Settings>;
}

/**
 * Get status request
 */
export interface GetStatusMessage extends BaseMessage {
  type: "GET_STATUS";
}

/**
 * Union type for all messages
 */
export type ExtensionMessage =
  | MeetingsUpdatedMessage
  | MeetingJoinedMessage
  | MeetingClosedMessage
  | OpenMeetingMessage
  | GetSettingsMessage
  | UpdateSettingsMessage
  | GetStatusMessage;

/**
 * Extension status
 */
export interface ExtensionStatus {
  enabled: boolean;
  nextMeeting: Meeting | null;
  lastCheck: number | null;
  joinedCallIds: string[];
  suppressedCallIds: string[];
}
