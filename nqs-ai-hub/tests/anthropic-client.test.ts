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

const { callClaude, buildUserContent } = await import(
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

describe("buildUserContent", () => {
  test("solo texto → 1 block de texto", () => {
    const blocks = buildUserContent("hola");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ type: "text", text: "hola" });
  });

  test("imágenes ANTES del texto, como source url", () => {
    const blocks = buildUserContent("describí esto", [
      "https://signed/img1.png",
      "https://signed/img2.png",
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
});
