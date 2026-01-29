import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { App } from "../src/App.js";
import { DEFAULT_SETTINGS, DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;
const mockListen = listen as ReturnType<typeof vi.fn>;

describe("App", () => {
  const defaultSettings = {
    ...DEFAULT_SETTINGS,
    tauri: DEFAULT_TAURI_SETTINGS,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(defaultSettings);
    mockListen.mockResolvedValue(() => {});
  });

  it("should show loading state initially", () => {
    // Make the Promise hang to keep loading state
    mockInvoke.mockImplementation(() => new Promise(() => {}));

    render(<App />);

    expect(screen.getByText("Loading settings...")).toBeDefined();
  });

  it("should render MeetCat Settings title after loading", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("MeetCat Settings")).toBeDefined();
    });
  });

  it("should render timing section", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
      expect(screen.getByText("Open Meeting Preparing Page")).toBeDefined();
      expect(screen.getByText("Auto-join countdown")).toBeDefined();
      expect(screen.getByText("Stop auto-join")).toBeDefined();
    });
  });

  it("should render general section", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
      expect(screen.getByText("Auto-click join")).toBeDefined();
      expect(screen.getByText("Countdown overlay")).toBeDefined();
      expect(screen.getByText("Notifications")).toBeDefined();
    });
  });

  it("should render advanced section media defaults", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
      expect(screen.getByText("Default microphone")).toBeDefined();
      expect(screen.getByText("Default camera")).toBeDefined();
    });
  });

  it("should render advanced section exclude filters", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
      expect(screen.getByText("Exclude keywords")).toBeDefined();
      expect(screen.getByPlaceholderText("Enter filter text...")).toBeDefined();
    });
  });

  it("should render general section app behavior", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
      expect(screen.getByText("Start at login")).toBeDefined();
    });
  });

  it("should call invoke with save_settings when changing setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", expect.any(Object));
    });
  });

  it("should update joinBeforeMinutes when input changes", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const joinBeforeInput = inputs[0];
    fireEvent.change(joinBeforeInput, { target: { value: "5" } });
    fireEvent.blur(joinBeforeInput);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinBeforeMinutes: 5 }),
      });
    });
  });

  it("should default joinBeforeMinutes to default when input is invalid", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const joinBeforeInput = inputs[0];
    fireEvent.change(joinBeforeInput, { target: { value: "invalid" } });
    fireEvent.blur(joinBeforeInput);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinBeforeMinutes: 1 }),
      });
    });
  });

  it("should update joinCountdownSeconds when input changes", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const countdownInput = inputs[1];
    fireEvent.change(countdownInput, { target: { value: "15" } });
    fireEvent.blur(countdownInput);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinCountdownSeconds: 15 }),
      });
    });
  });

  it("should default joinCountdownSeconds to default when input is invalid", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const countdownInput = inputs[1];
    fireEvent.change(countdownInput, { target: { value: "invalid" } });
    fireEvent.blur(countdownInput);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinCountdownSeconds: 20 }),
      });
    });
  });

  it("should default joinBeforeMinutes when input is out of range", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const joinBeforeInput = inputs[0];
    fireEvent.change(joinBeforeInput, { target: { value: "100" } });
    fireEvent.blur(joinBeforeInput);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinBeforeMinutes: 1 }),
      });
    });
  });

  it("should update maxMinutesAfterStart when input changes", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const maxAfterStartInput = inputs[2];
    fireEvent.change(maxAfterStartInput, { target: { value: "12" } });
    fireEvent.blur(maxAfterStartInput);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ maxMinutesAfterStart: 12 }),
      });
    });
  });

  it("should default maxMinutesAfterStart when input is invalid", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const maxAfterStartInput = inputs[2];
    fireEvent.change(maxAfterStartInput, { target: { value: "invalid" } });
    fireEvent.blur(maxAfterStartInput);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ maxMinutesAfterStart: 10 }),
      });
    });
  });

  it("should add filter when clicking Add button", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
    });

    const filterInput = screen.getByPlaceholderText("Enter filter text...");
    fireEvent.change(filterInput, { target: { value: "test-filter" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          titleExcludeFilters: ["test-filter"],
        }),
      });
    });
  });

  it("should add filter when pressing Enter", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
    });

    const filterInput = screen.getByPlaceholderText("Enter filter text...");
    fireEvent.change(filterInput, { target: { value: "test-filter" } });
    fireEvent.keyDown(filterInput, { key: "Enter" });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          titleExcludeFilters: ["test-filter"],
        }),
      });
    });
  });

  it("should not add empty filter", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add"));

    // Should only have the initial get_settings call
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("should not add duplicate filter", async () => {
    mockInvoke.mockResolvedValue({
      ...defaultSettings,
      titleExcludeFilters: ["existing-filter"],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("existing-filter")).toBeDefined();
    });

    const filterInput = screen.getByPlaceholderText("Enter filter text...");
    fireEvent.change(filterInput, { target: { value: "existing-filter" } });
    fireEvent.click(screen.getByText("Add"));

    // Should only have the initial get_settings call
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("should remove filter when clicking remove button", async () => {
    mockInvoke.mockResolvedValue({
      ...defaultSettings,
      titleExcludeFilters: ["filter-to-remove"],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("filter-to-remove")).toBeDefined();
    });

    const removeButton = screen.getByTitle("Remove filter");
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          titleExcludeFilters: [],
        }),
      });
    });
  });

  it("should update mic state when selecting from dropdown", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
    });

    const selects = screen.getAllByRole("combobox");
    const micSelect = selects[0];
    fireEvent.change(micSelect, { target: { value: "unmuted" } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ defaultMicState: "unmuted" }),
      });
    });
  });

  it("should update camera state when selecting from dropdown", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
    });

    const selects = screen.getAllByRole("combobox");
    const cameraSelect = selects[1];
    fireEvent.change(cameraSelect, { target: { value: "unmuted" } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ defaultCameraState: "unmuted" }),
      });
    });
  });

  it("should update startAtLogin setting", async () => {
    (isAutostartEnabled as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Start at login");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({ startAtLogin: true }),
        }),
      });
    });
  });

  it("should use defaults when tauri settings are missing", async () => {
    mockInvoke.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      tauri: undefined,
    });

    render(<App />);

    await waitFor(() => {
      const startAtLogin = screen.getByLabelText(
        "Start at login"
      ) as HTMLInputElement;

      expect(startAtLogin.checked).toBe(false);
    });
  });

  it("should update showCountdownOverlay setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Countdown overlay");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ showCountdownOverlay: false }),
      });
    });
  });

  it("should update showNotifications setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Notifications");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ showNotifications: false }),
      });
    });
  });

  it("should handle settings loading error gracefully", async () => {
    mockInvoke.mockRejectedValue(new Error("Load error"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("MeetCat Settings")).toBeDefined();
    });
  });

  it("should handle save settings error gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_settings") {
        return Promise.resolve(defaultSettings);
      }
      if (cmd === "save_settings") {
        return Promise.reject(new Error("Save error"));
      }
      return Promise.resolve(defaultSettings);
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to save settings:",
        expect.any(Error)
      );
    });

    errorSpy.mockRestore();
  });

  it("should listen for settings_changed event", async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith(
        "settings_changed",
        expect.any(Function)
      );
    });
  });

  it("should update settings when settings_changed event fires", async () => {
    let settingsChangedHandler: (event: { payload: typeof defaultSettings }) => void;
    mockListen.mockImplementation((event, handler) => {
      if (event === "settings_changed") {
        settingsChangedHandler = handler;
      }
      return Promise.resolve(() => {});
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("MeetCat Settings")).toBeDefined();
    });

    // Simulate settings change event
    const newSettings = {
      ...defaultSettings,
      joinBeforeMinutes: 10,
    };
    settingsChangedHandler!({ payload: newSettings });

    await waitFor(() => {
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs[0]).toHaveValue(10);
    });
  });

  it("should show saving indicator when saving", async () => {
    // Make save hang to see the indicator
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_settings") {
        return Promise.resolve(defaultSettings);
      }
      if (cmd === "save_settings") {
        return new Promise(() => {}); // Never resolves
      }
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeDefined();
    });
  });

  it("should update tray display mode and reset title toggle from icon-only", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...defaultSettings,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        trayDisplayMode: "iconOnly",
        trayShowMeetingTitle: true,
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
    });

    const select = screen.getByLabelText("Tray display") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "iconWithTime" } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({
            trayDisplayMode: "iconWithTime",
            trayShowMeetingTitle: false,
          }),
        }),
      });
    });
  });

  it("should update tray meeting title toggle when enabled", async () => {
    mockInvoke.mockResolvedValueOnce({
      ...defaultSettings,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        trayDisplayMode: "iconWithTime",
        trayShowMeetingTitle: false,
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Show next meeting title") as HTMLInputElement;
    expect(checkbox.disabled).toBe(false);
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({
            trayShowMeetingTitle: true,
          }),
        }),
      });
    });
  });

  it("should update quitToHide setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Command-Q hides app");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({ quitToHide: false }),
        }),
      });
    });
  });

  it("should enable autostart when startAtLogin is toggled on", async () => {
    (isAutostartEnabled as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText(
      "Start at login"
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(enableAutostart).toHaveBeenCalled();
      expect(isAutostartEnabled).toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({ startAtLogin: true }),
        }),
      });
    });
  });

  it("should disable autostart when startAtLogin is toggled off", async () => {
    (isAutostartEnabled as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    mockInvoke.mockResolvedValueOnce({
      ...defaultSettings,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        startAtLogin: true,
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText(
      "Start at login"
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(disableAutostart).toHaveBeenCalled();
      expect(isAutostartEnabled).toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({ startAtLogin: false }),
        }),
      });
    });
  });

  it("should sync startAtLogin on load when system entry is missing", async () => {
    (isAutostartEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    mockInvoke.mockResolvedValueOnce({
      ...defaultSettings,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        startAtLogin: true,
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({ startAtLogin: false }),
        }),
      });
    });
  });
});
