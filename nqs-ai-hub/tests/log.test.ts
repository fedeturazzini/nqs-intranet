/**
 * Tests del logger central (src/lib/log). Espía console.* y verifica la forma
 * de la línea JSON + la normalización de errores.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { logInfo, logWarn, logError } from "@/lib/log";

function capture(level: "log" | "warn" | "error") {
  return vi.spyOn(console, level).mockImplementation(() => {});
}

afterEach(() => vi.restoreAllMocks());

describe("log helper", () => {
  test("logError emite JSON estructurado por console.error", () => {
    const spy = capture("error");
    logError("boom", { route: "x/y", userId: "u1", status: 500, reason: "r" });
    expect(spy).toHaveBeenCalledOnce();
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      level: "error",
      msg: "boom",
      route: "x/y",
      userId: "u1",
      status: 500,
      reason: "r",
    });
    expect(typeof line.ts).toBe("string");
  });

  test("normaliza Error nativo a su .message", () => {
    const spy = capture("error");
    logError("boom", { err: new Error("kaboom") });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.err).toBe("kaboom");
  });

  test("normaliza error-like de Supabase (objeto con .message, NO Error)", () => {
    const spy = capture("warn");
    logWarn("db", { err: { message: "pg down", code: "500" } });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.err).toBe("pg down");
  });

  test("logInfo va por console.log y omite err si no se pasa", () => {
    const spy = capture("log");
    logInfo("ok", { userId: "u1" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.level).toBe("info");
    expect("err" in line).toBe(false);
  });
});
