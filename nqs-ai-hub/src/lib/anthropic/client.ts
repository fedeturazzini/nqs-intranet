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
// max_tokens es un TECHO de salida por request (se paga solo lo realmente
// generado). Tiene que ser POR MODELO: cada uno soporta un máximo de output
// distinto y pedir más de lo que soporta = 400 de la API.
//   - target:  lo que PEDIMOS (alto pero razonable, no el máximo absoluto).
//   - ceiling: el máximo REAL de output del modelo (catálogo oficial Anthropic,
//     claude-api/shared/models.md → "Max Output" = campo max_tokens de la Models
//     API). Haiku 4.5 = 64K · Sonnet 4.6 y Opus 4.6/4.7/4.8/5 = 128K.
// Targets: 32K general, 64K para Opus (tier premium). Clampeamos al ceiling por
// las dudas (subir el target por encima del techo real haría rechazar el request).
const MAX_TOKENS_BY_MODEL: Record<
  string,
  { target: number; ceiling: number }
> = {
  "claude-haiku-4-5": { target: 32_000, ceiling: 64_000 },
  "claude-sonnet-4-6": { target: 32_000, ceiling: 128_000 },
  "claude-sonnet-5": { target: 32_000, ceiling: 128_000 },
  "claude-opus-4-6": { target: 64_000, ceiling: 128_000 },
  "claude-opus-4-7": { target: 64_000, ceiling: 128_000 },
  "claude-opus-4-8": { target: 64_000, ceiling: 128_000 },
  "claude-opus-5": { target: 64_000, ceiling: 128_000 },
};

/**
 * Techo de tokens de salida a pedir para un modelo, clampeado a su máximo real.
 * Lo usan los 3 call sites (callClaude / streamTextOnly / streamWithFileGeneration).
 */
export function maxTokensFor(model: string): number {
  const cfg = MAX_TOKENS_BY_MODEL[model];
  if (cfg) return Math.min(cfg.target, cfg.ceiling);
  // Modelo no mapeado (no debería pasar: el selector está whitelisted). Fallback
  // conservador, por debajo del techo real de cualquier modelo vigente.
  return /haiku/i.test(model) ? 16_000 : 32_000;
}

// El SDK RECHAZA messages.create() NO-streaming si max_tokens supera ~21333
// (estima >10 min: expectedTime = 60min * maxTokens / 128000 > 10min). callClaude
// es no-streaming (solo lo usan tests/scripts; el chat usa streamClaude), así que
// clampeamos su techo a un valor seguro para que nunca tire "Streaming is required…".
// Las respuestas largas del chat van por streaming, que no tiene este límite.
const NONSTREAMING_MAX_TOKENS = 16_000;

/**
 * La code execution (server tool de Anthropic que corre Python en un sandbox y
 * genera archivos reales) requiere Sonnet 4.5+ / Opus 4.5+ / Fable 5. Haiku y
 * modelos viejos NO la soportan → si el proyecto usa uno de esos, NO agregamos
 * el tool y respondemos como hoy (solo texto). Conservador a propósito: ante la
 * duda, false, para no romper proyectos con modelos viejos.
 */
export function modelSupportsCodeExecution(model: string): boolean {
  const m = model.toLowerCase();
  if (/haiku/.test(m)) return false;
  return (
    /claude-sonnet-(4-[5-9]|[5-9])/.test(m) || // Sonnet 4.5/4.6/5+
    /claude-opus-(4-[5-9]|[5-9])/.test(m) || // Opus 4.5/4.6/4.7/4.8+
    /claude-fable-[5-9]/.test(m) // Fable 5+
  );
}

/**
 * Un archivo binario que Claude generó en el sandbox (code execution).
 * ETAPA 1: solo capturamos el `fileId` (la metadata —nombre/tipo— se resuelve
 * en la etapa 2 vía Files API; el bloque de resultado NO la trae).
 */
export type GeneratedFile = { fileId: string };

// ── Config de generación de archivos (code execution + Agent Skills) ──
// Strings verificados contra @anthropic-ai/sdk 0.98.0 (el SDK NO tiene el
// `code_execution_20260521` del skill; usa 20250825, que date-matchea la beta).
const MAX_FILE_GEN_TURNS = 8; // tope de re-envíos por pause_turn (anti loop infinito)

