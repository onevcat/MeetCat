import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isTauriEnvironment,
  invoke,
  listen,
  reportMeetings,
  getSettings,
  showNotification,
  reportJoined,
  onCheckMeetings,
  onNavigateAndJoin,
  onSettingsChanged,
} from "../src/tauri-bridge.js";
import type { Meeting } from "../src/types.js";

describe("Tauri Bridge", () => {
  const mockInvoke = vi.fn();
  const mockListen = vi.fn();

  beforeEach(() => {
    // Setup Tauri mock
    (globalThis as unknown as { window: typeof window }).window = {
      __TAURI__: {
        core: {
          invoke: mockInvoke,
        },
        event: {
          listen: mockListen,
          emit: vi.fn(),
        },
      },
    } as unknown as typeof window;
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Clean up window mock
    delete (globalThis as unknown as { window?: typeof window }).window;
  });

  describe("isTauriEnvironment", () => {
    it("should return true when __TAURI__ is present", () => {
      expect(isTauriEnvironment()).toBe(true);
    });

    it("should return false when __TAURI__ is not present", () => {
      delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
      expect(isTauriEnvironment()).toBe(false);
    });

    it("should return false when window is undefined", () => {
      delete (globalThis as unknown as { window?: typeof window }).window;
      expect(isTauriEnvironment()).toBe(false);
    });
  });

  describe("invoke", () => {
    it("should call Tauri invoke with command and args", async () => {
      mockInvoke.mockResolvedValue({ success: true });

      const result = await invoke("test_command", { foo: "bar" });

      expect(mockInvoke).toHaveBeenCalledWith("test_command", { foo: "bar" });
      expect(result).toEqual({ success: true });
    });

    it("should throw error when not in Tauri environment", async () => {
      delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;

      await expect(invoke("test_command")).rejects.toThrow(
        "Not running in Tauri environment"
      );
    });
  });

  describe("listen", () => {
    it("should register event listener", async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValue(unlisten);
      const handler = vi.fn();

      const result = await listen("test-event", handler);

      expect(mockListen).toHaveBeenCalledWith("test-event", expect.any(Function));
      expect(result).toBe(unlisten);
    });

    it("should call handler with payload when event fires", async () => {
      const unlisten = vi.fn();
      let capturedHandler: (e: { payload: unknown }) => void;
      mockListen.mockImplementation((_, h) => {
        capturedHandler = h;
        return Promise.resolve(unlisten);
      });
      const handler = vi.fn();

      await listen("test-event", handler);

      // Simulate event firing
      capturedHandler!({ payload: { data: "test" } });
      expect(handler).toHaveBeenCalledWith({ data: "test" });
    });

    it("should throw error when not in Tauri environment", async () => {
      delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;

      await expect(listen("test-event", vi.fn())).rejects.toThrow(
        "Not running in Tauri environment"
      );
    });
  });

  describe("reportMeetings", () => {
    it("should serialize meetings and call invoke", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const meetings: Meeting[] = [
        {
          callId: "abc-defg-hij",
          url: "https://meet.google.com/abc-defg-hij",
          title: "Test Meeting",
          displayTime: "10:00 AM",
          beginTime: new Date("2024-01-15T10:00:00Z"),
          endTime: new Date("2024-01-15T11:00:00Z"),
          eventId: "event123",
          startsInMinutes: 5,
        },
      ];

      await reportMeetings(meetings);

      expect(mockInvoke).toHaveBeenCalledWith("meetings_updated", {
        meetings: [
          {
            call_id: "abc-defg-hij",
            url: "https://meet.google.com/abc-defg-hij",
            title: "Test Meeting",
            display_time: "10:00 AM",
            begin_time: "2024-01-15T10:00:00.000Z",
            end_time: "2024-01-15T11:00:00.000Z",
            event_id: "event123",
            starts_in_minutes: 5,
          },
        ],
      });
    });

    it("should handle empty meetings array", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await reportMeetings([]);

      expect(mockInvoke).toHaveBeenCalledWith("meetings_updated", { meetings: [] });
    });
  });

  describe("getSettings", () => {
    it("should call invoke with get_settings command", async () => {
      const mockSettings = {
        checkIntervalSeconds: 30,
        joinBeforeMinutes: 1,
        autoClickJoin: true,
        joinCountdownSeconds: 30,
        titleExcludeFilters: [],
        defaultMicState: "muted",
        defaultCameraState: "muted",
        showNotifications: true,
        showCountdownOverlay: true,
      };
      mockInvoke.mockResolvedValue(mockSettings);

      const result = await getSettings();

      expect(mockInvoke).toHaveBeenCalledWith("get_settings", undefined);
      expect(result).toEqual(mockSettings);
    });
  });

  describe("showNotification", () => {
    it("should call invoke with notification details", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await showNotification("Test Title", "Test Body");

      expect(mockInvoke).toHaveBeenCalledWith("show_notification", {
        title: "Test Title",
        body: "Test Body",
      });
    });
  });

  describe("reportJoined", () => {
    it("should call invoke with callId", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await reportJoined("abc-defg-hij");

      expect(mockInvoke).toHaveBeenCalledWith("meeting_joined", {
        callId: "abc-defg-hij",
      });
    });
  });

  describe("onCheckMeetings", () => {
    it("should listen for check-meetings event", async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValue(unlisten);
      const handler = vi.fn();

      const result = await onCheckMeetings(handler);

      expect(mockListen).toHaveBeenCalledWith("check-meetings", expect.any(Function));
      expect(result).toBe(unlisten);
    });
  });

  describe("onNavigateAndJoin", () => {
    it("should listen for navigate-and-join event", async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValue(unlisten);
      const handler = vi.fn();

      const result = await onNavigateAndJoin(handler);

      expect(mockListen).toHaveBeenCalledWith(
        "navigate-and-join",
        expect.any(Function)
      );
      expect(result).toBe(unlisten);
    });
  });

  describe("onSettingsChanged", () => {
    it("should listen for settings_changed event", async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValue(unlisten);
      const handler = vi.fn();

      const result = await onSettingsChanged(handler);

      expect(mockListen).toHaveBeenCalledWith(
        "settings_changed",
        expect.any(Function)
      );
      expect(result).toBe(unlisten);
    });
  });
});
