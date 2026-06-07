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
 *   - Modelo default: `claude-sonnet-4-6` (Sonnet 4.6 — feb 2026). Solo
 *     se usa como fallback si el `system_prompts.model` activo viene
 *     vacío (caso edge: data corrupta o seed manual). En producción el
 *     modelo se lee dinámicamente desde DB → adapter pasa `options.model`
 *     al SDK por cada call.
 */
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
// Sonnet/Opus soportan hasta 8192 tokens de salida; Haiku hasta 4096. Subido
// de 4096 → 8192 para que las respuestas/artifacts largos no se corten (el
// header mostraba "OUT 4096" exacto = respuesta cortada por el techo).
export const DEFAULT_MAX_TOKENS = 8192;

/** Techo de tokens de salida según el modelo (Haiku tope 4096). */
export function maxTokensFor(model: string): number {
  return /haiku/i.test(model) ? 4096 : DEFAULT_MAX_TOKENS;
}
// Con streaming el timeout se "renueva" por chunk, así que generaciones
// largas no se cortan. Igual dejamos un techo generoso por las dudas.
const DEFAULT_TIMEOUT_MS = 120_000;
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
  /** Override del modelo. Default: `claude-sonnet-4-6`. */
  model?: string;
  /** Default: 8192 (Haiku: 4096). */
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
    max_tokens: options.maxTokens ?? maxTokensFor(options.model ?? DEFAULT_MODEL),
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
// streamClaude — versión con streaming
// ============================================================
// Usa `messages.stream()` en vez de `.create()`. Ventajas:
//   - El timeout se renueva por chunk → generaciones largas (prompts
//     grandes + respuestas largas) NO se cortan con "Request timed out".
//   - `onText(delta)` se llama por cada fragmento de texto → la UI puede
//     mostrar la respuesta a medida que se genera (como Claude original).
// Devuelve igual el resultado final acumulado (texto + tokens).

/**
 * Como `callClaude` pero con streaming. Si se pasa `onText`, se invoca por
 * cada delta de texto. Resuelve con la respuesta completa al terminar.
 */
export async function streamClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: CallClaudeOptions = {},
  onText?: (delta: string) => void,
): Promise<ClaudeResponse> {
  const client = getClient();

  const stream = client.messages.stream({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? maxTokensFor(options.model ?? DEFAULT_MODEL),
    system: systemPrompt,
    messages,
  });

  if (onText) {
    stream.on("text", (delta) => onText(delta));
  }

  const final = await stream.finalMessage();
  const textBlocks = final.content.filter(
    (b): b is Anthropic.Messages.TextBlock => b.type === "text",
  );
  const text = textBlocks.map((b) => b.text).join("\n");

  return {
    text,
    tokensInput: final.usage.input_tokens,
    tokensOutput: final.usage.output_tokens,
    stopReason: final.stop_reason,
  };
}

// ============================================================
// buildUserContent — helper para armar el content multimodal
// ============================================================

export function buildUserContent(
  prompt: string,
  imageUrls?: string[],
): Anthropic.Messages.ContentBlockParam[] {
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  if (imageUrls && imageUrls.length > 0) {
    // Convención de la API: imágenes ANTES del texto da mejores
    // resultados (Anthropic lo recomienda en sus docs de vision).
    // Usamos `source: { type: "url" }` con signed download URLs de
    // Supabase Storage — Anthropic las descarga server-side.
    for (const url of imageUrls) {
      blocks.push({
        type: "image",
        source: { type: "url", url },
      });
    }
  }
  blocks.push({ type: "text", text: prompt });
  return blocks;
}