const CODE_EXECUTION_TOOL: Anthropic.Beta.BetaCodeExecutionTool20250825 = {
  type: "code_execution_20250825",
  name: "code_execution",
};

// Skills pre-armadas de Anthropic para generar Office/PDF reales (el sandbox ya
// trae python-docx, openpyxl, pypdf, python-pptx, etc.).
const FILE_SKILLS: Anthropic.Beta.BetaSkillParams[] = [
  { type: "anthropic", skill_id: "pdf" },
  { type: "anthropic", skill_id: "docx" },
  { type: "anthropic", skill_id: "xlsx" },
  { type: "anthropic", skill_id: "pptx" },
];

// Se infiere string[] (asignable a Array<AnthropicBeta>). `code-execution-...`
// entra por el (string & {}) de la union; skills/files-api están tipadas.
const FILE_GEN_BETAS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
  "files-api-2025-04-14",
];
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
  /** Override del techo de salida. Default: `maxTokensFor(model)` (por modelo). */
  maxTokens?: number;
  /**
   * Si true, la llamada usa el path beta con code execution + skills para
   * generar archivos reales (PDF/Word/Excel/PPT). El caller (adapter) ya validó
   * el flag `ENABLE_FILE_GENERATION` + que el modelo lo soporte. Solo aplica a
   * `streamClaude`. Default false → comportamiento actual (solo texto).
   */
  enableFileGeneration?: boolean;
};

/**
 * Resumen de UN bloque de la respuesta de Anthropic: tipo + tamaño, SIN el
 * contenido completo. Sirve para comparar ejecuciones que fallan vs las que
 * andan (log `execute.summary` en adapters/claude.ts) sin loguear texto crudo
 * (respuestas de 20k tokens → logs gigantes + datos de usuarios).
 */
export type ContentBlockSummary = {
  type: string;
  /** Caracteres del bloque — solo bloques de texto. */
  chars?: number;
  /** Nombre del server tool (sin sus parámetros). */
  toolName?: string;
  /** Subtipo interno del resultado (`bash_code_execution_result`, error, etc.). */
  resultType?: string;
  returnCode?: number;
  stdoutChars?: number;
  stderrChars?: number;
  errorCode?: string;
  /** Archivos generados — resultados Bash o Code Execution. */
  files?: number;
  /** Recorte del contenido (primeros 500 chars). SOLO si DEBUG_EXECUTE_VERBOSE=true
   *  (default off) — nunca el contenido entero. */
  snippet?: string;
  inputSnippet?: string;
  stdoutSnippet?: string;
  stderrSnippet?: string;
};

const VERBOSE_SNIPPET_CHARS = 500;

/** DEBUG_EXECUTE_VERBOSE=true habilita el recorte de contenido en los logs. */
function isVerboseLoggingEnabled(): boolean {
  return process.env.DEBUG_EXECUTE_VERBOSE === "true";
}

/**
 * Resume los content blocks de la respuesta FINAL de Anthropic (tipo + tamaño de
 * cada uno) para el log de diagnóstico. Duck-typing sobre `unknown`: sirve tanto
 * para el path normal (`Anthropic.Messages.ContentBlock[]`) como para el beta con
 * code execution (`Anthropic.Beta.BetaContentBlock[]`) sin acoplar a un tipo
 * concreto del SDK.
 */
