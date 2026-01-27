import { z } from "zod";

/**
 * Media state options
 */
export const MediaStateSchema = z.enum(["muted", "unmuted"]);

/**
 * Extension-specific settings
 */
export const ExtensionSettingsSchema = z.object({
  /** Open meeting in new tab (default: true) */
  openInNewTab: z.boolean().default(true),
});

/**
 * Tauri-specific settings
 */
export const TauriSettingsSchema = z.object({
  /** Run in background when window is closed (default: true) */
  runInBackground: z.boolean().default(true),
  /** Start app at system login (default: false) */
  startAtLogin: z.boolean().default(false),
  /** Show system tray icon (default: true) */
  showTrayIcon: z.boolean().default(true),
});

/**
 * Main settings schema for MeetCat
 */
export const SettingsSchema = z.object({
  // Timing
  /** Interval in seconds between checking for meetings (30-120, default: 30) */
  checkIntervalSeconds: z.number().min(30).max(120).default(30),
  /** Minutes before meeting start to trigger auto-join (default: 1) */
  joinBeforeMinutes: z.number().min(0).max(30).default(1),

  // Join behavior
  /** Automatically click join button (false = only open page) */
  autoClickJoin: z.boolean().default(true),
  /** Seconds to countdown before auto-join (allows user to cancel) */
  joinCountdownSeconds: z.number().min(0).max(60).default(30),
  /** Exclude meetings with titles containing any of these strings (case-sensitive) */
  titleExcludeFilters: z.array(z.string()).default([]),

  // Media defaults
  /** Default microphone state when joining */
  defaultMicState: MediaStateSchema.default("muted"),
  /** Default camera state when joining */
  defaultCameraState: MediaStateSchema.default("muted"),

  // UI
  /** Show desktop notifications */
  showNotifications: z.boolean().default(true),
  /** Show countdown overlay on Google Meet pages */
  showCountdownOverlay: z.boolean().default(true),

  // Platform-specific
  /** Chrome Extension specific settings */
  extension: ExtensionSettingsSchema.optional(),
  /** Tauri app specific settings */
  tauri: TauriSettingsSchema.optional(),
});

/**
 * Settings type inferred from schema
 */
export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Extension settings type
 */
export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

/**
 * Tauri settings type
 */
export type TauriSettings = z.infer<typeof TauriSettingsSchema>;

/**
 * Media state type
 */
export type MediaState = z.infer<typeof MediaStateSchema>;
