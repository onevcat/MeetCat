import { useCallback, useEffect, useMemo, useState } from "react";
import type { Settings, MediaState } from "@meetcat/settings";
import { DEFAULT_SETTINGS, DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";
import { useTranslation } from "@meetcat/i18n/react";
import { initI18n, changeLanguage, type LanguageSetting } from "@meetcat/i18n";
import {
  applyTrayDisplayModeChange,
  canShowTrayTitle,
  getTrayDisplayMode,
  getTrayShowMeetingTitle,
  type TrayDisplayMode,
} from "./tray-settings.js";

export type SettingsCapabilities = {
  startAtLogin?: boolean;
  tray?: boolean;
  showSavingIndicator?: boolean;
  developer?: boolean;
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
  const [i18nReady, setI18nReady] = useState(false);

  const footerText = useMemo(() => {
    if (version) return `${appName} ${version}`;
    return appName;
  }, [appName, version]);

  // Initialize i18n with saved language preference
  useEffect(() => {
    let mounted = true;

    async function loadAndInit() {
      setLoading(true);
      try {
        const loaded = await adapter.loadSettings();
        const resolved = adapter.resolveSettings(loaded);
        if (mounted) {
          setSettings(resolved);
          await initI18n(resolved.language as LanguageSetting);
          setI18nReady(true);
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
        if (mounted) {
          setSettings(adapter.getDefaultSettings());
          await initI18n("auto");
          setI18nReady(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadAndInit();

    const unsubscribe = adapter.subscribe?.((nextSettings) => {
      const resolved = adapter.resolveSettings(nextSettings);
      setSettings(resolved);
      // Sync language if changed externally
      void changeLanguage(resolved.language as LanguageSetting);
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

  const handleLanguageChange = useCallback(async (lang: LanguageSetting) => {
    await changeLanguage(lang);
    const nextSettings = { ...settings, language: lang };
    setSettings(nextSettings);
    void saveSettings(nextSettings);
  }, [settings, saveSettings]);

  if (!i18nReady) {
    return null;
  }

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
      onLanguageChange={handleLanguageChange}
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
  onLanguageChange?: (lang: LanguageSetting) => void;
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
  onLanguageChange,
}: SettingsViewProps) {
  const { t } = useTranslation();
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
  const logCollectionEnabled =
    settings.tauri?.logCollectionEnabled ?? DEFAULT_TAURI_SETTINGS.logCollectionEnabled;
  const logLevel = settings.tauri?.logLevel ?? DEFAULT_TAURI_SETTINGS.logLevel;

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
        <div className="loading">{t("settings.loading")}</div>
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
          <h2>{t("settings.general")}</h2>

          <div className="form-group">
            <label htmlFor="language" className="form-label">
              {t("settings.language")}
            </label>
            <select
              id="language"
              className="form-select"
              value={settings.language ?? "auto"}
              onChange={(e) => {
                onLanguageChange?.(e.target.value as LanguageSetting);
              }}
            >
              <option value="auto">{t("settings.languageAuto")}</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
            </select>
          </div>

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
                  {t("settings.startAtLogin")}
                </label>
              </div>
              <p className="form-hint">{t("settings.startAtLoginHint")}</p>
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
                {t("settings.autoClickJoin")}
              </label>
            </div>
            <p className="form-hint">{t("settings.autoClickJoinHint")}</p>
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
                {t("settings.homepageOverlay")}
              </label>
            </div>
            <p className="form-hint">{t("settings.homepageOverlayHint")}</p>
          </div>
        </section>

        <section className="settings-section">
          <h2>{t("settings.timing")}</h2>

          <div className="form-group">
            <label className="form-label">{t("settings.openMeetingPreparingPage")}</label>
            <NumberInput
              value={settings.joinBeforeMinutes}
              defaultValue={DEFAULT_SETTINGS.joinBeforeMinutes}
              min={0}
              max={30}
              prefix={t("settings.beforeMeetingStarts")}
              suffix={t("settings.minutes")}
              onChange={(value) => updateSettings({ joinBeforeMinutes: value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t("settings.autoJoinCountdown")}</label>
            <NumberInput
              value={settings.joinCountdownSeconds}
              defaultValue={DEFAULT_SETTINGS.joinCountdownSeconds}
              min={0}
              max={60}
              prefix={t("settings.beforeAutoJoin")}
              suffix={t("settings.seconds")}
              onChange={(value) => updateSettings({ joinCountdownSeconds: value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t("settings.stopAutoJoin")}</label>
            <NumberInput
              value={settings.maxMinutesAfterStart}
              defaultValue={DEFAULT_SETTINGS.maxMinutesAfterStart}
              min={0}
              max={30}
              prefix={t("settings.afterMeetingStarts")}
              suffix={t("settings.minutes")}
              onChange={(value) => updateSettings({ maxMinutesAfterStart: value })}
            />
          </div>
        </section>

        <section className="settings-section">
          <h2>{t("settings.advanced")}</h2>

          <div className="form-group">
            <label className="form-label">{t("settings.excludeKeywords")}</label>
            <div className="filter-input-row">
              <input
                type="text"
                className="form-input"
                placeholder={t("settings.enterFilterText")}
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFilter()}
              />
              <button className="btn btn-secondary" onClick={addFilter}>
                {t("settings.add")}
              </button>
            </div>
            <p className="form-hint">{t("settings.skipMatchingTitles")}</p>
            {titleExcludeFilters.length > 0 && (
              <div className="filter-list">
                {titleExcludeFilters.map((filter) => (
                  <div key={filter} className="filter-item">
                    <span className="filter-text">{filter}</span>
                    <button
                      className="filter-remove"
                      onClick={() => removeFilter(filter)}
                      title={t("settings.removeFilter")}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">{t("settings.defaultMicrophone")}</label>
            <select
              className="form-select"
              value={settings.defaultMicState}
              onChange={(e) =>
                updateSettings({
                  defaultMicState: e.target.value as MediaState,
                })
              }
            >
              <option value="muted">{t("settings.muted")}</option>
              <option value="unmuted">{t("settings.unmuted")}</option>
            </select>
            <p className="form-hint">{t("settings.appliedWhenJoining")}</p>
          </div>

          <div className="form-group">
            <label className="form-label">{t("settings.defaultCamera")}</label>
            <select
              className="form-select"
              value={settings.defaultCameraState}
              onChange={(e) =>
                updateSettings({
                  defaultCameraState: e.target.value as MediaState,
                })
              }
            >
              <option value="muted">{t("settings.cameraOff")}</option>
              <option value="unmuted">{t("settings.cameraOn")}</option>
            </select>
            <p className="form-hint">{t("settings.appliedWhenJoining")}</p>
          </div>

          {capabilities.tray && (
            <>
              <div className="form-group">
                <label htmlFor="trayDisplayMode" className="form-label">
                  {t("settings.trayDisplay")}
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
                  <option value="iconOnly">{t("settings.iconOnly")}</option>
                  <option value="iconWithTime">{t("settings.iconWithTime")}</option>
                  <option value="iconWithCountdown">
                    {t("settings.iconWithCountdown")}
                  </option>
                </select>
                <p className="form-hint">
                  {t("settings.trayDisplayHint")}
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
                    {t("settings.showNextMeetingTitle")}
                  </label>
                </div>
                <p className="form-hint">
                  {t("settings.showNextMeetingTitleHint")}
                </p>
              </div>
            </>
          )}
        </section>

        {capabilities.developer && (
          <section className="settings-section">
            <h2>{t("settings.developer")}</h2>

            <div className="form-group">
              <div className="form-checkbox-group">
                <input
                  type="checkbox"
                  id="logCollectionEnabled"
                  className="form-checkbox"
                  checked={logCollectionEnabled}
                  onChange={(e) =>
                    updateTauriSettings({ logCollectionEnabled: e.target.checked })
                  }
                />
                <label htmlFor="logCollectionEnabled" className="form-checkbox-label">
                  {t("settings.collectLogs")}
                </label>
              </div>
              <p className="form-hint">{t("settings.collectLogsHint")}</p>
            </div>

            <div className="form-group">
              <label className="form-label">{t("settings.logLevel")}</label>
              <select
                className="form-select"
                value={logLevel}
                onChange={(e) =>
                  updateTauriSettings({
                    logLevel: e.target.value as typeof logLevel,
                  })
                }
              >
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
                <option value="trace">Trace</option>
              </select>
              <p className="form-hint">{t("settings.logLevelHint")}</p>
            </div>
          </section>
        )}
      </main>

      {footerText && <footer className="settings-footer">{footerText}</footer>}
      {showSavingIndicator && saving && (
        <div className="saving-indicator">{t("settings.saving")}</div>
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
