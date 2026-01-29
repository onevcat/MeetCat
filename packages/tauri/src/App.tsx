import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import type { Settings, MediaState } from "@meetcat/settings";
import { DEFAULT_SETTINGS, DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";
import {
  applyTrayDisplayModeChange,
  canShowTrayTitle,
  getTrayDisplayMode,
  getTrayShowMeetingTitle,
  type TrayDisplayMode,
} from "./tray-settings";

/**
 * Settings window for MeetCat Tauri app
 */
export function App() {
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    tauri: DEFAULT_TAURI_SETTINGS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterInput, setFilterInput] = useState("");

  /**
   * Reusable number input with validation on blur.
   */
  const NumberInput = ({
    value,
    defaultValue,
    min,
    max,
    prefix,
    suffix,
    onChange,
  }: {
    value: number;
    defaultValue: number;
    min: number;
    max: number;
    prefix?: string;
    suffix: string;
    onChange: (value: number) => void;
  }) => {
    const [localValue, setLocalValue] = useState(value.toString());

    useEffect(() => {
      setLocalValue(value.toString());
    }, [value]);

    const handleBlur = () => {
      const parsed = parseInt(localValue, 10);
      if (isNaN(parsed) || parsed < min || parsed > max) {
        setLocalValue(defaultValue.toString());
        onChange(defaultValue);
        return;
      }
      onChange(parsed);
    };

    return (
      <div className="input-with-suffix">
        {prefix && <span className="input-prefix">{prefix}</span>}
        <input
          type="number"
          className="form-input"
          min={min}
          max={max}
          placeholder={defaultValue.toString()}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
        <span className="input-suffix">{suffix}</span>
      </div>
    );
  };

  // Load settings
  useEffect(() => {
    async function load() {
      try {
        const loadedSettings = await invoke<Settings>("get_settings");
        let resolvedSettings = loadedSettings;
        try {
          const systemEnabled = await isAutostartEnabled();
          const currentEnabled =
            loadedSettings.tauri?.startAtLogin ??
            DEFAULT_TAURI_SETTINGS.startAtLogin;
          if (systemEnabled != currentEnabled) {
            resolvedSettings = {
              ...loadedSettings,
              tauri: {
                ...DEFAULT_TAURI_SETTINGS,
                ...loadedSettings.tauri,
                startAtLogin: systemEnabled,
              },
            };
            await invoke("save_settings", { settings: resolvedSettings });
          }
        } catch (e) {
          console.error("Failed to sync autostart status:", e);
        }
        setSettings(resolvedSettings);
      } catch (e) {
        console.error("Failed to load settings:", e);
      } finally {
        setLoading(false);
      }
    }

    load();

    // Listen for settings changes from main process
    const unlisten = listen<Settings>("settings_changed", (event) => {
      setSettings(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Save settings
  const saveSettings = useCallback(async (newSettings: Settings) => {
    setSaving(true);
    try {
      await invoke("save_settings", { settings: newSettings });
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  // Update and save
  const updateSettings = (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const updateStartAtLogin = async (enabled: boolean) => {
    try {
      const isEnabled = await isAutostartEnabled();
      if (enabled) {
        if (!isEnabled) {
          await enableAutostart();
        }
      } else if (isEnabled) {
        await disableAutostart();
      }

      const updated = await isAutostartEnabled();
      updateSettings({
        tauri: {
          ...DEFAULT_TAURI_SETTINGS,
          ...settings.tauri,
          startAtLogin: updated,
        },
      });
    } catch (e) {
      console.error("Failed to update autostart:", e);
    }
  };

  const trayDisplayMode = getTrayDisplayMode(settings);
  const trayShowMeetingTitle = getTrayShowMeetingTitle(settings);
  const allowTrayTitle = canShowTrayTitle(trayDisplayMode);

  // Add filter
  const addFilter = () => {
    const filter = filterInput.trim();
    if (filter && !settings.titleExcludeFilters.includes(filter)) {
      updateSettings({
        titleExcludeFilters: [...settings.titleExcludeFilters, filter],
      });
      setFilterInput("");
    }
  };

  // Remove filter
  const removeFilter = (filter: string) => {
    updateSettings({
      titleExcludeFilters: settings.titleExcludeFilters.filter(
        (f) => f !== filter
      ),
    });
  };

  if (loading) {
    return (
      <div className="settings-window">
        <div className="loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings-window">
      <header className="settings-header">
        <img className="settings-icon" src="/icons/icon128.png" alt="MeetCat" />
        <h1>MeetCat Settings</h1>
      </header>

      <main className="settings-content">
        {/* General Section */}
        <section className="settings-section">
          <h2>General</h2>

          <div className="form-group">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="startAtLogin"
                className="form-checkbox"
                checked={settings.tauri?.startAtLogin ?? false}
                onChange={(e) => updateStartAtLogin(e.target.checked)}
              />
              <label htmlFor="startAtLogin" className="form-checkbox-label">
                Start at login
              </label>
            </div>
            <p className="form-hint">Launch MeetCat when you sign in</p>
          </div>

          <div className="form-group">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="quitToHide"
                className="form-checkbox"
                checked={settings.tauri?.quitToHide ?? true}
                onChange={(e) =>
                  updateSettings({
                    tauri: {
                      ...DEFAULT_TAURI_SETTINGS,
                      ...settings.tauri,
                      quitToHide: e.target.checked,
                    },
                  })
                }
              />
              <label htmlFor="quitToHide" className="form-checkbox-label">
                Command-Q hides app
              </label>
            </div>
            <p className="form-hint">Turn off to quit instead</p>
          </div>

          <div className="form-group">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="autoClickJoin"
                className="form-checkbox"
                checked={settings.autoClickJoin}
                onChange={(e) =>
                  updateSettings({ autoClickJoin: e.target.checked })
                }
              />
              <label htmlFor="autoClickJoin" className="form-checkbox-label">
                Auto-click join
              </label>
            </div>
            <p className="form-hint">Off: only open the meeting page</p>
          </div>

          <div className="form-group">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="showNotifications"
                className="form-checkbox"
                checked={settings.showNotifications}
                onChange={(e) =>
                  updateSettings({ showNotifications: e.target.checked })
                }
              />
              <label
                htmlFor="showNotifications"
                className="form-checkbox-label"
              >
                Notifications
              </label>
            </div>
            <p className="form-hint">Desktop alerts for auto-join</p>
          </div>

          <div className="form-group">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="showCountdownOverlay"
                className="form-checkbox"
                checked={settings.showCountdownOverlay}
                onChange={(e) =>
                  updateSettings({ showCountdownOverlay: e.target.checked })
                }
              />
              <label
                htmlFor="showCountdownOverlay"
                className="form-checkbox-label"
              >
                Countdown overlay
              </label>
            </div>
            <p className="form-hint">Show overlay on Meet pages</p>
          </div>
        </section>

        {/* Timing Section */}
        <section className="settings-section">
          <h2>Timing</h2>

          <div className="form-group">
            <label className="form-label">Open Meeting Preparing Page</label>
            <NumberInput
              value={settings.joinBeforeMinutes}
              defaultValue={DEFAULT_SETTINGS.joinBeforeMinutes}
              min={0}
              max={30}
              prefix="before meeting starts"
              suffix="minutes"
              onChange={(value) => updateSettings({ joinBeforeMinutes: value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Auto-join countdown</label>
            <NumberInput
              value={settings.joinCountdownSeconds}
              defaultValue={DEFAULT_SETTINGS.joinCountdownSeconds}
              min={0}
              max={60}
              prefix="before auto-join"
              suffix="seconds"
              onChange={(value) =>
                updateSettings({ joinCountdownSeconds: value })
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label">Stop auto-join</label>
            <NumberInput
              value={settings.maxMinutesAfterStart}
              defaultValue={DEFAULT_SETTINGS.maxMinutesAfterStart}
              min={0}
              max={30}
              prefix="after meeting starts"
              suffix="minutes"
              onChange={(value) =>
                updateSettings({ maxMinutesAfterStart: value })
              }
            />
          </div>
        </section>

        {/* Advanced Section */}
        <section className="settings-section">
          <h2>Advanced</h2>

          <div className="form-group">
            <label className="form-label">Exclude keywords</label>
            <div className="filter-input-row">
              <input
                type="text"
                className="form-input"
                placeholder="Enter filter text..."
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFilter()}
              />
              <button className="btn btn-secondary" onClick={addFilter}>
                Add
              </button>
            </div>
            <p className="form-hint">Skip meetings with matching titles</p>
          </div>

          {settings.titleExcludeFilters.length > 0 && (
            <div className="filter-list">
              {settings.titleExcludeFilters.map((filter) => (
                <div key={filter} className="filter-item">
                  <span className="filter-text">{filter}</span>
                  <button
                    className="filter-remove"
                    onClick={() => removeFilter(filter)}
                    title="Remove filter"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Default microphone</label>
            <select
              className="form-select"
              value={settings.defaultMicState}
              onChange={(e) =>
                updateSettings({
                  defaultMicState: e.target.value as MediaState,
                })
              }
            >
              <option value="muted">Muted</option>
              <option value="unmuted">Unmuted</option>
            </select>
            <p className="form-hint">Applied when joining</p>
          </div>

          <div className="form-group">
            <label className="form-label">Default camera</label>
            <select
              className="form-select"
              value={settings.defaultCameraState}
              onChange={(e) =>
                updateSettings({
                  defaultCameraState: e.target.value as MediaState,
                })
              }
            >
              <option value="muted">Off</option>
              <option value="unmuted">On</option>
            </select>
            <p className="form-hint">Applied when joining</p>
          </div>

          <div className="form-group">
            <label htmlFor="trayDisplayMode" className="form-label">
              Tray display
            </label>
            <select
              id="trayDisplayMode"
              className="form-select"
              value={trayDisplayMode}
              onChange={(e) =>
                updateSettings(
                  applyTrayDisplayModeChange(
                    settings,
                    e.target.value as TrayDisplayMode
                  )
                )
              }
            >
              <option value="iconOnly">Icon only</option>
              <option value="iconWithTime">Icon + next meeting time</option>
              <option value="iconWithCountdown">
                Icon + countdown to next meeting
              </option>
            </select>
            <p className="form-hint">
              Text shown next to tray icon. Blank when there is no next meeting.
            </p>
          </div>

          <div className="form-group">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="trayShowMeetingTitle"
                className="form-checkbox"
                checked={allowTrayTitle ? trayShowMeetingTitle : false}
                disabled={!allowTrayTitle}
                onChange={(e) =>
                  updateSettings({
                    tauri: {
                      ...DEFAULT_TAURI_SETTINGS,
                      ...settings.tauri,
                      trayShowMeetingTitle: e.target.checked,
                    },
                  })
                }
              />
              <label
                htmlFor="trayShowMeetingTitle"
                className={`form-checkbox-label${allowTrayTitle ? "" : " is-disabled"}`}
              >
                Show next meeting title
              </label>
            </div>
            <p className="form-hint">Only available when tray text is enabled</p>
          </div>
        </section>
      </main>

      {saving && <div className="saving-indicator">Saving...</div>}
    </div>
  );
}
