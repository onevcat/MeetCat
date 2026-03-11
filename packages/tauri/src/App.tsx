import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import type { Settings } from "@meetcat/settings";
import { DEFAULT_TAURI_SETTINGS, getTauriDefaults } from "@meetcat/settings";
import { SettingsContainer, type SettingsAdapter } from "@meetcat/settings-ui";
import { initI18n, type LanguageSetting } from "@meetcat/i18n";
import { I18nProvider, useTranslation } from "@meetcat/i18n/react";
import "./App.css";

type UpdateInfo = {
  version: string;
  notes?: string | null;
};

type UpdateDownloadProgress = {
  downloaded: number;
  total?: number | null;
  percent?: number | null;
};

type UpdatePreference = {
  skippedVersion?: string;
  remindVersion?: string;
  remindUntilMs?: number;
};

const REMIND_LATER_MS = 24 * 60 * 60 * 1000;

const defaultSettings = getTauriDefaults();

const resolveSettings = (loaded: Settings | null): Settings => {
  return {
    ...defaultSettings,
    ...loaded,
    tauri: {
      ...DEFAULT_TAURI_SETTINGS,
      ...loaded?.tauri,
    },
  };
};

const adapter: SettingsAdapter = {
  capabilities: {
    startAtLogin: true,
    tray: true,
    showSavingIndicator: true,
    developer: true,
  },
  getDefaultSettings: () => resolveSettings(null),
  resolveSettings,
  loadSettings: async () => {
    const loadedSettings = await invoke<Settings>("get_settings");
    let resolvedSettings = resolveSettings(loadedSettings);

    try {
      const systemEnabled = await isAutostartEnabled();
      const currentEnabled =
        resolvedSettings.tauri?.startAtLogin ??
        DEFAULT_TAURI_SETTINGS.startAtLogin;

      if (systemEnabled !== currentEnabled) {
        resolvedSettings = {
          ...resolvedSettings,
          tauri: {
            ...DEFAULT_TAURI_SETTINGS,
            ...resolvedSettings.tauri,
            startAtLogin: systemEnabled,
          },
        };
        await invoke("save_settings", { settings: resolvedSettings });
      }
    } catch (e) {
      console.error("Failed to sync autostart status:", e);
    }

    return resolvedSettings;
  },
  saveSettings: async (settings) => {
    await invoke("save_settings", { settings });
  },
  subscribe: (handler) => {
    const unlisten = listen<Settings>("settings_changed", (event) => {
      handler(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  updateStartAtLogin: async (enabled, settings) => {
    const isEnabled = await isAutostartEnabled();

    if (enabled) {
      if (!isEnabled) {
        await enableAutostart();
      }
    } else if (isEnabled) {
      await disableAutostart();
    }

    const updated = await isAutostartEnabled();
    return {
      ...settings,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        ...settings.tauri,
        startAtLogin: updated,
      },
    };
  },
  getVersion: async () => getVersion(),
};

function isSuppressedByPreference(
  update: UpdateInfo | null,
  preference: UpdatePreference
): boolean {
  if (!update) return false;
  if (preference.skippedVersion === update.version) return true;
  if (
    preference.remindVersion === update.version &&
    typeof preference.remindUntilMs === "number" &&
    preference.remindUntilMs > Date.now()
  ) {
    return true;
  }
  return false;
}

function renderInlineMarkdown(text: string): Array<string | JSX.Element> {
  const parts: Array<string | JSX.Element> = [];
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null = null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    if (match[1]) {
      parts.push(
        <code key={`code-${index}`}>{match[1].slice(1, -1)}</code>
      );
    } else {
      const raw = match[2];
      const url = match[3];
      const label = raw.slice(1, raw.indexOf("]"));
      parts.push(
        <a
          key={`link-${index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {label}
        </a>
      );
    }
    cursor = pattern.lastIndex;
    index += 1;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  if (parts.length === 0) {
    return [text];
  }
  return parts;
}

function renderMarkdown(notes: string): JSX.Element {
  const lines = notes.replace(/\r\n/g, "\n").split("\n");
  const blocks: JSX.Element[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h4 key={`h-${i}`}>
          {renderInlineMarkdown(heading[2])}
        </h4>
      );
      i += 1;
      continue;
    }

    const bullet = line.match(/^- (.+)$/);
    if (bullet) {
      const items: JSX.Element[] = [];
      while (i < lines.length) {
        const candidate = lines[i].trim().match(/^- (.+)$/);
        if (!candidate) break;
        items.push(
          <li key={`li-${i}`}>{renderInlineMarkdown(candidate[1])}</li>
        );
        i += 1;
      }
      blocks.push(<ul key={`ul-${i}`}>{items}</ul>);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const items: JSX.Element[] = [];
      while (i < lines.length) {
        const candidate = lines[i].trim().match(/^\d+\.\s+(.+)$/);
        if (!candidate) break;
        items.push(
          <li key={`ol-li-${i}`}>{renderInlineMarkdown(candidate[1])}</li>
        );
        i += 1;
      }
      blocks.push(<ol key={`ol-${i}`}>{items}</ol>);
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const text = lines[i].trim();
      if (!text) break;
      if (/^(#{1,3})\s+/.test(text)) break;
      if (/^- /.test(text)) break;
      if (/^\d+\.\s+/.test(text)) break;
      paragraphLines.push(text);
      i += 1;
    }
    blocks.push(
      <p key={`p-${i}`}>
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>
    );
  }

  return <Fragment>{blocks}</Fragment>;
}

/**
 * Settings window for MeetCat Tauri app
 */
function AppContent() {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);
  const [updateErrorText, setUpdateErrorText] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<UpdateDownloadProgress | null>(null);
  const [updatePreference, setUpdatePreference] = useState<UpdatePreference>({});

  const bannerUpdate = useMemo(() => {
    if (!updateInfo) return null;
    if (isSuppressedByPreference(updateInfo, updatePreference)) return null;
    return updateInfo;
  }, [updateInfo, updatePreference]);

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const progressText = useMemo(() => {
    if (!downloadProgress) return null;
    const downloadedText = formatBytes(downloadProgress.downloaded);
    if (downloadProgress.total && downloadProgress.total > 0) {
      const totalText = formatBytes(downloadProgress.total);
      if (typeof downloadProgress.percent === "number") {
        return `${downloadedText} / ${totalText} (${downloadProgress.percent.toFixed(1)}%)`;
      }
      return `${downloadedText} / ${totalText}`;
    }
    return downloadedText;
  }, [downloadProgress]);

  const checkForUpdates = useCallback(
    async (openDialog: boolean) => {
      if (openDialog) {
        setIsUpdateDialogOpen(true);
      }
      setIsCheckingForUpdate(true);
      setUpdateErrorText(null);
      setUpdateStatusText(t("update.checkingForUpdates"));

      try {
        const result = await invoke<UpdateInfo | null>("check_for_update_manual");
        setUpdateInfo(result);
        if (result) {
          setUpdateStatusText(t("update.newVersionAvailable", { version: result.version }));
        } else {
          setUpdateStatusText(t("update.latestVersion"));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setUpdateInfo(null);
        setUpdateErrorText(message);
        setUpdateStatusText(null);
      } finally {
        setIsCheckingForUpdate(false);
      }
    },
    [t]
  );

  const applyUpdatePreference = useCallback(async (next: UpdatePreference) => {
    setUpdatePreference(next);
    try {
      await invoke("set_update_prompt_preference", { preference: next });
    } catch (error) {
      console.error("Failed to persist update prompt preference:", error);
    }
  }, []);

  const skipCurrentVersion = useCallback(() => {
    if (!updateInfo) return;
    void applyUpdatePreference({
      skippedVersion: updateInfo.version,
      remindVersion: undefined,
      remindUntilMs: undefined,
    });
    setIsUpdateDialogOpen(false);
  }, [applyUpdatePreference, updateInfo]);

  const remindCurrentVersionLater = useCallback(() => {
    if (!updateInfo) return;
    void applyUpdatePreference({
      skippedVersion: undefined,
      remindVersion: updateInfo.version,
      remindUntilMs: Date.now() + REMIND_LATER_MS,
    });
    setIsUpdateDialogOpen(false);
  }, [applyUpdatePreference, updateInfo]);

  const installUpdate = useCallback(async () => {
    if (isInstallingUpdate || !updateInfo) return;
    setIsInstallingUpdate(true);
    setUpdateErrorText(null);
    setDownloadProgress(null);
    setUpdateStatusText(t("update.downloadingUpdate"));
    try {
      const installed = await invoke<boolean>("download_and_install_update", {
        autoRestart: true,
      });
      if (!installed) {
        setUpdateInfo(null);
        setUpdateStatusText(t("update.noUpdateAvailable"));
        setIsInstallingUpdate(false);
        return;
      }
      setUpdateStatusText(t("update.updateInstalled"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateErrorText(message);
      setUpdateStatusText(null);
      setIsInstallingUpdate(false);
    }
  }, [isInstallingUpdate, updateInfo, t]);

  useEffect(() => {
    let disposed = false;
    const cleanupTasks: Array<() => void> = [];

    const setup = async () => {
      try {
        const info = await invoke<UpdateInfo | null>("get_update_info");
        if (!disposed) {
          setUpdateInfo(info);
        }
      } catch (error) {
        console.error("Failed to load update info:", error);
      }

      try {
        const preference = await invoke<UpdatePreference | null>(
          "get_update_prompt_preference"
        );
        if (!disposed) {
          setUpdatePreference(preference ?? {});
        }
      } catch (error) {
        console.error("Failed to load update prompt preference:", error);
      }

      try {
        const shouldOpenDialog = await invoke<boolean>("consume_open_update_dialog_request");
        if (shouldOpenDialog) {
          setIsUpdateDialogOpen(true);
        }
      } catch (error) {
        console.error("Failed to consume update dialog request:", error);
      }

      try {
        const shouldRunManualCheck = await invoke<boolean>(
          "consume_manual_update_check_request"
        );
        if (shouldRunManualCheck) {
          void checkForUpdates(true);
        }
      } catch (error) {
        console.error("Failed to consume manual update check request:", error);
      }

      const unlistenUpdate = await listen<UpdateInfo | null>("update:available", (event) => {
        if (!disposed) {
          setUpdateInfo(event.payload);
        }
      });
      cleanupTasks.push(unlistenUpdate);

      const unlistenPreference = await listen<UpdatePreference>(
        "update:preference-changed",
        (event) => {
          if (!disposed) {
            setUpdatePreference(event.payload ?? {});
          }
        }
      );
      cleanupTasks.push(unlistenPreference);

      const unlistenOpenDialog = await listen("update:open-dialog", () => {
        if (!disposed) {
          setIsUpdateDialogOpen(true);
        }
      });
      cleanupTasks.push(unlistenOpenDialog);

      const unlistenManualCheck = await listen("update:manual-check", () => {
        if (!disposed) {
          void checkForUpdates(true);
        }
      });
      cleanupTasks.push(unlistenManualCheck);

      const unlistenProgress = await listen<UpdateDownloadProgress>(
        "update:download-progress",
        (event) => {
          if (!disposed) {
            setDownloadProgress(event.payload);
            setUpdateStatusText(t("update.downloadingUpdate"));
          }
        }
      );
      cleanupTasks.push(unlistenProgress);

      const unlistenFinish = await listen("update:download-finish", () => {
        if (!disposed) {
          setUpdateStatusText(t("update.installingUpdate"));
        }
      });
      cleanupTasks.push(unlistenFinish);
    };

    void setup();

    return () => {
      disposed = true;
      for (const cleanup of cleanupTasks) {
        cleanup();
      }
    };
  }, [checkForUpdates, t]);

  return (
    <div className="tauri-settings-shell">
      {bannerUpdate && (
        <div className="update-banner" role="status">
          <span className="update-banner-text">
            {t("update.newVersionBanner", { version: bannerUpdate.version })}
          </span>
          <button
            type="button"
            className="update-banner-btn"
            onClick={() => setIsUpdateDialogOpen(true)}
          >
            {t("update.viewDetails")}
          </button>
        </div>
      )}

      <SettingsContainer
        adapter={adapter}
        headerTitle="MeetCat Settings"
        headerIconSrc="/icons/icon-color.png"
        appName="MeetCat"
      />

      {isUpdateDialogOpen && (
        <div
          className="update-dialog-backdrop"
          role="presentation"
          onClick={() => {
            if (isInstallingUpdate) return;
            setIsUpdateDialogOpen(false);
          }}
        >
          <div
            className="update-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="update-dialog-header">
              <h2 id="update-dialog-title">
                {updateInfo
                  ? t("update.updateTo", { version: updateInfo.version })
                  : t("update.checkForUpdates")}
              </h2>
              <button
                type="button"
                className="update-dialog-close"
                aria-label={t("update.closeDialog")}
                disabled={isInstallingUpdate}
                onClick={() => setIsUpdateDialogOpen(false)}
              >
                ×
              </button>
            </div>

            {updateInfo ? (
              <>
                <p className="update-dialog-description">
                  {t("update.newVersionReady")}
                </p>
                <div className="update-dialog-notes">
                  <h3>{t("update.whatsNew")}</h3>
                  <div className="update-dialog-markdown">
                    {renderMarkdown(updateInfo.notes?.trim() || t("update.noReleaseNotes"))}
                  </div>
                </div>
              </>
            ) : (
              <p className="update-dialog-description">
                {t("update.noUpdateCached")}
              </p>
            )}

            {progressText && (
              <div className="update-dialog-progress">
                {downloadProgress?.percent !== undefined &&
                  downloadProgress?.percent !== null && (
                    <div className="update-progress-track">
                      <div
                        className="update-progress-value"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, downloadProgress.percent)
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                <p>{progressText}</p>
              </div>
            )}

            {updateStatusText && <p className="update-dialog-status">{updateStatusText}</p>}
            {updateErrorText && <p className="update-dialog-error">{updateErrorText}</p>}

            <div className="update-dialog-actions">
              {updateInfo ? (
                <>
                  <div className="update-dialog-minor-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={isCheckingForUpdate || isInstallingUpdate}
                      onClick={skipCurrentVersion}
                    >
                      {t("update.skipThisVersion")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={isCheckingForUpdate || isInstallingUpdate}
                      onClick={remindCurrentVersionLater}
                    >
                      {t("update.remindTomorrow")}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!updateInfo || isInstallingUpdate}
                    onClick={() => {
                      void installUpdate();
                    }}
                  >
                    {isInstallingUpdate ? t("update.installing") : t("update.installUpdate")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isCheckingForUpdate || isInstallingUpdate}
                  onClick={() => {
                    void checkForUpdates(false);
                  }}
                >
                  {isCheckingForUpdate ? t("update.checking") : t("update.checkForUpdates")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Pre-initialize i18n before rendering; SettingsContainer will refine language
    initI18n("auto").then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
