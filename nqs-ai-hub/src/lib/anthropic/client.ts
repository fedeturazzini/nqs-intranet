/**
 * Cliente único de Anthropic + helper `callClaude`.
 *
 * Server-only — la `ANTHROPIC_API_KEY` nunca puede llegar al browser.
 *
 * Decisiones:
 *   - SDK con `maxRetries: 3` + `timeout: 60_000` (uso lo built-in
 *     en vez de armar mi propio loop con backoff). El SDK hace
 *     exponential backoff entre intentos y solo reintenta en errores
 *     transients (5xx, 408, 429, network failures). NO reintenta 4xx
 *     que son bugs nuestros.
 *   - Lazy init del cliente: la API key se valida la primera vez que
 *     se usa, no al levantar el módulo. Esto permite tests/scripts que
 *     no necesiten Anthropic sin tener que stubear la env.
 *   - Modelo default: `claude-sonnet-4-5` (Sonnet 4.5 — el modelo más
 *     reciente al cierre del proyecto). El kit menciona `claude-sonnet-4-6`
 *     pero ese alias no resuelve hoy en la API; lo dejamos como TODO de
 *     bump cuando Anthropic lo publique. Override por `model` en el call.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ExecuteImage } from "@/lib/adapters/types";

export const DEFAULT_MODEL = "claude-sonnet-4-5";
export const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;

let cached: Anthropic | null = null;

function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no está definida. Pegala en .env.local (provista por NQS).",
    );
  }
  cached = new Anthropic({
    apiKey,
    maxRetries: DEFAULT_MAX_RETRIES,
    timeout: DEFAULT_TIMEOUT_MS,
  });
  return cached;
}

// ============================================================
// callClaude
// ============================================================
// Wrapper sobre `messages.create` con la forma que usamos en el
// proyecto: 1 system prompt + 1 user message (texto + imágenes
// opcionales). Para multi-turn conversations, el caller construye el
// array `messages` con la historia previa y lo pasa entero.

export type ClaudeMessage = Anthropic.Messages.MessageParam;

export type CallClaudeOptions = {
  /** Override del modelo. Default: `claude-sonnet-4-5`. */
  model?: string;
  /** Default: 4096. */
  maxTokens?: number;
};

export type ClaudeResponse = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  stopReason: string | null;
};

/**
 * Llama al modelo. Tira excepción si la API falla — el caller la
 * captura y la envuelve en su propio `Result`.
 */
export async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: CallClaudeOptions = {},
): Promise<ClaudeResponse> {
  const client = getClient();

  const response = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  // `content` puede ser texto, tool-use, etc. Para el wrapper Claude
  // del MVP solo esperamos text — los otros tipos los ignoramos.
  const textBlocks = response.content.filter(
    (b): b is Anthropic.Messages.TextBlock => b.type === "text",
  );
  const text = textBlocks.map((b) => b.text).join("\n");

  return {
    text,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    stopReason: response.stop_reason,
  };
}

// ============================================================
// buildUserContent — helper para armar el content multimodal
// ============================================================

export function buildUserContent(
  prompt: string,
  images?: ExecuteImage[],
): Anthropic.Messages.ContentBlockParam[] {
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  if (images && images.length > 0) {
    // Convención de la API: imágenes ANTES del texto da mejores
    // resultados (Anthropic lo recomienda en sus docs de vision).
    for (const img of images) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type,
          data: img.data,
        },
      });
    }
  }
  blocks.push({ type: "text", text: prompt });
  return blocks;
}
