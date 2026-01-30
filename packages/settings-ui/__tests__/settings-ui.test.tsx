import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { Settings } from "@meetcat/settings";
import { DEFAULT_SETTINGS, DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";
import { SettingsContainer, SettingsView } from "../src/index";
import { applyTrayDisplayModeChange } from "../src/tray-settings";

const createSettings = (overrides: Partial<Settings> = {}): Settings => {
  return {
    ...DEFAULT_SETTINGS,
    tauri: {
      ...DEFAULT_TAURI_SETTINGS,
    },
    ...overrides,
  };
};

describe("SettingsView", () => {
  it("renders loading state", () => {
    const settings = createSettings();
    render(
      <SettingsView
        settings={settings}
        loading
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("Loading settings...")).toBeDefined();
  });

  it("renders header and footer", () => {
    const settings = createSettings();
    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat v1.2.3"
        capabilities={{}}
        onSettingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("MeetCat Settings")).toBeDefined();
    expect(screen.getByText("MeetCat v1.2.3")).toBeDefined();
  });

  it("renders defaults when optional settings are missing", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      tauri: undefined,
      titleExcludeFilters: undefined,
    } as Settings;

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{ startAtLogin: true, quitToHide: true }}
        onSettingsChange={vi.fn()}
      />
    );

    const startAtLogin = screen.getByLabelText("Start at login") as HTMLInputElement;
    const quitToHide = screen.getByLabelText("Command-Q hides app") as HTMLInputElement;
    expect(startAtLogin.checked).toBe(false);
    expect(quitToHide.checked).toBe(true);
    expect(screen.queryByText("Remove filter")).toBeNull();
  });

  it("uses onStartAtLoginChange when provided", () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();
    const onStartAtLoginChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{ startAtLogin: true }}
        onSettingsChange={onSettingsChange}
        onStartAtLoginChange={onStartAtLoginChange}
      />
    );

    fireEvent.click(screen.getByLabelText("Start at login"));
    expect(onStartAtLoginChange).toHaveBeenCalledWith(true);
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it("updates start-at-login when handler is not provided", async () => {
    const settings = createSettings({
      tauri: { ...DEFAULT_TAURI_SETTINGS, startAtLogin: false },
    });
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{ startAtLogin: true }}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByLabelText("Start at login"));

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const nextSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(nextSettings.tauri?.startAtLogin).toBe(true);
  });

  it("updates quit-to-hide setting when enabled", async () => {
    const settings = createSettings({
      tauri: { ...DEFAULT_TAURI_SETTINGS, quitToHide: true },
    });
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{ quitToHide: true }}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByLabelText("Command-Q hides app"));

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const nextSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(nextSettings.tauri?.quitToHide).toBe(false);
  });

  it("updates homepage overlay setting", async () => {
    const settings = createSettings({ showCountdownOverlay: true });
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByLabelText("Homepage overlay"));

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const nextSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(nextSettings.showCountdownOverlay).toBe(false);
  });

  it("updates join countdown seconds", async () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    const input = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const nextSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(nextSettings.joinCountdownSeconds).toBe(12);
  });

  it("updates max minutes after start", async () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    const input = screen.getAllByRole("spinbutton")[2];
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const nextSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(nextSettings.maxMinutesAfterStart).toBe(8);
  });

  it("disables tray title toggle when tray mode is iconOnly", () => {
    const settings = createSettings({
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        trayDisplayMode: "iconOnly",
        trayShowMeetingTitle: true,
      },
    });

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{ tray: true }}
        onSettingsChange={vi.fn()}
      />
    );

    const checkbox = screen.getByLabelText("Show next meeting title") as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
  });

  it("updates tray display mode via applyTrayDisplayModeChange", () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{ tray: true }}
        onSettingsChange={onSettingsChange}
      />
    );

    const select = screen.getByLabelText("Tray display") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "iconWithTime" } });

    expect(onSettingsChange).toHaveBeenCalledWith(
      applyTrayDisplayModeChange(settings, "iconWithTime")
    );
  });

  it("updates tray title setting when tray text is enabled", async () => {
    const settings = createSettings({
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        trayDisplayMode: "iconWithTime",
        trayShowMeetingTitle: false,
      },
    });
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{ tray: true }}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByLabelText("Show next meeting title"));

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const nextSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(nextSettings.tauri?.trayShowMeetingTitle).toBe(true);
  });

  it("adds and removes filters", async () => {
    const settings = createSettings({ titleExcludeFilters: [] });
    const onSettingsChange = vi.fn();

    const { rerender } = render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Enter filter text..."), {
      target: { value: "Focus" },
    });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const addedSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(addedSettings.titleExcludeFilters).toEqual(["Focus"]);

    onSettingsChange.mockClear();

    rerender(
      <SettingsView
        settings={{ ...settings, titleExcludeFilters: ["Focus"] }}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByTitle("Remove filter"));

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const removedSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(removedSettings.titleExcludeFilters).toEqual([]);
  });

  it("adds filter on Enter key", async () => {
    const settings = createSettings({ titleExcludeFilters: [] });
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    const input = screen.getByPlaceholderText("Enter filter text...");
    fireEvent.change(input, { target: { value: "Daily" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const nextSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(nextSettings.titleExcludeFilters).toEqual(["Daily"]);
  });

  it("resets invalid number input to default", async () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    const input = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const updatedSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(updatedSettings.joinBeforeMinutes).toBe(DEFAULT_SETTINGS.joinBeforeMinutes);
  });

  it("updates default camera state", async () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    const selects = screen.getAllByRole("combobox");
    const cameraSelect = selects[1];
    fireEvent.change(cameraSelect, { target: { value: "unmuted" } });

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const updatedSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(updatedSettings.defaultCameraState).toBe("unmuted");
  });

  it("updates default microphone state", async () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    const selects = screen.getAllByRole("combobox");
    const micSelect = selects[0];
    fireEvent.change(micSelect, { target: { value: "unmuted" } });

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const updatedSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(updatedSettings.defaultMicState).toBe("unmuted");
  });

  it("shows saving indicator when enabled", () => {
    const settings = createSettings();

    render(
      <SettingsView
        settings={settings}
        loading={false}
        saving
        showSavingIndicator
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("Saving...")).toBeDefined();
  });
});

