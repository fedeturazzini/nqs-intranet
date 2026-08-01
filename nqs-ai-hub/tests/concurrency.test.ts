import { describe, expect, test } from "vitest";
import { mapWithConcurrency } from "@/lib/utils/concurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("mapWithConcurrency", () => {
  test("limita tareas activas y conserva el orden original", async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithConcurrency(
      [40, 5, 30, 10, 20],
      3,
      async (delay, index) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return `result-${index}`;
      },
    );

    expect(maxActive).toBe(3);
    expect(result).toEqual([
      "result-0",
      "result-1",
      "result-2",
      "result-3",
      "result-4",
    ]);
  });

  test("deja de programar trabajo y espera lo que ya estaba activo al fallar", async () => {
    const zero = deferred<string>();
    const one = deferred<string>();
    const started: number[] = [];
    const pending = mapWithConcurrency([0, 1, 2, 3], 2, async (index) => {
      started.push(index);
      return index === 0 ? zero.promise : one.promise;
    });

    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    zero.reject(new Error("falló primero"));
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    one.resolve("ok");

    await expect(pending).rejects.toThrow("falló primero");
    expect(started).toEqual([0, 1]);
  });

  test("rechaza límites inválidos", async () => {
    await expect(
      mapWithConcurrency([1], 0, async (value) => value),
    ).rejects.toThrow("concurrency");
  });
});
