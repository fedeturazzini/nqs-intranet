/**
 * Tests del validador de horarios (`lib/utils/schedule`).
 *
 * Probamos solo lógica pura — sin DB ni mocks pesados. Construimos
 * `Date` específicos para verificar que la TZ Argentina se aplica bien
 * incluso si el server corriera en UTC.
 *
 * Argentina = UTC-3 (sin DST hace años — desde 2009). Las fechas en
 * los tests son UTC; el helper las convierte a hora local AR antes de
 * comparar.
 */
import { describe, expect, test } from "vitest";
import { checkSchedule, nowInArgentina } from "@/lib/utils/schedule";
import type { ToolSchedule } from "@/types/db-aliases";

// ============================================================
// Helpers
// ============================================================
// Fecha UTC que en AR (UTC-3) cae el LUNES 26 de mayo de 2026 a las
// 10:30 AR (= 13:30 UTC).
const mondayLunes_1030AR = new Date("2026-05-25T13:30:00Z");
// Mismo lunes pero 7:00 AM AR (antes de las 9).
const mondayLunes_0700AR = new Date("2026-05-25T10:00:00Z");
// Sábado 23 de mayo a las 22:00 AR = 24 de mayo 01:00 UTC.
const saturdaySabado_2200AR = new Date("2026-05-24T01:00:00Z");

describe("nowInArgentina", () => {
  test("convierte UTC → AR correctamente (UTC-3)", () => {
    const r = nowInArgentina(mondayLunes_1030AR);
    expect(r.day).toBe("monday");
    expect(r.time).toBe("10:30");
  });
  test("identifica el sábado correctamente", () => {
    const r = nowInArgentina(saturdaySabado_2200AR);
    expect(r.day).toBe("saturday");
    expect(r.time).toBe("22:00");
  });
});

describe("checkSchedule", () => {
  test("schedule null/undefined → siempre allow", () => {
    expect(checkSchedule(null, mondayLunes_1030AR).allowed).toBe(true);
    expect(checkSchedule(undefined, mondayLunes_0700AR).allowed).toBe(true);
    expect(checkSchedule({}, saturdaySabado_2200AR).allowed).toBe(true);
  });

  test("dentro de la ventana → allow", () => {
    const sched: ToolSchedule = {
      monday: { enabled: true, from: "09:00", to: "18:00" },
    };
    const r = checkSchedule(sched, mondayLunes_1030AR);
    expect(r.allowed).toBe(true);
  });

  test("antes de from → outside_hours", () => {
    const sched: ToolSchedule = {
      monday: { enabled: true, from: "09:00", to: "18:00" },
    };
    const r = checkSchedule(sched, mondayLunes_0700AR);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("outside_hours");
  });

  test("día no listado → day_disabled (porque la schedule no lo declara)", () => {
    const sched: ToolSchedule = {
      monday: { enabled: true, from: "09:00", to: "18:00" },
    };
    const r = checkSchedule(sched, saturdaySabado_2200AR);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("day_disabled");
  });

  test("día con enabled:false → day_disabled", () => {
    const sched: ToolSchedule = {
      monday: { enabled: true, from: "09:00", to: "18:00" },
      saturday: { enabled: false },
    };
    const r = checkSchedule(sched, saturdaySabado_2200AR);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("day_disabled");
  });

  test("borde superior de la ventana es exclusivo (time === to → block)", () => {
    const sched: ToolSchedule = {
      monday: { enabled: true, from: "09:00", to: "18:00" },
    };
    // 18:00 AR el lunes = 21:00 UTC.
    const at1800 = new Date("2026-05-25T21:00:00Z");
    const r = checkSchedule(sched, at1800);
    expect(r.allowed).toBe(false);
  });
});
