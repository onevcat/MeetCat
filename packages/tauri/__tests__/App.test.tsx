import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
      expect(screen.getByText("Join before meeting starts")).toBeDefined();
      expect(screen.getByText("Countdown before auto-join")).toBeDefined();
    });
  });

  it("should render join behavior section", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Join Behavior")).toBeDefined();
      expect(screen.getByText("Automatically click join button")).toBeDefined();
      expect(screen.getByText("Show countdown overlay")).toBeDefined();
      expect(screen.getByText("Show notifications")).toBeDefined();
    });
  });

  it("should render media defaults section", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Media Defaults")).toBeDefined();
      expect(screen.getByText("Microphone")).toBeDefined();
      expect(screen.getByText("Camera")).toBeDefined();
    });
  });

  it("should render exclude filters section", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Exclude Filters")).toBeDefined();
      expect(screen.getByPlaceholderText("Enter filter text...")).toBeDefined();
    });
  });

  it("should render app behavior section", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("App Behavior")).toBeDefined();
      expect(screen.getByText("Keep running when window is closed")).toBeDefined();
      expect(screen.getByText("Start at login")).toBeDefined();
    });
  });

  it("should call invoke with save_settings when changing setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Automatically click join button");
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

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinBeforeMinutes: 5 }),
      });
    });
  });

  it("should default joinBeforeMinutes to 0 when input is invalid", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const joinBeforeInput = inputs[0];
    fireEvent.change(joinBeforeInput, { target: { value: "invalid" } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinBeforeMinutes: 0 }),
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

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinCountdownSeconds: 15 }),
      });
    });
  });

  it("should default joinCountdownSeconds to 0 when input is invalid", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const countdownInput = inputs[1];
    fireEvent.change(countdownInput, { target: { value: "invalid" } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinCountdownSeconds: 0 }),
      });
    });
  });

  it("should clamp joinBeforeMinutes to valid range", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const inputs = screen.getAllByRole("spinbutton");
    const joinBeforeInput = inputs[0];
    fireEvent.change(joinBeforeInput, { target: { value: "100" } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({ joinBeforeMinutes: 30 }),
      });
    });
  });

  it("should add filter when clicking Add button", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Exclude Filters")).toBeDefined();
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
      expect(screen.getByText("Exclude Filters")).toBeDefined();
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
      expect(screen.getByText("Exclude Filters")).toBeDefined();
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
      expect(screen.getByText("Media Defaults")).toBeDefined();
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
      expect(screen.getByText("Media Defaults")).toBeDefined();
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

  it("should update runInBackground setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("App Behavior")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Keep running when window is closed");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_settings", {
        settings: expect.objectContaining({
          tauri: expect.objectContaining({ runInBackground: false }),
        }),
      });
    });
  });

  it("should update startAtLogin setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("App Behavior")).toBeDefined();
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
      const runInBackground = screen.getByLabelText(
        "Keep running when window is closed"
      ) as HTMLInputElement;
      const startAtLogin = screen.getByLabelText(
        "Start at login"
      ) as HTMLInputElement;

      expect(runInBackground.checked).toBe(true);
      expect(startAtLogin.checked).toBe(false);
    });
  });

  it("should update showCountdownOverlay setting", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Join Behavior")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Show countdown overlay");
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
      expect(screen.getByText("Join Behavior")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Show notifications");
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
      expect(screen.getByText("Join Behavior")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Automatically click join button");
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

    const checkbox = screen.getByLabelText("Automatically click join button");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeDefined();
    });
  });
});
