import { describe, expect, test } from "vitest";
import {
  createClaudeDeltaBatcher,
  type DeltaBatchScheduler,
} from "@/lib/hooks/claude-delta-batcher";

function manualScheduler() {
  let nextFrame = 1;
  let nextTimer = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();

  const scheduler: DeltaBatchScheduler = {
    requestFrame(callback) {
      const handle = nextFrame++;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) {
      frames.delete(handle);
    },
    setTimer(callback) {
      const handle = nextTimer++ as unknown as ReturnType<typeof setTimeout>;
      timers.set(handle, callback);
      return handle;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
  };

  return {
    scheduler,
    frames,
    timers,
    runFrame() {
      const callback = frames.values().next().value as (() => void) | undefined;
      callback?.();
    },
    runTimer() {
      const callback = timers.values().next().value as (() => void) | undefined;
      callback?.();
    },
  };
}

describe("createClaudeDeltaBatcher", () => {
  test("agrupa muchos deltas en una publicación por frame", () => {
    const manual = manualScheduler();
    const published: string[] = [];
    const batcher = createClaudeDeltaBatcher({
      scheduler: manual.scheduler,
      onFlush: (text) => published.push(text),
    });

    for (const delta of ["uno", " ", "dos", " ", "tres"]) {
      batcher.push(delta);
    }

    expect(manual.frames.size).toBe(1);
    expect(manual.timers.size).toBe(1);
    expect(published).toEqual([]);
    manual.runFrame();
    expect(published).toEqual(["uno dos tres"]);
    expect(manual.timers.size).toBe(0);
  });

  test("el timer máximo publica si rAF no corre", () => {
    const manual = manualScheduler();
    const published: string[] = [];
    const batcher = createClaudeDeltaBatcher({
      scheduler: manual.scheduler,
      onFlush: (text) => published.push(text),
    });

    batcher.push("respuesta");
    manual.runTimer();

    expect(published).toEqual(["respuesta"]);
    expect(manual.frames.size).toBe(0);
  });

  test("flush publica una respuesta corta y cancela callbacks pendientes", () => {
    const manual = manualScheduler();
    const published: string[] = [];
    const batcher = createClaudeDeltaBatcher({
      scheduler: manual.scheduler,
      onFlush: (text) => published.push(text),
    });

    batcher.push("corta");
    batcher.flush();

    expect(published).toEqual(["corta"]);
    expect(manual.frames.size).toBe(0);
    expect(manual.timers.size).toBe(0);
  });

  test("cancel impide una publicación tardía sin perder el acumulado", () => {
    const manual = manualScheduler();
    const published: string[] = [];
    const batcher = createClaudeDeltaBatcher({
      scheduler: manual.scheduler,
      onFlush: (text) => published.push(text),
    });

    batcher.push("texto parcial");
    const staleFrame = manual.frames.values().next().value as () => void;
    batcher.cancel();
    staleFrame();

    expect(published).toEqual([]);
    expect(batcher.text()).toBe("texto parcial");
  });

  test("el texto total es idéntico a concatenar todos los deltas", () => {
    const manual = manualScheduler();
    const deltas = ["# Título\n", "Texto ", "**importante**", "\n", "fin."];
    const batcher = createClaudeDeltaBatcher({
      scheduler: manual.scheduler,
      onFlush: () => undefined,
    });

    deltas.forEach((delta) => batcher.push(delta));

    expect(batcher.text()).toBe(deltas.join(""));
  });
});
