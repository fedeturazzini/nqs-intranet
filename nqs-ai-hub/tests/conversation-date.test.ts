import { describe, expect, test } from "vitest";
import { getConversationDateMeta } from "@/components/tool/conversation-date";

function localTimestamp(
  year: number,
  month: number,
  day: number,
  hour = 10,
  minute = 30,
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

const now = new Date(2026, 7, 1, 15, 0);

describe("getConversationDateMeta", () => {
  test("agrupa hoy y muestra la hora", () => {
    const result = getConversationDateMeta(
      localTimestamp(2026, 8, 1, 9, 5),
      now,
    );

    expect(result.group).toBe("today");
    expect(result.compact).toMatch(/09:05/);
    expect(result.exact).toBeTruthy();
  });

  test("agrupa ayer con una etiqueta explícita", () => {
    const result = getConversationDateMeta(localTimestamp(2026, 7, 31), now);

    expect(result.group).toBe("yesterday");
    expect(result.compact).toMatch(/^ayer · /);
  });

  test("incluye hasta siete días atrás en el grupo reciente", () => {
    const result = getConversationDateMeta(localTimestamp(2026, 7, 25), now);

    expect(result.group).toBe("last-seven-days");
    expect(result.compact).toContain("jul");
  });

  test("agrupa fechas más antiguas como anteriores", () => {
    const result = getConversationDateMeta(localTimestamp(2026, 7, 24), now);

    expect(result.group).toBe("older");
  });

  test("incluye el año cuando la actividad es de otro año", () => {
    const result = getConversationDateMeta(localTimestamp(2025, 12, 31), now);

    expect(result.group).toBe("older");
    expect(result.compact).toContain("2025");
  });

  test.each([null, "", "fecha-inválida"])(
    "tolera timestamps ausentes o inválidos: %s",
    (timestamp) => {
      expect(getConversationDateMeta(timestamp, now)).toEqual({
        group: "older",
        compact: null,
        exact: null,
      });
    },
  );
});
