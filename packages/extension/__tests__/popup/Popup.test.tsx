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

    expect(screen.getByText("Loading settings...")).toBeDefined();
  });

  it("should render MeetCat title after loading", async () => {
    const { container } = render(<Popup />);

    await waitFor(() => {
      const title = container.querySelector(".settings-header h1");
      expect(title?.textContent).toBe("MeetCat Settings");
    });
  });

  it("should render timing section", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Timing")).toBeDefined();
      expect(screen.getByText("Open Meeting Preparing Page")).toBeDefined();
      expect(screen.getByText("Auto-join countdown")).toBeDefined();
      expect(screen.getByText("Stop auto-join")).toBeDefined();
    });
  });

  it("should render advanced section media defaults", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
      expect(screen.getByText("Default microphone")).toBeDefined();
      expect(screen.getByText("Default camera")).toBeDefined();
    });
  });

  it("should render general section", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
      expect(screen.getByText("Auto-click join")).toBeDefined();
    });
  });

  it("should save settings when autoClickJoin checkbox is toggled", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { autoClickJoin: true },
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const checkbox = screen.getByLabelText("Auto-click join");
    fireEvent.click(checkbox);

    expect(chrome.storage.sync.set).toHaveBeenCalled();
  });

  it("should update media defaults when selecting options", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Advanced")).toBeDefined();
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

  it("should toggle overlay setting", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeDefined();
    });

    const overlayCheckbox = screen.getByLabelText("Homepage overlay");
    fireEvent.click(overlayCheckbox);

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

    const input = screen.getAllByRole("spinbutton")[2];
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

    const input = screen.getAllByRole("spinbutton")[1];
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
      const footer = container.querySelector(".settings-footer");
      expect(footer?.textContent).toMatch(/MeetCat v\d+\.\d+\.\d+/);
    });
  });

  it("should fall back when extension version is unavailable", async () => {
    (chrome.runtime.getManifest as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Manifest error");
    });

    const { container } = render(<Popup />);

    await waitFor(() => {
      const footer = container.querySelector(".settings-footer");
      expect(footer?.textContent).toBe("MeetCat");
    });
  });

  it("should handle storage loading error gracefully", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Storage error")
    );

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("MeetCat Settings")).toBeDefined();
    });
  });

  it("should handle settings save error gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Save error")
    );

    render(<Popup />);

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

  it("should render filter chips when filters are provided", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { titleExcludeFilters: ["1:1", "Optional"] },
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("1:1")).toBeDefined();
      expect(screen.getByText("Optional")).toBeDefined();
    });
  });

  it("should fall back to empty filters when missing", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { titleExcludeFilters: undefined },
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter filter text...")).toBeDefined();
      expect(screen.queryByText("Optional")).toBeNull();
    });
  });

  it("should add new filter when clicking Add button", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Add")).toBeDefined();
    });

    const input = screen.getByPlaceholderText("Enter filter text...");
    fireEvent.change(input, { target: { value: "test-filter" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  it("should remove filter when clicking remove button", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meetcat_settings: { titleExcludeFilters: ["1:1", "Optional"] },
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("1:1")).toBeDefined();
    });

    const removeButtons = screen.getAllByTitle("Remove filter");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });
});