export function summarizeContentBlocks(
  blocks: readonly unknown[],
): ContentBlockSummary[] {
  const verbose = isVerboseLoggingEnabled();
  return blocks.map((raw) => {
    const b = raw as {
      type: string;
      text?: unknown;
      name?: unknown;
      input?: unknown;
      content?: unknown;
    };
    if (b.type === "text" && typeof b.text === "string") {
      const summary: ContentBlockSummary = { type: b.type, chars: b.text.length };
      if (verbose) summary.snippet = b.text.slice(0, VERBOSE_SNIPPET_CHARS);
      return summary;
    }
    if (b.type === "server_tool_use") {
      const summary: ContentBlockSummary = {
        type: b.type,
        toolName: typeof b.name === "string" ? b.name : undefined,
      };
      if (verbose && b.input != null) {
        summary.inputSnippet = JSON.stringify(b.input).slice(
          0,
          VERBOSE_SNIPPET_CHARS,
        );
      }
      return summary;
    }
    if (
      b.type === "bash_code_execution_tool_result" ||
      b.type === "code_execution_tool_result"
    ) {
      const result = b.content as
        | {
            type?: string;
            content?: unknown[];
            return_code?: unknown;
            stdout?: unknown;
            encrypted_stdout?: unknown;
            stderr?: unknown;
            error_code?: unknown;
          }
        | undefined;
      const stdout =
        typeof result?.stdout === "string"
          ? result.stdout
          : typeof result?.encrypted_stdout === "string"
            ? result.encrypted_stdout
            : "";
      const stderr = typeof result?.stderr === "string" ? result.stderr : "";
      const summary: ContentBlockSummary = {
        type: b.type,
        resultType: result?.type,
        returnCode:
          typeof result?.return_code === "number"
            ? result.return_code
            : undefined,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
        errorCode:
          typeof result?.error_code === "string"
            ? result.error_code
            : undefined,
        files: countFileOutputs(b.content),
      };
      if (verbose) {
        if (stdout) {
          summary.stdoutSnippet = stdout.slice(0, VERBOSE_SNIPPET_CHARS);
        }
        if (stderr) {
          summary.stderrSnippet = stderr.slice(0, VERBOSE_SNIPPET_CHARS);
        }
      }
      return summary;
    }
    return { type: b.type };
  });
}

/** Cuenta outputs con `file_id` en cualquiera de las dos variantes oficiales. */
function countFileOutputs(content: unknown): number {
  const result = content as
    | { type?: string; content?: unknown[] }
    | undefined;
  if (!result || !Array.isArray(result.content)) {
    return 0;
  }
  return result.content.filter(
    (out) => typeof (out as { file_id?: unknown }).file_id === "string",
  ).length;
}

/** Extrae file_id de `bash_code_execution_*` y `code_execution_*`. */
export function extractGeneratedFilesFromBlocks(
  blocks: readonly unknown[],
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  for (const raw of blocks) {
    const block = raw as { type?: string; content?: unknown };
    if (
      block.type !== "bash_code_execution_tool_result" &&
      block.type !== "code_execution_tool_result"
    ) {
      continue;
    }
    const result = block.content as { content?: unknown[] } | undefined;
    if (!Array.isArray(result?.content)) continue;
    for (const rawOutput of result.content) {
      const output = rawOutput as { file_id?: unknown };
      if (typeof output.file_id === "string") {
        files.push({ fileId: output.file_id });
      }
    }
  }
  return files.filter(
    (file, index, all) =>
      all.findIndex((candidate) => candidate.fileId === file.fileId) === index,
  );
}

export type ClaudeResponse = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  stopReason: string | null;
  /** Archivos generados en el sandbox (solo con `enableFileGeneration`). */
  generatedFiles?: GeneratedFile[];
  /** Tipo + tamaño de cada bloque de la respuesta, para `execute.summary`. */
  contentBlocks: ContentBlockSummary[];
  /** Id del mensaje de Anthropic ("msg_…"). Identificador único de ESTA
   *  respuesta para correlacionar en los logs (no es el HTTP request-id, pero
   *  cumple el mismo rol si hiciera falta soporte de Anthropic). */
  anthropicMessageId: string | null;
  /** Tokens ESCRITOS al cache de prompt en esta llamada (prompt caching). >0 en
   *  la 1ª llamada de una conversación (se cachea el system prompt). */
  cacheCreationTokens: number;
  /** Tokens LEÍDOS del cache de prompt en esta llamada. >0 en los mensajes de
   *  seguimiento de una conversación (el system prompt sale del cache, barato). */
  cacheReadTokens: number;
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
    // callClaude es NO-streaming → clampeamos al techo seguro del SDK
    // (NONSTREAMING_MAX_TOKENS). El path largo del chat usa streamClaude.
    max_tokens: Math.min(
      options.maxTokens ?? maxTokensFor(options.model ?? DEFAULT_MODEL),
      NONSTREAMING_MAX_TOKENS,
    ),
    // Prompt caching: marcamos el system (cerebro + format instructions, ~9k
    // tokens y estable dentro de una conversación) con cache_control ephemeral.
    // La 1ª llamada lo escribe al cache; las siguientes (dentro del TTL de 5 min)
    // lo leen barato en vez de re-procesar los 9k. GA en el SDK 0.98, sin beta.
    // (TTL 1h: opción futura vía `ttl:"1h"` + beta `extended-cache-ttl`.)
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
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
    contentBlocks: summarizeContentBlocks(response.content),
    anthropicMessageId: response.id ?? null,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
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
  /** Señales de estado (ej. "generating_file"). Solo aplica al path beta. */
  onStatus?: (status: string) => void,
): Promise<ClaudeResponse> {
  const client = getClient();
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? maxTokensFor(model);

  // Path con generación de archivos (code execution + skills) — ver helper abajo.
  if (options.enableFileGeneration) {
    return streamWithFileGeneration(
      client,
      model,
      maxTokens,
      systemPrompt,
      messages,
      onText,
      onStatus,
    );
  }

  // Path text-only (comportamiento actual, sin cambios).
  return streamTextOnly(client, model, maxTokens, systemPrompt, messages, onText);
}

