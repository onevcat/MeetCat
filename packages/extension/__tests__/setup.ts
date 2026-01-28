import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Chrome APIs
const chromeMock = {
  storage: {
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({}),
    getManifest: vi.fn().mockReturnValue({ version: "0.0.1" }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(true),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    create: vi.fn().mockResolvedValue({ id: 1, windowId: 1 }),
    query: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: 1, windowId: 1 }),
  },
  windows: {
    update: vi.fn().mockResolvedValue({}),
  },
  notifications: {
    create: vi.fn(),
  },
};

// Assign to global
(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
