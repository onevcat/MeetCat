import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Popup, getExtensionVersion } from "../../src/popup/Popup.js";

describe("getExtensionVersion", () => {
  it("should return null when chrome is undefined", () => {
    const originalChrome = (globalThis as { chrome?: unknown }).chrome;
    delete (globalThis as { chrome?: unknown }).chrome;

    expect(getExtensionVersion()).toBeNull();

    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  });

  it("should return null when getManifest is missing", () => {
    const originalRuntime = chrome.runtime;
    (chrome as { runtime?: unknown }).runtime = undefined;

    expect(getExtensionVersion()).toBeNull();

    (chrome as { runtime?: unknown }).runtime = originalRuntime;
  });

  it("should return version when manifest is available", () => {
    (chrome.runtime.getManifest as ReturnType<typeof vi.fn>).mockReturnValue({
      version: "1.2.3",
    });

    expect(getExtensionVersion()).toBe("1.2.3");
  });

  it("should return null when manifest version is empty", () => {
    (chrome.runtime.getManifest as ReturnType<typeof vi.fn>).mockReturnValue({
      version: "",
    });

    expect(getExtensionVersion()).toBeNull();
  });
});

describe("Popup", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      nextMeeting: null,
      lastCheck: null,
    });
    (chrome.runtime.getManifest as ReturnType<typeof vi.fn>).mockReturnValue({
      version: "0.0.1",
    });
  });

  it("should show loading state initially", () => {
    // Make the Promise hang to keep loading state
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(<Popup />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("should render MeetCat title after loading", async () => {
    const { container } = render(<Popup />);

    await waitFor(() => {
      const title = container.querySelector(".popup-title");
      expect(title?.textContent).toBe("MeetCat");
    });
  });

  it("should show auto-join status", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Status")).toBeDefined();
      expect(screen.getByText("Auto-join")).toBeDefined();
    });
  });

  it("should show Enabled when autoClickJoin is true", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { autoClickJoin: true },
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeDefined();
    });
  });

  it("should show Disabled when autoClickJoin is false", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { autoClickJoin: false },
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Disabled")).toBeDefined();
    });
  });

  it("should show next meeting when available", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      nextMeeting: {
        title: "Team Standup",
        callId: "abc-defg-hij",
      },
      lastCheck: Date.now(),
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Next meeting")).toBeDefined();
      expect(screen.getByText("Team Standup")).toBeDefined();
    });
  });

  it("should show ellipsis for long meeting titles", async () => {
    const longTitle = "12345678901234567890extra";
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      nextMeeting: {
        title: longTitle,
        callId: "abc-defg-hij",
      },
      lastCheck: Date.now(),
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Next meeting")).toBeDefined();
      expect(screen.getByText(/12345678901234567890/)).toBeDefined();
      expect(screen.getByText(/\.{3}/)).toBeDefined();
    });
  });

  it("should render timing section", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
      expect(screen.getByText("Join before meeting (minutes)")).toBeDefined();
      expect(screen.getByText("Stop auto-join after start (minutes)")).toBeDefined();
    });
  });

  it("should render media defaults section", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Media Defaults")).toBeDefined();
      expect(screen.getByText("Microphone")).toBeDefined();
      expect(screen.getByText("Camera")).toBeDefined();
    });
  });

  it("should render behavior section", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Behavior")).toBeDefined();
      expect(screen.getByText("Auto-click join button")).toBeDefined();
    });
  });

  it("should save settings when autoClickJoin checkbox is toggled", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { autoClickJoin: true },
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Behavior")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join button");
    fireEvent.click(checkbox);

    expect(chrome.storage.sync.set).toHaveBeenCalled();
  });

  it("should update media defaults when selecting options", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Media Defaults")).toBeDefined();
    });

    const selects = screen.getAllByRole("combobox");
    const micSelect = selects[0];
    const cameraSelect = selects[1];

    fireEvent.change(micSelect, { target: { value: "unmuted" } });
    fireEvent.change(cameraSelect, { target: { value: "unmuted" } });

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should toggle overlay and notifications settings", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Behavior")).toBeDefined();
    });

    const overlayCheckbox = screen.getByLabelText("Show countdown overlay");
    const notificationsCheckbox = screen.getByLabelText("Show notifications");

    fireEvent.click(overlayCheckbox);
    fireEvent.click(notificationsCheckbox);

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should update joinBeforeMinutes on blur", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const input = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should update maxMinutesAfterStart on blur", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const input = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should update joinCountdownSeconds on blur", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const input = screen.getAllByRole("spinbutton")[2];
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should reset invalid input to default on blur", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
    });

    const input = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.blur(input);

    // Should reset to default value
    expect(input).toHaveValue(1); // default joinBeforeMinutes
  });

  it("should show footer with version", async () => {
    const { container } = render(<Popup />);

    await waitFor(() => {
      const footer = container.querySelector(".popup-footer");
      expect(footer?.textContent).toMatch(/MeetCat v\d+\.\d+\.\d+/);
    });
  });

  it("should fall back when extension version is unavailable", async () => {
    (chrome.runtime.getManifest as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Manifest error");
    });

    const { container } = render(<Popup />);

    await waitFor(() => {
      const footer = container.querySelector(".popup-footer");
      expect(footer?.textContent).toBe("MeetCat");
    });
  });

  it("should handle storage loading error gracefully", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Storage error")
    );

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getAllByText("MeetCat").length).toBeGreaterThan(0);
    });
  });

  it("should handle settings save error gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Save error")
    );

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Behavior")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join button");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to save settings:",
        expect.any(Error)
      );
    });

    errorSpy.mockRestore();
  });
});

