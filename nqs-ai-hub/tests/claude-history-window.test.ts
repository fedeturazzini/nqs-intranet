import { describe, expect, test } from "vitest";
import {
  estimateHistoryMessageTokens,
  selectHistoryWindow,
} from "@/lib/adapters/claude-history-window";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
};

function turn(id: number, chars = 40): Message[] {
  return [
    {
      id: `user-${id}`,
      role: "user",
      content: "u".repeat(chars),
    },
    {
      id: `assistant-${id}`,
      role: "assistant",
      content: "a".repeat(chars),
    },
  ];
}

describe("selectHistoryWindow", () => {
  test("una conversación corta entra completa y conserva el orden", () => {
    const messages = [...turn(1), ...turn(2)];

    const result = selectHistoryWindow(messages, {
      tokenBudget: 10_000,
      minRecentTurns: 2,
    });

    expect(result.messages).toEqual(messages);
    expect(result.truncated).toBe(false);
    expect(result.availableTurns).toBe(2);
    expect(result.selectedTurns).toBe(2);
  });

  test("recorta una conversación larga por turnos completos desde el final", () => {
    const messages = [...turn(1), ...turn(2), ...turn(3), ...turn(4)];

    const result = selectHistoryWindow(messages, {
      tokenBudget: 100,
      minRecentTurns: 1,
    });

    expect(result.messages.map((message) => message.id)).toEqual([
      "user-3",
      "assistant-3",
      "user-4",
      "assistant-4",
    ]);
    expect(result.estimatedTokens).toBeLessThanOrEqual(100);
    expect(result.truncated).toBe(true);
  });

  test("un turno viejo con diez imágenes no se cuela en el budget", () => {
    const oldWithImages = turn(1);
    oldWithImages[0].images = Array.from(
      { length: 10 },
      (_, index) => `old/image-${index}.jpg`,
    );
    const recent = turn(2);

    const result = selectHistoryWindow([...oldWithImages, ...recent], {
      tokenBudget: 5_000,
      minRecentTurns: 1,
    });

    expect(result.messages).toEqual(recent);
    expect(result.attachmentCount).toBe(0);
    expect(result.availableEstimatedTokens).toBeGreaterThan(16_000);
    expect(result.truncated).toBe(true);
  });

  test("conserva los últimos turnos completos aunque deban exceder el budget", () => {
    const recentWithImages = turn(2);
    recentWithImages[0].images = Array.from(
      { length: 10 },
      (_, index) => `recent/image-${index}.jpg`,
    );
    const messages = [...turn(1), ...recentWithImages];

    const result = selectHistoryWindow(messages, {
      tokenBudget: 500,
      minRecentTurns: 2,
    });

    expect(result.messages).toEqual(messages);
    expect(result.mandatoryOverflow).toBe(true);
    expect(result.attachmentCount).toBe(10);
  });

  test("los documentos tienen una estimación mayor que las imágenes", () => {
    const base = { role: "user", content: "archivo" };
    const image = estimateHistoryMessageTokens({
      ...base,
      images: ["old/reference.jpg"],
    });
    const pdf = estimateHistoryMessageTokens({
      ...base,
      images: ["old/brief.pdf"],
    });

    expect(pdf).toBeGreaterThan(image);
  });
});