describe("SettingsContainer", () => {
  it("loads settings and renders version", async () => {
    const settings = createSettings();
    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
      getVersion: () => "1.2.3",
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("MeetCat v1.2.3")).toBeDefined();
    });
  });

  it("uses synchronous version when provided", async () => {
    const settings = createSettings();
    const getVersion = vi.fn().mockReturnValue("2.0.0");
    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
      getVersion,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("MeetCat v2.0.0")).toBeDefined();
    });

    expect(getVersion).toHaveBeenCalled();
  });

  it("uses app name when version is null", async () => {
    const settings = createSettings();
    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
      getVersion: () => null,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("MeetCat")).toBeDefined();
    });
  });

  it("falls back to app name when version promise rejects", async () => {
    const settings = createSettings();
    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
      getVersion: () => Promise.reject(new Error("version error")),
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("MeetCat")).toBeDefined();
    });
  });

  it("handles load settings error gracefully", async () => {
    const settings = createSettings({ autoClickJoin: false });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockRejectedValue(new Error("load error")),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    errorSpy.mockRestore();
  });

  it("saves settings when toggling auto-click join", async () => {
    const settings = createSettings({ autoClickJoin: true });
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings,
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalled();
    });

    const saved = saveSettings.mock.calls.at(-1)?.[0] as Settings;
    expect(saved.autoClickJoin).toBe(false);
  });

  it("logs save error when persisting settings fails", async () => {
    const settings = createSettings({ autoClickJoin: true });
    const saveSettings = vi.fn().mockRejectedValue(new Error("save error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings,
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to save settings:",
        expect.any(Error)
      );
    });

    errorSpy.mockRestore();
  });

  it("uses adapter.updateStartAtLogin when available", async () => {
    const settings = createSettings({
      tauri: { ...DEFAULT_TAURI_SETTINGS, startAtLogin: false },
    });
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const updateStartAtLogin = vi
      .fn()
      .mockResolvedValue({
        ...settings,
        tauri: { ...DEFAULT_TAURI_SETTINGS, startAtLogin: true },
      });

    const adapter = {
      capabilities: { startAtLogin: true },
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings,
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
      updateStartAtLogin,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Start at login")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Start at login");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      expect(updateStartAtLogin).toHaveBeenCalledWith(true, settings);
      expect(saveSettings).toHaveBeenCalled();
    });
  });

  it("falls back to direct update when updateStartAtLogin is missing", async () => {
    const settings = createSettings({
      tauri: { ...DEFAULT_TAURI_SETTINGS, startAtLogin: false },
    });
    const saveSettings = vi.fn().mockResolvedValue(undefined);

    const adapter = {
      capabilities: { startAtLogin: true },
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings,
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Start at login")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Start at login");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalled();
    });

    const saved = saveSettings.mock.calls.at(-1)?.[0] as Settings;
    expect(saved.tauri?.startAtLogin).toBe(true);
  });

  it("logs error when updateStartAtLogin fails", async () => {
    const settings = createSettings({
      tauri: { ...DEFAULT_TAURI_SETTINGS, startAtLogin: false },
    });
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const updateStartAtLogin = vi
      .fn()
      .mockRejectedValue(new Error("autostart error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const adapter = {
      capabilities: { startAtLogin: true },
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings,
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
      updateStartAtLogin,
    };

    render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Start at login")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Start at login");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to update autostart:",
        expect.any(Error)
      );
    });

    errorSpy.mockRestore();
  });

  it("responds to subscribe updates and cleans up", async () => {
    const settings = createSettings({ autoClickJoin: true });
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = vi.fn();
    let handler: ((next: Settings) => void) | null = null;

    const adapter = {
      capabilities: {},
      getDefaultSettings: () => settings,
      loadSettings: vi.fn().mockResolvedValue(settings),
      saveSettings,
      resolveSettings: (loaded: Settings | null) => loaded ?? settings,
      subscribe: (cb: (next: Settings) => void) => {
        handler = cb;
        return unsubscribe;
      },
    };

    const { unmount } = render(
      <SettingsContainer
        adapter={adapter}
        headerIconSrc="/icon.png"
        headerTitle="MeetCat Settings"
        appName="MeetCat"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    act(() => {
      handler?.({ ...settings, autoClickJoin: false });
    });

    const checkbox = screen.getByLabelText("Auto-click join") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("NumberInput", () => {
  it("shows prefix and updates value on Enter key", async () => {
    const settings = createSettings();
    const onSettingsChange = vi.fn();

    const { unmount } = render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    expect(screen.getByText("before meeting starts")).toBeDefined();

    const input = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalled();
    });

    const updatedSettings = onSettingsChange.mock.calls.at(-1)?.[0] as Settings;
    expect(updatedSettings.joinBeforeMinutes).toBe(2);

    unmount();
  });

  it("syncs local value when settings change", async () => {
    const settings = createSettings({ joinBeforeMinutes: 1 });
    const onSettingsChange = vi.fn();

    const { rerender } = render(
      <SettingsView
        settings={settings}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    const input = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    expect(input.value).toBe("1");

    rerender(
      <SettingsView
        settings={{ ...settings, joinBeforeMinutes: 5 }}
        loading={false}
        saving={false}
        showSavingIndicator={false}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icon.png"
        footerText="MeetCat"
        capabilities={{}}
        onSettingsChange={onSettingsChange}
      />
    );

    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("5");
  });
});