/**
 * Path de solo texto (el de siempre). Extraído a un helper para que
 * `streamClaude` lo reuse cuando la generación de archivos está apagada.
 */
async function streamTextOnly(
  client: Anthropic,
  model: string,
  maxTokens: number,
  systemPrompt: string,
  messages: ClaudeMessage[],
  onText?: (delta: string) => void,
): Promise<ClaudeResponse> {
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    // Prompt caching del system (ver callClaude): el cerebro se lee del cache en
    // los mensajes de seguimiento en vez de re-procesarse entero cada turno.
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
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
    contentBlocks: summarizeContentBlocks(final.content),
    anthropicMessageId: final.id ?? null,
    cacheCreationTokens: final.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * `streamClaude` con code execution + Agent Skills → Claude genera archivos
 * reales (PDF/Word/Excel/PPT) en el sandbox de Anthropic.
 *
 *   - Path beta (`client.beta.messages.stream`) con el tool `code_execution`,
 *     `container.skills` (pdf/docx/xlsx/pptx) y los beta headers.
 *   - Maneja `pause_turn`: con server-tools el loop puede pausar (~cada 10 iter);
 *     re-enviamos el turno del assistant para que la API resuma, hasta terminar
 *     o hasta `MAX_FILE_GEN_TURNS` (anti loop infinito).
 *   - Sigue streameando texto (`onText`) en cada vuelta.
 *   - ETAPA 1: captura los `file_id` de los bloques de resultado y los devuelve
 *     en `generatedFiles`. NO baja ni guarda nada (eso es la etapa 2).
 */
async function streamWithFileGeneration(
  client: Anthropic,
  model: string,
  maxTokens: number,
  systemPrompt: string,
  messages: ClaudeMessage[],
  onText?: (delta: string) => void,
  onStatus?: (status: string) => void,
): Promise<ClaudeResponse> {
  // Historia mutable: el loop de pause_turn le appendea el turno del assistant
  // para que la API resuma desde donde quedó. (MessageParam ⊆ BetaMessageParam.)
  const working = [...messages] as Anthropic.Beta.BetaMessageParam[];

  let text = "";
  let tokensInput = 0;
  let tokensOutput = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let stopReason: string | null = null;
  let anthropicMessageId: string | null = null;
  const generatedFiles: GeneratedFile[] = [];
  // Con pause_turn puede haber varias vueltas — acumulamos los bloques de TODAS
  // (no solo la última), así el resumen refleja la respuesta completa.
  const contentBlocks: ContentBlockSummary[] = [];

  for (let turn = 0; turn < MAX_FILE_GEN_TURNS; turn++) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: maxTokens,
      // Prompt caching del system (ver callClaude). Mismo literal; acá tipa
      // contra BetaTextBlockParam.
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: working,
      tools: [CODE_EXECUTION_TOOL],
      container: { skills: FILE_SKILLS },
      betas: FILE_GEN_BETAS,
    });

    if (onText) {
      stream.on("text", (delta) => onText(delta));
    }
    // Señal para la UI: cuando Claude ARRANCA a usar el tool (server_tool_use),
    // avisamos "generando archivo" para mostrar un indicador durante la espera
    // del sandbox (que es silenciosa y puede tardar).
    if (onStatus) {
      stream.on("streamEvent", (event) => {
        if (
          event.type === "content_block_start" &&
          event.content_block.type === "server_tool_use"
        ) {
          onStatus("generating_file");
        }
      });
    }

    const final = await stream.finalMessage();

    // Recorremos TODOS los bloques (no solo texto): juntamos el texto y, además,
    // capturamos los file_id de los resultados de code execution.
    const capturedBefore = generatedFiles.length;
    for (const block of final.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }
    generatedFiles.push(...extractGeneratedFilesFromBlocks(final.content));

    // Parte 4.2: instrumentación shape-agnóstica. Las skills (pdf/docx/xlsx/pptx)
    // pueden devolver el archivo con OTRA forma de bloque que la rama de arriba no
    // maneja. Contamos cuántos "file_id" hay en el contenido crudo del turno; si
    // superan a los capturados, alguna variante quedó sin manejar (mecanismo 2c
    // del filecard-audit) → lo logueamos para poder medir cuán seguido pasa antes
    // de escribir ramas de captura especulativas.
    try {
      const capturedThisTurn = generatedFiles.length - capturedBefore;
      const rawFileIds = (
        JSON.stringify(final.content).match(/"file_id"/g) ?? []
      ).length;
      if (rawFileIds > capturedThisTurn) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "code exec: file_id en el contenido NO capturado (shape de bloque no reconocido)",
            rawFileIds,
            captured: capturedThisTurn,
            blockTypes: final.content.map((b) => b.type),
          }),
        );
      }
    } catch {
      // Instrumentación best-effort: nunca rompe la generación.
    }

    tokensInput += final.usage.input_tokens;
    tokensOutput += final.usage.output_tokens;
    cacheCreationTokens += final.usage.cache_creation_input_tokens ?? 0;
    cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
    stopReason = final.stop_reason;
    anthropicMessageId = final.id ?? anthropicMessageId;
    contentBlocks.push(...summarizeContentBlocks(final.content));

    // Si no pausó, terminamos. Si pausó, appendeamos el turno del assistant y
    // volvemos a llamar (la API detecta el server_tool_use final y resume).
    if (final.stop_reason !== "pause_turn") break;
    working.push({
      role: "assistant",
      content: final.content,
    } as Anthropic.Beta.BetaMessageParam);
  }

  return {
    text,
    tokensInput,
    tokensOutput,
    stopReason,
    generatedFiles,
    contentBlocks,
    anthropicMessageId,
    cacheCreationTokens,
    cacheReadTokens,
  };
}

