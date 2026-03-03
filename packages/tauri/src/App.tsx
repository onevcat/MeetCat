import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import type { Settings } from "@meetcat/settings";
import { DEFAULT_TAURI_SETTINGS, getTauriDefaults } from "@meetcat/settings";
import { SettingsContainer, type SettingsAdapter } from "@meetcat/settings-ui";
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

/**
 * Settings window for MeetCat Tauri app
 */
export function App() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [canInstallUpdate, setCanInstallUpdate] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);
  const [updateErrorText, setUpdateErrorText] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<UpdateDownloadProgress | null>(null);

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
      setCanInstallUpdate(false);
      setUpdateErrorText(null);
      setUpdateStatusText("Checking for updates...");

      try {
        const result = await invoke<UpdateInfo | null>("check_for_update_manual");
        setUpdateInfo(result);
        setCanInstallUpdate(Boolean(result));
        if (result) {
          setUpdateStatusText(`New version ${result.version} is available.`);
        } else {
          setUpdateStatusText("You are using the latest version.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setUpdateInfo(null);
        setCanInstallUpdate(false);
        setUpdateErrorText(message);
        setUpdateStatusText(null);
      } finally {
        setIsCheckingForUpdate(false);
      }
    },
    []
  );

  const installUpdate = useCallback(async () => {
    if (isInstallingUpdate || !canInstallUpdate || !updateInfo) return;
    setIsInstallingUpdate(true);
    setCanInstallUpdate(false);
    setUpdateErrorText(null);
    setDownloadProgress(null);
    setUpdateStatusText("Downloading update...");
    try {
      const installed = await invoke<boolean>("download_and_install_update", {
        autoRestart: true,
      });
      if (!installed) {
        setUpdateInfo(null);
        setUpdateStatusText("No update is available.");
        setIsInstallingUpdate(false);
        return;
      }
      setUpdateStatusText("Update installed. Restarting MeetCat...");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateErrorText(message);
      setUpdateStatusText(null);
      setIsInstallingUpdate(false);
    }
  }, [isInstallingUpdate]);

  useEffect(() => {
    let disposed = false;
    const cleanupTasks: Array<() => void> = [];

    const setup = async () => {
      try {
        const info = await invoke<UpdateInfo | null>("get_update_info");
        if (!disposed) {
          setUpdateInfo(info);
          setCanInstallUpdate(Boolean(info));
        }
      } catch (error) {
        console.error("Failed to load update info:", error);
      }

      try {
        const shouldOpenDialog = await invoke<boolean>("consume_open_update_dialog_request");
        if (!disposed && shouldOpenDialog) {
          setIsUpdateDialogOpen(true);
        }
      } catch (error) {
        console.error("Failed to consume update dialog request:", error);
      }

      try {
        const shouldRunManualCheck = await invoke<boolean>(
          "consume_manual_update_check_request"
        );
        if (!disposed && shouldRunManualCheck) {
          void checkForUpdates(true);
        }
      } catch (error) {
        console.error("Failed to consume manual update check request:", error);
      }

      const unlistenUpdate = await listen<UpdateInfo | null>("update:available", (event) => {
        if (!disposed) {
          setUpdateInfo(event.payload);
          setCanInstallUpdate(Boolean(event.payload));
        }
      });
      cleanupTasks.push(unlistenUpdate);

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
            setUpdateStatusText("Downloading update...");
          }
        }
      );
      cleanupTasks.push(unlistenProgress);

      const unlistenFinish = await listen("update:download-finish", () => {
        if (!disposed) {
          setUpdateStatusText("Installing update...");
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
  }, [checkForUpdates]);

  return (
    <div className="tauri-settings-shell">
      {updateInfo && (
        <div className="update-banner" role="status">
          <span className="update-banner-text">
            New version {updateInfo.version} is available
          </span>
          <button
            type="button"
            className="update-banner-btn"
            onClick={() => setIsUpdateDialogOpen(true)}
          >
            View details
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
                  ? `Update to ${updateInfo.version}`
                  : "Check for updates"}
              </h2>
            </div>

            {updateInfo ? (
              <>
                <p className="update-dialog-description">
                  A new version is ready. Install will restart MeetCat automatically.
                </p>
                <div className="update-dialog-notes">
                  <h3>What&apos;s new</h3>
                  <pre>{updateInfo.notes?.trim() || "No release notes provided."}</pre>
                </div>
              </>
            ) : (
              <p className="update-dialog-description">
                No update is currently cached. You can run a manual check now.
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
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isCheckingForUpdate || isInstallingUpdate}
                onClick={() => {
                  void checkForUpdates(false);
                }}
              >
                {isCheckingForUpdate ? "Checking..." : "Check now"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canInstallUpdate || isCheckingForUpdate || isInstallingUpdate}
                onClick={() => {
                  void installUpdate();
                }}
              >
                {isInstallingUpdate ? "Installing..." : "Install update"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isInstallingUpdate}
                onClick={() => setIsUpdateDialogOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
