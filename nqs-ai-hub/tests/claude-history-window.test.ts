import { describe, expect, test } from "vitest";
import {
  buildHeuristicSummary,
  estimateTokens,
  resolveHistoryTokenBudget,
  trimHistoryToBudget,
  type HistoryWindowMessage,
} from "@/lib/adapters/claude-history-window";

function msg(
  role: "user" | "assistant",
  content: string,
): HistoryWindowMessage {
  return { role, content };
}

/** Contenido con ~N tokens estimados (4 chars/token). */
function filler(tokens: number, label = "x"): string {
  return label.repeat(Math.max(0, tokens * 4));
}

describe("estimateTokens", () => {
  test("ceil(chars/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("resolveHistoryTokenBudget", () => {
  test("default 50000", () => {
    expect(resolveHistoryTokenBudget(undefined)).toBe(50_000);
    expect(resolveHistoryTokenBudget("")).toBe(50_000);
    expect(resolveHistoryTokenBudget("  ")).toBe(50_000);
  });

  test("parsea entero válido inclusive 0", () => {
    expect(resolveHistoryTokenBudget("80000")).toBe(80_000);
    expect(resolveHistoryTokenBudget("0")).toBe(0);
  });

  test("inválido → default", () => {
    expect(resolveHistoryTokenBudget("nope")).toBe(50_000);
    expect(resolveHistoryTokenBudget("-10")).toBe(50_000);
  });
});

describe("trimHistoryToBudget", () => {
  test("chat corta: no trunca, sin resumen", () => {
    const prior = [
      msg("user", "hola"),
      msg("assistant", "qué tal"),
      msg("user", "bien"),
    ];
    const result = trimHistoryToBudget(prior, 50_000);
    expect(result.truncated).toBe(false);
    expect(result.summaryIncluded).toBe(false);
    expect(result.droppedCount).toBe(0);
    expect(result.keptCount).toBe(3);
    expect(result.messages).toEqual(prior);
  });

  test("historial vacío", () => {
    const result = trimHistoryToBudget([], 100);
    expect(result).toMatchObject({
      messages: [],
      truncated: false,
      droppedCount: 0,
      keptCount: 0,
      estimatedTokens: 0,
      summaryIncluded: false,
    });
  });

  test("budget 0: sin mensajes ni resumen", () => {
    const prior = [msg("user", "a"), msg("assistant", "b")];
    const result = trimHistoryToBudget(prior, 0);
    expect(result.truncated).toBe(true);
    expect(result.messages).toEqual([]);
    expect(result.summaryIncluded).toBe(false);
    expect(result.droppedCount).toBe(2);
    expect(result.keptCount).toBe(0);
  });

  test("supera budget: deja recientes, truncated, arranca en user", () => {
    const prior = [
      msg("user", filler(100, "A")),
      msg("assistant", filler(100, "B")),
      msg("user", filler(100, "C")),
      msg("assistant", filler(100, "D")),
      msg("user", filler(50, "E")),
      msg("assistant", filler(50, "F")),
    ];
    // Solo entran los últimos ~100 tokens de historial reciente.
    const result = trimHistoryToBudget(prior, 120);
    expect(result.truncated).toBe(true);
    expect(result.summaryIncluded).toBe(true);
    expect(result.messages[0]?.role).toBe("user");
    expect(result.messages[0]?.content).toContain("<conversation_summary>");
    expect(result.messages[1]?.role).toBe("assistant");
    // Tras el par resumen, empieza en user.
    expect(result.messages[2]?.role).toBe("user");
    expect(result.keptCount).toBeGreaterThan(0);
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.keptCount + result.droppedCount).toBe(prior.length);
  });

  test("no deja assistant huérfano al inicio del historial enviado", () => {
    const prior = [
      msg("user", filler(80, "U1")),
      msg("assistant", filler(80, "A1")),
      msg("user", filler(80, "U2")),
      msg("assistant", filler(80, "A2")),
    ];
    // Budget que naturalmente cortaría dejando A2 + algo → alinear a user.
    const result = trimHistoryToBudget(prior, 100);
    expect(result.truncated).toBe(true);
    const afterSummary = result.summaryIncluded
      ? result.messages.slice(2)
      : result.messages;
    if (afterSummary.length > 0) {
      expect(afterSummary[0].role).toBe("user");
    }
  });

  test("mensaje único > budget: trunca content, no tira todo", () => {
    const prior = [msg("user", filler(500, "Z"))];
    const result = trimHistoryToBudget(prior, 50);
    expect(result.truncated).toBe(true);
    expect(result.keptCount).toBe(1);
    expect(result.messages.some((m) => m.content.includes("…[truncated]"))).toBe(
      true,
    );
    expect(estimateTokens(result.messages.at(-1)!.content)).toBeLessThanOrEqual(
      50,
    );
  });

  test("resumen solo si hubo drop; longitud acotada", () => {
    const prior = [
      msg("user", filler(200, "old")),
      msg("assistant", filler(200, "oldA")),
      msg("user", filler(30, "new")),
      msg("assistant", filler(30, "newA")),
    ];
    const short = trimHistoryToBudget(prior, 50_000);
    expect(short.summaryIncluded).toBe(false);

    const long = trimHistoryToBudget(prior, 80);
    expect(long.summaryIncluded).toBe(true);
    const summaryMsg = long.messages[0];
    expect(summaryMsg?.content).toContain("<conversation_summary>");
    // Cuerpo del resumen acotado (~6k chars) + wrappers.
    expect(summaryMsg!.content.length).toBeLessThan(7_500);
  });
});

describe("buildHeuristicSummary", () => {
  test("prioriza users y respeta maxChars", () => {
    const dropped = [
      msg("user", "primera"),
      msg("assistant", "resp1"),
      msg("user", "segunda"),
    ];
    const summary = buildHeuristicSummary(dropped, 80);
    expect(summary).toContain("User:");
    expect(summary.length).toBeLessThanOrEqual(80);
  });
});