// ============================================================
// downloadGeneratedFile — bajar un archivo de la Files API (etapa 2)
// ============================================================

export type DownloadedFile = {
  fileId: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  bytes: Buffer;
};

/**
 * Baja un archivo que Claude generó en el sandbox (por `file_id`) usando la
 * Files API, y resuelve su metadata (nombre / mime / tamaño). El bloque de
 * resultado de code execution SOLO trae el `file_id`; el resto sale de acá.
 * (El SDK agrega solo el header `files-api-2025-04-14` en `beta.files.*`.)
 */
export async function downloadGeneratedFile(
  fileId: string,
): Promise<DownloadedFile> {
  const client = getClient();
  const meta = await client.beta.files.retrieveMetadata(fileId);
  const resp = await client.beta.files.download(fileId);
  const bytes = Buffer.from(await resp.arrayBuffer());
  return {
    fileId,
    name: meta.filename,
    mediaType: meta.mime_type,
    sizeBytes: meta.size_bytes,
    bytes,
  };
}

// ============================================================
// buildUserContent — helper para armar el content multimodal
// ============================================================

/** Adjunto ya subido: su path en Storage (define el tipo) + la signed URL. */
export type UserAttachment = { path: string; url: string };

export function buildUserContent(
  prompt: string,
  attachments?: UserAttachment[],
): Anthropic.Messages.ContentBlockParam[] {
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  if (attachments && attachments.length > 0) {
    // Convención de la API: los adjuntos ANTES del texto dan mejores
    // resultados (Anthropic lo recomienda para vision y documentos).
    // Todo va con `source: { type: "url" }` (signed URL de Supabase, que
    // Anthropic descarga server-side). El tipo de bloque sale de la
    // extensión del path: .pdf → `document`; el resto → `image`. El source
    // url NO necesita `media_type` (solo lo pide el source base64).
    for (const { path, url } of attachments) {
      if (path.toLowerCase().endsWith(".pdf")) {
        blocks.push({ type: "document", source: { type: "url", url } });
      } else {
        blocks.push({ type: "image", source: { type: "url", url } });
      }
    }
  }
  blocks.push({ type: "text", text: prompt });
  return blocks;
}
