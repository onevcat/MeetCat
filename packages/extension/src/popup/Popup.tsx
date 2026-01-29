import { useState, useEffect, useCallback } from "react";
import type { Settings, MediaState } from "@meetcat/settings";
import { DEFAULT_SETTINGS } from "@meetcat/settings";
import type { ExtensionStatus, GetSettingsMessage, UpdateSettingsMessage, GetStatusMessage } from "../types.js";

const STORAGE_KEY = "meetcat_settings";

export function getExtensionVersion(): string | null {
  try {
    if (typeof chrome === "undefined") return null;
    if (!chrome.runtime?.getManifest) return null;
    return chrome.runtime.getManifest().version || null;
  } catch {
    return null;
  }
}

/**
 * Reusable number input with validation on blur
 */
function NumberInput({
  value,
  defaultValue,
  min,
  max,
  onChange,
}: {
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value.toString());

  // Sync local value when settings change externally
  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleBlur = () => {
    const parsed = parseInt(localValue, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      // Invalid: reset to default
      setLocalValue(defaultValue.toString());
      onChange(defaultValue);
    } else {
      // Valid: save
      onChange(parsed);
    }
  };

  return (
    <input
      type="number"
      className="popup-input"
      min={min}
      max={max}
      placeholder={defaultValue.toString()}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}

/**
 * Dynamic list of filter inputs
 */
function FilterList({
  filters,
  onChange,
}: {
  filters: string[];
  onChange: (filters: string[]) => void;
}) {
  const [localFilters, setLocalFilters] = useState<string[]>(
    filters.length > 0 ? filters : [""]
  );

  // Sync with external changes
  useEffect(() => {
    setLocalFilters(filters.length > 0 ? filters : [""]);
  }, [filters]);

  const handleChange = (index: number, value: string) => {
    const newFilters = [...localFilters];
    newFilters[index] = value;
    setLocalFilters(newFilters);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = localFilters[index].trim();
      if (value === "") {
        // Empty + Enter = delete this row (if more than one)
        if (localFilters.length > 1) {
          const newFilters = localFilters.filter((_, i) => i !== index);
          setLocalFilters(newFilters);
          onChange(newFilters.filter(Boolean));
        }
      } else {
        // Save on Enter
        onChange(localFilters.filter(Boolean));
      }
    }
  };

  const handleBlur = (index: number) => {
    const value = localFilters[index].trim();
    // Update the trimmed value
    if (value !== localFilters[index]) {
      const newFilters = [...localFilters];
      newFilters[index] = value;
      setLocalFilters(newFilters);
    }
    // Save non-empty filters
    onChange(localFilters.map((f) => f.trim()).filter(Boolean));
  };

  const handleAdd = () => {
    setLocalFilters([...localFilters, ""]);
  };

  return (
    <div className="popup-filter-list">
      {localFilters.map((filter, index) => (
        <input
          key={index}
          type="text"
          className="popup-input popup-filter-input"
          placeholder="Enter keyword to exclude"
          value={filter}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onBlur={() => handleBlur(index)}
        />
      ))}
      <button type="button" className="popup-add-button" onClick={handleAdd}>
        + Add filter
      </button>
    </div>
  );
}

