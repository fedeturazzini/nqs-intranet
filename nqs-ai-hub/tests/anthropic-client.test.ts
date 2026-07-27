/**
 * Tests de lib/anthropic/client — callClaude + buildUserContent.
 *
 * Mockeamos el SDK `@anthropic-ai/sdk`: el constructor devuelve un
 * objeto con `messages.create` controlable por test. El retry con
 * backoff lo maneja el SDK internamente (maxRetries=3) — no lo
 * re-testeamos acá, solo verificamos que el cliente se construye con
 * esa config y que los errores se PROPAGAN (el adapter los envuelve
 * en Result).
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type CreateFn = (...args: unknown[]) => Promise<unknown>;
let mockCreate: CreateFn = async () => ({
  content: [{ type: "text", text: "respuesta default" }],
  usage: { input_tokens: 10, output_tokens: 5 },
  stop_reason: "end_turn",
});
const constructorArgs: Record<string, unknown>[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages: { create: CreateFn };
      constructor(opts: Record<string, unknown>) {
        constructorArgs.push(opts);
        this.messages = { create: (...a: unknown[]) => mockCreate(...a) };
      }
    },
  };
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
});

const { callClaude, buildUserContent, maxTokensFor } = await import(
  "@/lib/anthropic/client"
);

describe("callClaude", () => {
  test("llamada exitosa devuelve texto + tokens", async () => {
    mockCreate = async () => ({
      content: [{ type: "text", text: "hola desde claude" }],
      usage: { input_tokens: 42, output_tokens: 7 },
      stop_reason: "end_turn",
    });
    const r = await callClaude("system", [
      { role: "user", content: "hola" },
    ]);
    expect(r.text).toBe("hola desde claude");
    expect(r.tokensInput).toBe(42);
    expect(r.tokensOutput).toBe(7);
    expect(r.stopReason).toBe("end_turn");
  });

  test("concatena múltiples text blocks e ignora otros tipos", async () => {
    mockCreate = async () => ({
      content: [
        { type: "text", text: "parte 1" },
        { type: "tool_use", id: "x", name: "y", input: {} },
        { type: "text", text: "parte 2" },
      ],
      usage: { input_tokens: 1, output_tokens: 2 },
      stop_reason: "end_turn",
    });
    const r = await callClaude("sys", [{ role: "user", content: "x" }]);
    expect(r.text).toBe("parte 1\nparte 2");
  });

  test("error de la API se PROPAGA (no se traga)", async () => {
    mockCreate = async () => {
      throw new Error("529 overloaded");
    };
    await expect(
      callClaude("sys", [{ role: "user", content: "x" }]),
    ).rejects.toThrow("529 overloaded");
  });

  test("el cliente se construye con maxRetries=3 y timeout", async () => {
    mockCreate = async () => ({
      content: [{ type: "text", text: "x" }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    });
    await callClaude("sys", [{ role: "user", content: "x" }]);
    // El cliente se cachea, así que el primer constructorArgs tiene la config.
    const opts = constructorArgs[0];
    expect(opts).toBeDefined();
    expect(opts.maxRetries).toBe(3);
    expect(typeof opts.timeout).toBe("number");
  });
});

describe("maxTokensFor", () => {
  test("Opus (4.6/4.7/4.8/5) → 64000", () => {
    for (const m of [
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-opus-5",
    ]) {
      expect(maxTokensFor(m)).toBe(64_000);
    }
  });

  test("Sonnet 4.6 y Haiku 4.5 → 32000", () => {
    expect(maxTokensFor("claude-sonnet-4-6")).toBe(32_000);
    expect(maxTokensFor("claude-haiku-4-5")).toBe(32_000);
  });

  test("modelo desconocido → fallback (16000 haiku-like / 32000 resto)", () => {
    expect(maxTokensFor("claude-haiku-9-9")).toBe(16_000);
    expect(maxTokensFor("modelo-raro")).toBe(32_000);
  });

  test("nunca supera el techo real del modelo", () => {
    // Haiku 4.5 topa en 64K; el resto en 128K. El target (32K/64K) siempre entra.
    expect(maxTokensFor("claude-haiku-4-5")).toBeLessThanOrEqual(64_000);
    expect(maxTokensFor("claude-opus-5")).toBeLessThanOrEqual(128_000);
  });
});

describe("buildUserContent", () => {
  test("solo texto → 1 block de texto", () => {
    const blocks = buildUserContent("hola");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ type: "text", text: "hola" });
  });

  test("imágenes ANTES del texto, como source url", () => {
    const blocks = buildUserContent("describí esto", [
      { path: "user_x/c/img1.png", url: "https://signed/img1.png" },
      { path: "user_x/c/img2.png", url: "https://signed/img2.png" },
    ]);
    // 2 imágenes + 1 texto, en ese orden.
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({
      type: "image",
      source: { type: "url", url: "https://signed/img1.png" },
    });
    expect(blocks[1]).toEqual({
      type: "image",
      source: { type: "url", url: "https://signed/img2.png" },
    });
    expect(blocks[2]).toEqual({ type: "text", text: "describí esto" });
  });

  test("el .pdf va como bloque document; la imagen como image", () => {
    const blocks = buildUserContent("resumí", [
      { path: "user_x/c/a.jpg", url: "https://signed/a.jpg" },
      { path: "user_x/c/b.pdf", url: "https://signed/b.pdf" },
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({
      type: "image",
      source: { type: "url", url: "https://signed/a.jpg" },
    });
    expect(blocks[1]).toEqual({
      type: "document",
      source: { type: "url", url: "https://signed/b.pdf" },
    });
    expect(blocks[2]).toEqual({ type: "text", text: "resumí" });
  });
});
