import { useCallback, useEffect, useMemo, useState } from "react";
import type { Settings, MediaState } from "@meetcat/settings";
import { DEFAULT_SETTINGS, DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";
import {
  applyTrayDisplayModeChange,
  canShowTrayTitle,
  getTrayDisplayMode,
  getTrayShowMeetingTitle,
  type TrayDisplayMode,
} from "./tray-settings.js";

export type SettingsCapabilities = {
  startAtLogin?: boolean;
  quitToHide?: boolean;
  tray?: boolean;
  showSavingIndicator?: boolean;
};

export type SettingsAdapter = {
  capabilities: SettingsCapabilities;
  getDefaultSettings: () => Settings;
  loadSettings: () => Promise<Settings | null>;
  saveSettings: (settings: Settings) => Promise<void>;
  resolveSettings: (loaded: Settings | null) => Settings;
  subscribe?: (handler: (settings: Settings) => void) => () => void;
  updateStartAtLogin?: (enabled: boolean, settings: Settings) => Promise<Settings>;
  getVersion?: () => Promise<string | null> | string | null;
};

export type SettingsContainerProps = {
  adapter: SettingsAdapter;
  headerTitle?: string;
  headerIconSrc: string;
  appName?: string;
};

export function SettingsContainer({
  adapter,
  headerTitle = "MeetCat Settings",
  headerIconSrc,
  appName = "MeetCat",
}: SettingsContainerProps) {
  const [settings, setSettings] = useState<Settings>(() => adapter.getDefaultSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  const footerText = useMemo(() => {
    if (version) return `${appName} v${version}`;
    return appName;
  }, [appName, version]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const loaded = await adapter.loadSettings();
        const resolved = adapter.resolveSettings(loaded);
        if (mounted) {
          setSettings(resolved);
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
        if (mounted) {
          setSettings(adapter.getDefaultSettings());
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    const unsubscribe = adapter.subscribe?.((nextSettings) => {
      setSettings(adapter.resolveSettings(nextSettings));
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [adapter]);

  useEffect(() => {
    if (!adapter.getVersion) return;
    const result = adapter.getVersion();
    if (result instanceof Promise) {
      result
        .then((value) => setVersion(value ?? null))
        .catch(() => {
          setVersion(null);
        });
    } else {
      setVersion(result ?? null);
    }
  }, [adapter]);

  const saveSettings = useCallback(async (nextSettings: Settings) => {
    setSaving(true);
    try {
      await adapter.saveSettings(nextSettings);
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  }, [adapter]);

  const handleSettingsChange = useCallback((nextSettings: Settings) => {
    setSettings(nextSettings);
    void saveSettings(nextSettings);
  }, [saveSettings]);

  const handleStartAtLoginChange = useCallback(async (enabled: boolean) => {
    if (!adapter.updateStartAtLogin) {
      handleSettingsChange({
        ...settings,
        tauri: {
          ...DEFAULT_TAURI_SETTINGS,
          ...settings.tauri,
          startAtLogin: enabled,
        },
      });
      return;
    }

    try {
      const nextSettings = await adapter.updateStartAtLogin(enabled, settings);
      handleSettingsChange(nextSettings);
    } catch (e) {
      console.error("Failed to update autostart:", e);
    }
  }, [adapter, handleSettingsChange, settings]);

  return (
    <SettingsView
      settings={settings}
      loading={loading}
      saving={saving}
      showSavingIndicator={adapter.capabilities.showSavingIndicator ?? false}
      headerTitle={headerTitle}
      headerIconSrc={headerIconSrc}
      footerText={footerText}
      capabilities={adapter.capabilities}
      onSettingsChange={handleSettingsChange}
      onStartAtLoginChange={
        adapter.capabilities.startAtLogin ? handleStartAtLoginChange : undefined
      }
    />
  );
}

export type SettingsViewProps = {
  settings: Settings;
  loading: boolean;
  saving: boolean;
  showSavingIndicator: boolean;
  headerTitle: string;
  headerIconSrc: string;
  footerText?: string;
  capabilities: SettingsCapabilities;
  onSettingsChange: (settings: Settings) => void;
  onStartAtLoginChange?: (enabled: boolean) => void;
};

function NumberInput({
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
}) {
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
}

export function SettingsView({
  settings,
  loading,
  saving,
  showSavingIndicator,
  headerTitle,
  headerIconSrc,
  footerText,
  capabilities,
  onSettingsChange,
  onStartAtLoginChange,
}: SettingsViewProps) {
  const [filterInput, setFilterInput] = useState("");

  const updateSettings = (updates: Partial<Settings>) => {
    onSettingsChange({ ...settings, ...updates });
  };

  const updateTauriSettings = (updates: Partial<Settings["tauri"]>) => {
    onSettingsChange({
      ...settings,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        ...settings.tauri,
        ...updates,
      },
    });
  };

  const trayDisplayMode = getTrayDisplayMode(settings);
  const trayShowMeetingTitle = getTrayShowMeetingTitle(settings);
  const allowTrayTitle = canShowTrayTitle(trayDisplayMode);

  const titleExcludeFilters = settings.titleExcludeFilters ?? [];

  const addFilter = () => {
    const filter = filterInput.trim();
    if (filter && !titleExcludeFilters.includes(filter)) {
      updateSettings({
        titleExcludeFilters: [...titleExcludeFilters, filter],
      });
      setFilterInput("");
    }
  };

  const removeFilter = (filter: string) => {
    updateSettings({
      titleExcludeFilters: titleExcludeFilters.filter((f) => f !== filter),
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
        <img className="settings-icon" src={headerIconSrc} alt="MeetCat" />
        <h1>{headerTitle}</h1>
      </header>

      <main className="settings-content">
        <section className="settings-section">
          <h2>General</h2>

          {capabilities.startAtLogin && (
            <div className="form-group">
              <div className="form-checkbox-group">
                <input
                  type="checkbox"
                  id="startAtLogin"
                  className="form-checkbox"
                  checked={settings.tauri?.startAtLogin ?? false}
                  onChange={(e) => {
                    if (onStartAtLoginChange) {
                      onStartAtLoginChange(e.target.checked);
                    } else {
                      updateTauriSettings({ startAtLogin: e.target.checked });
                    }
                  }}
                />
                <label htmlFor="startAtLogin" className="form-checkbox-label">
                  Start at login
                </label>
              </div>
              <p className="form-hint">Launch MeetCat when you sign in</p>
            </div>
          )}

          {capabilities.quitToHide && (
            <div className="form-group">
              <div className="form-checkbox-group">
                <input
                  type="checkbox"
                  id="quitToHide"
                  className="form-checkbox"
                  checked={settings.tauri?.quitToHide ?? true}
                  onChange={(e) =>
                    updateTauriSettings({ quitToHide: e.target.checked })
                  }
                />
                <label htmlFor="quitToHide" className="form-checkbox-label">
                  Command-Q hides app
                </label>
              </div>
              <p className="form-hint">Turn off to quit instead</p>
            </div>
          )}

          <div className="form-group">
            <div className="form-checkbox-group">
              <input
                type="checkbox"
                id="autoClickJoin"
                className="form-checkbox"
                checked={settings.autoClickJoin}
                onChange={(e) => updateSettings({ autoClickJoin: e.target.checked })}
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
                id="showCountdownOverlay"
                className="form-checkbox"
                checked={settings.showCountdownOverlay}
                onChange={(e) =>
                  updateSettings({ showCountdownOverlay: e.target.checked })
                }
              />
              <label htmlFor="showCountdownOverlay" className="form-checkbox-label">
                Homepage overlay
              </label>
            </div>
            <p className="form-hint">Show next meeting overlay on Meet homepage</p>
          </div>
        </section>

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
              onChange={(value) => updateSettings({ joinCountdownSeconds: value })}
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
              onChange={(value) => updateSettings({ maxMinutesAfterStart: value })}
            />
          </div>
        </section>

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

          {titleExcludeFilters.length > 0 && (
            <div className="filter-list">
              {titleExcludeFilters.map((filter) => (
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

          {capabilities.tray && (
            <>
              <div className="form-group">
                <label htmlFor="trayDisplayMode" className="form-label">
                  Tray display
                </label>
                <select
                  id="trayDisplayMode"
                  className="form-select"
                  value={trayDisplayMode}
                  onChange={(e) =>
                    onSettingsChange(
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
                      updateTauriSettings({
                        trayShowMeetingTitle: e.target.checked,
                      })
                    }
                  />
                  <label
                    htmlFor="trayShowMeetingTitle"
                    className={`form-checkbox-label${
                      allowTrayTitle ? "" : " is-disabled"
                    }`}
                  >
                    Show next meeting title
                  </label>
                </div>
                <p className="form-hint">
                  Only available when tray text is enabled
                </p>
              </div>
            </>
          )}
        </section>
      </main>

      {footerText && <footer className="settings-footer">{footerText}</footer>}
      {showSavingIndicator && saving && (
        <div className="saving-indicator">Saving...</div>
      )}
    </div>
  );
}

export {
  applyTrayDisplayModeChange,
  canShowTrayTitle,
  getTrayDisplayMode,
  getTrayShowMeetingTitle,
  type TrayDisplayMode,
};