describe("NumberInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      nextMeeting: null,
      lastCheck: null,
    });
  });

  it("should sync local value when settings change externally", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { joinBeforeMinutes: 10 },
    });

    render(<Popup />);

    await waitFor(() => {
      const input = screen.getAllByRole("spinbutton")[0];
      expect(input).toHaveValue(10);
    });
  });
});

describe("FilterList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      nextMeeting: null,
      lastCheck: null,
    });
  });

  it("should render filter inputs", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { titleExcludeFilters: ["1:1", "Optional"] },
    });

    render(<Popup />);

    await waitFor(() => {
      const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
      expect(filterInputs.length).toBe(2);
    });
  });

  it("should fall back to empty filters when missing", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { titleExcludeFilters: undefined },
    });

    render(<Popup />);

    await waitFor(() => {
      const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
      expect(filterInputs.length).toBe(1);
    });
  });

  it("should add new filter when clicking Add filter button", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("+ Add filter")).toBeDefined();
    });

    fireEvent.click(screen.getByText("+ Add filter"));

    const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
    expect(filterInputs.length).toBe(2);
  });

  it("should save filter on blur", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("+ Add filter")).toBeDefined();
    });

    const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
    fireEvent.change(filterInputs[0], { target: { value: "test-filter" } });
    fireEvent.blur(filterInputs[0]);

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should trim filter value on blur", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("+ Add filter")).toBeDefined();
    });

    const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
    fireEvent.change(filterInputs[0], { target: { value: "  trimmed  " } });
    fireEvent.blur(filterInputs[0]);

    await waitFor(() => {
      expect(filterInputs[0]).toHaveValue("trimmed");
    });
  });

  it("should save filter on Enter key", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("+ Add filter")).toBeDefined();
    });

    const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
    fireEvent.change(filterInputs[0], { target: { value: "test-filter" } });
    fireEvent.keyDown(filterInputs[0], { key: "Enter" });

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should remove filter on Enter with empty value", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { titleExcludeFilters: ["1:1", "Optional"] },
    });

    render(<Popup />);

    await waitFor(() => {
      const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
      expect(filterInputs.length).toBe(2);
    });

    const filterInputs = screen.getAllByPlaceholderText("Enter keyword to exclude");
    fireEvent.change(filterInputs[0], { target: { value: "" } });
    fireEvent.keyDown(filterInputs[0], { key: "Enter" });

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });
});