export function Popup() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const version = getExtensionVersion();

  // Load settings and status
  useEffect(() => {
    async function load() {
      try {
        // Get settings from storage
        const result = await chrome.storage.sync.get(STORAGE_KEY);
        if (result[STORAGE_KEY]) {
          setSettings({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] });
        }

        // Get status from service worker
        const statusMessage: GetStatusMessage = { type: "GET_STATUS" };
        const statusResult = await chrome.runtime.sendMessage(statusMessage) as ExtensionStatus;
        setStatus(statusResult);
      } catch (e) {
        console.error("Failed to load:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Save settings
  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);

    try {
      await chrome.storage.sync.set({ [STORAGE_KEY]: newSettings });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="popup-header">
        <img className="popup-icon" src="/icons/icon48.png" alt="MeetCat" />
        <span className="popup-title">Loading...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="popup-header">
        <img className="popup-icon" src="/icons/icon48.png" alt="MeetCat" />
        <span className="popup-title">MeetCat</span>
      </div>

      {/* Status Section */}
      <div className="popup-section">
        <div className="popup-section-title">Status</div>
        <div className="popup-status">
          <div className="popup-status-item">
            <span className="popup-status-label">Auto-join</span>
            <span className={`popup-status-value ${settings.autoClickJoin ? "active" : ""}`}>
              {settings.autoClickJoin ? "Enabled" : "Disabled"}
            </span>
          </div>
          {status?.nextMeeting && (
            <div className="popup-status-item">
              <span className="popup-status-label">Next meeting</span>
              <span className="popup-status-value">
                {status.nextMeeting.title.slice(0, 20)}
                {status.nextMeeting.title.length > 20 ? "..." : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* General Settings */}
      <div className="popup-section">
        <div className="popup-section-title">General</div>

        <div className="popup-form-group">
          <div className="popup-checkbox-group">
            <input
              type="checkbox"
              id="autoClickJoin"
              className="popup-checkbox"
              checked={settings.autoClickJoin}
              onChange={(e) => updateSettings({ autoClickJoin: e.target.checked })}
            />
            <label htmlFor="autoClickJoin" className="popup-checkbox-label">
              Auto-click join
            </label>
          </div>
          <div className="popup-hint">Off: only open the meeting page</div>
        </div>

        <div className="popup-form-group">
          <div className="popup-checkbox-group">
            <input
              type="checkbox"
              id="showNotifications"
              className="popup-checkbox"
              checked={settings.showNotifications}
              onChange={(e) => updateSettings({ showNotifications: e.target.checked })}
            />
            <label htmlFor="showNotifications" className="popup-checkbox-label">
              Notifications
            </label>
          </div>
          <div className="popup-hint">Desktop alerts for auto-join</div>
        </div>

        <div className="popup-form-group">
          <div className="popup-checkbox-group">
            <input
              type="checkbox"
              id="showCountdownOverlay"
              className="popup-checkbox"
              checked={settings.showCountdownOverlay}
              onChange={(e) => updateSettings({ showCountdownOverlay: e.target.checked })}
            />
            <label htmlFor="showCountdownOverlay" className="popup-checkbox-label">
              Homepage overlay
            </label>
          </div>
          <div className="popup-hint">Show next meeting overlay on Meet homepage</div>
        </div>
      </div>

      {/* Timing Settings */}
      <div className="popup-section">
        <div className="popup-section-title">Timing</div>

        <div className="popup-form-group">
          <label className="popup-label">Open Meeting Preparing Page</label>
          <div className="popup-inline-input">
            <span className="popup-inline-label">before meeting starts</span>
            <NumberInput
              value={settings.joinBeforeMinutes}
              defaultValue={DEFAULT_SETTINGS.joinBeforeMinutes}
              min={0}
              max={30}
              onChange={(v) => updateSettings({ joinBeforeMinutes: v })}
            />
            <span className="popup-inline-label">minutes</span>
          </div>
        </div>

        <div className="popup-form-group">
          <label className="popup-label">Auto-join countdown</label>
          <div className="popup-inline-input">
            <span className="popup-inline-label">before auto-join</span>
            <NumberInput
              value={settings.joinCountdownSeconds}
              defaultValue={DEFAULT_SETTINGS.joinCountdownSeconds}
              min={0}
              max={60}
              onChange={(v) => updateSettings({ joinCountdownSeconds: v })}
            />
            <span className="popup-inline-label">seconds</span>
          </div>
        </div>

        <div className="popup-form-group">
          <label className="popup-label">Stop auto-join</label>
          <div className="popup-inline-input">
            <span className="popup-inline-label">after meeting starts</span>
            <NumberInput
              value={settings.maxMinutesAfterStart}
              defaultValue={DEFAULT_SETTINGS.maxMinutesAfterStart}
              min={0}
              max={30}
              onChange={(v) => updateSettings({ maxMinutesAfterStart: v })}
            />
            <span className="popup-inline-label">minutes</span>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="popup-section">
        <div className="popup-section-title">Advanced</div>

        <div className="popup-form-group">
          <label className="popup-label">Exclude keywords</label>
          <FilterList
            filters={settings.titleExcludeFilters || []}
            onChange={(filters) => updateSettings({ titleExcludeFilters: filters })}
          />
          <div className="popup-hint">
            Skip meetings with matching titles. Clear text and press Enter to remove.
          </div>
        </div>

        <div className="popup-form-group">
          <label className="popup-label">Default microphone</label>
          <select
            className="popup-select"
            value={settings.defaultMicState}
            onChange={(e) => updateSettings({ defaultMicState: e.target.value as MediaState })}
          >
            <option value="muted">Muted</option>
            <option value="unmuted">Unmuted</option>
          </select>
          <div className="popup-hint">Applied when joining</div>
        </div>

        <div className="popup-form-group">
          <label className="popup-label">Default camera</label>
          <select
            className="popup-select"
            value={settings.defaultCameraState}
            onChange={(e) => updateSettings({ defaultCameraState: e.target.value as MediaState })}
          >
            <option value="muted">Off</option>
            <option value="unmuted">On</option>
          </select>
          <div className="popup-hint">Applied when joining</div>
        </div>
      </div>

      <div className="popup-footer">
        {version ? `MeetCat v${version}` : "MeetCat"}
      </div>
    </div>
  );
}
