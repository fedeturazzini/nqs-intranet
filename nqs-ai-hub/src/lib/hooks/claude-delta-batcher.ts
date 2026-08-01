export const DELTA_BATCH_MAX_WAIT_MS = 40;

export type DeltaBatchScheduler = {
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
  setTimer: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer: (handle: ReturnType<typeof setTimeout>) => void;
};

type DeltaBatcherOptions = {
  onFlush: (accumulatedText: string) => void;
  scheduler?: DeltaBatchScheduler;
  maxWaitMs?: number;
};

function browserScheduler(): DeltaBatchScheduler {
  const hasAnimationFrame =
    typeof globalThis.requestAnimationFrame === "function" &&
    typeof globalThis.cancelAnimationFrame === "function";
  return {
    requestFrame: hasAnimationFrame
      ? (callback) => globalThis.requestAnimationFrame(callback)
      : undefined,
    cancelFrame: hasAnimationFrame
      ? (handle) => globalThis.cancelAnimationFrame(handle)
      : undefined,
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: (handle) => clearTimeout(handle),
  };
}

/**
 * Acumula deltas sin perder texto y publica como máximo una vez por frame.
 * El timer evita que una pestaña con rAF throttled quede congelada.
 */
export function createClaudeDeltaBatcher({
  onFlush,
  scheduler = browserScheduler(),
  maxWaitMs = DELTA_BATCH_MAX_WAIT_MS,
}: DeltaBatcherOptions) {
  let accumulatedText = "";
  let lastPublishedText = "";
  let scheduled = false;
  let frameHandle: number | null = null;
  let timerHandle: ReturnType<typeof setTimeout> | null = null;

  function clearScheduledHandles(): void {
    if (frameHandle !== null) {
      scheduler.cancelFrame?.(frameHandle);
      frameHandle = null;
    }
    if (timerHandle !== null) {
      scheduler.clearTimer(timerHandle);
      timerHandle = null;
    }
  }

  function publish(): void {
    if (!scheduled) return;
    scheduled = false;
    clearScheduledHandles();
    if (lastPublishedText === accumulatedText) return;
    lastPublishedText = accumulatedText;
    onFlush(accumulatedText);
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    if (scheduler.requestFrame) {
      frameHandle = scheduler.requestFrame(publish);
    }
    timerHandle = scheduler.setTimer(publish, maxWaitMs);
  }

  return {
    push(delta: string): void {
      if (!delta) return;
      accumulatedText += delta;
      schedule();
    },
    flush(): void {
      if (!scheduled && lastPublishedText === accumulatedText) return;
      scheduled = true;
      publish();
    },
    cancel(): void {
      scheduled = false;
      clearScheduledHandles();
    },
    text(): string {
      return accumulatedText;
    },
  };
}
