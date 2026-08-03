import { describe, expect, test } from "vitest";
import {
  getAccessExpiryMeta,
  isEffectivelyActiveAccess,
} from "@/lib/access/effective-status";

const now = new Date("2026-08-03T16:00:00.000Z");

describe("getAccessExpiryMeta", () => {
  test("acceso permanente", () => {
    expect(getAccessExpiryMeta("active", null, now)).toEqual({
      kind: "permanent",
      label: "acceso permanente",
      expiresAtLabel: null,
      isEffectivelyActive: true,
    });
  });

  test("acceso temporal futuro", () => {
    const result = getAccessExpiryMeta(
      "active",
      "2026-08-10T18:00:00.000Z",
      now,
    );
    expect(result.kind).toBe("temporary");
    expect(result.isEffectivelyActive).toBe(true);
    expect(result.expiresAtLabel).toBeTruthy();
  });

  test("acceso active con expires_at vencido", () => {
    const result = getAccessExpiryMeta(
      "active",
      "2026-08-03T15:00:00.000Z",
      now,
    );
    expect(result.kind).toBe("expired");
    expect(result.isEffectivelyActive).toBe(false);
    expect(result.expiresAtLabel).toBeTruthy();
  });

  test("fecha inválida no rompe", () => {
    expect(getAccessExpiryMeta("active", "no-es-fecha", now)).toEqual({
      kind: "permanent",
      label: "acceso permanente",
      expiresAtLabel: null,
      isEffectivelyActive: true,
    });
  });
});

describe("isEffectivelyActiveAccess", () => {
  test("permite renovar cuando el acceso está vencido", () => {
    expect(
      isEffectivelyActiveAccess("active", "2026-08-03T15:00:00.000Z", now),
    ).toBe(false);
  });

  test("bloquea renovación si el acceso sigue vigente", () => {
    expect(
      isEffectivelyActiveAccess("active", "2026-08-10T15:00:00.000Z", now),
    ).toBe(true);
    expect(isEffectivelyActiveAccess("active", null, now)).toBe(true);
  });
});
