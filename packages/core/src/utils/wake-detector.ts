export const DEFAULT_WAKE_DETECT_INTERVAL_MS = 10_000;
export const DEFAULT_WAKE_DETECT_THRESHOLD_MS = 60_000;

export interface WakeDetectorConfig {
  intervalMs?: number;
  thresholdMs?: number;
}

export interface WakeEvent {
  elapsedMs: number;
  thresholdMs: number;
}

export class WakeDetector {
  private readonly intervalMs: number;
  private readonly thresholdMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTickMs: number = 0;

  constructor(config: WakeDetectorConfig = {}) {
    this.intervalMs = Math.max(1, config.intervalMs ?? DEFAULT_WAKE_DETECT_INTERVAL_MS);
    this.thresholdMs = Math.max(
      this.intervalMs,
      config.thresholdMs ?? DEFAULT_WAKE_DETECT_THRESHOLD_MS,
    );
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  start(onWake: (event: WakeEvent) => void): void {
    if (this.intervalId !== null) return;

    this.lastTickMs = Date.now();
    this.intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastTickMs;
      this.lastTickMs = now;

      if (elapsed > this.thresholdMs) {
        this.stop();
        onWake({ elapsedMs: elapsed, thresholdMs: this.thresholdMs });
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }
}

export function createWakeDetector(config: WakeDetectorConfig = {}): WakeDetector {
  return new WakeDetector(config);
}
