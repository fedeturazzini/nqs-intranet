/**
 * Ventana de historial para Claude: recorta lo que se manda a Anthropic
 * cuando la conversación supera un budget de tokens estimados.
 *
 * La UI / DB siguen con el historial completo. Solo cambia el payload.
 * El system brain no se toca acá.
 */

export const DEFAULT_HISTORY_TOKEN_BUDGET = 50_000;

/** Tope del resumen heurístico (~1.5k tokens). */
const SUMMARY_MAX_CHARS = 6_000;

/** Por entrada en el resumen (prompt user o fragmento assistant). */
const SUMMARY_ENTRY_MAX_CHARS = 400;

const SUMMARY_USER_PREFIX = "<conversation_summary>\n";
const SUMMARY_USER_SUFFIX =
  "\n</conversation_summary>\nContinuá con este contexto previo.";
const SUMMARY_ASSISTANT =
  "Entendido. Tengo el resumen del contexto previo.";

export type HistoryWindowMessage = {
  role: string;
  content: string;
};

export type TrimHistoryResult = {
  messages: HistoryWindowMessage[];
  truncated: boolean;
  droppedCount: number;
  keptCount: number;
  estimatedTokens: number;
  summaryIncluded: boolean;
};

/** Misma heurística que admin prompts: 1 token ≈ 4 chars. */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

export function resolveHistoryTokenBudget(
  envValue: string | undefined = process.env.CLAUDE_HISTORY_TOKEN_BUDGET,
): number {
  if (envValue == null || envValue.trim() === "") {
    return DEFAULT_HISTORY_TOKEN_BUDGET;
  }
  const parsed = Number.parseInt(envValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_HISTORY_TOKEN_BUDGET;
  }
  return parsed;
}

function truncateContentToTokens(content: string, maxTokens: number): string {
  if (maxTokens <= 0) return "…[truncated]";
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) return content;
  const marker = "…[truncated]";
  const sliceAt = Math.max(0, maxChars - marker.length);
  return `${content.slice(0, sliceAt)}${marker}`;
}

function clipEntry(text: string, maxChars: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Resumen heurístico de mensajes descartados: prioriza prompts user
 * (más recientes primero); assistants solo si queda cupo.
 */
export function buildHeuristicSummary(
  dropped: HistoryWindowMessage[],
  maxChars: number = SUMMARY_MAX_CHARS,
): string {
  if (dropped.length === 0 || maxChars <= 0) return "";

  const lines: string[] = [];
  let used = 0;

  const pushLine = (line: string): boolean => {
    const next = used === 0 ? line.length : used + 1 + line.length;
    if (next > maxChars) return false;
    lines.push(line);
    used = next;
    return true;
  };

  for (let i = dropped.length - 1; i >= 0; i--) {
    const m = dropped[i];
    if (m.role !== "user") continue;
    if (!pushLine(`User: ${clipEntry(m.content, SUMMARY_ENTRY_MAX_CHARS)}`)) {
      break;
    }
  }

  for (let i = dropped.length - 1; i >= 0; i--) {
    const m = dropped[i];
    if (m.role !== "assistant") continue;
    if (
      !pushLine(`Assistant: ${clipEntry(m.content, SUMMARY_ENTRY_MAX_CHARS)}`)
    ) {
      break;
    }
  }

  return lines.join("\n");
}

function summaryPair(body: string): HistoryWindowMessage[] {
  return [
    {
      role: "user",
      content: `${SUMMARY_USER_PREFIX}${body}${SUMMARY_USER_SUFFIX}`,
    },
    { role: "assistant", content: SUMMARY_ASSISTANT },
  ];
}

function totalTokens(messages: HistoryWindowMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/**
 * Índice de inicio del sufijo que entra en `budgetTokens`.
 * Si ni el último mensaje entra, devuelve `prior.length - 1` (hay que
 * truncar ese content).
 */
function findKeepStart(
  prior: HistoryWindowMessage[],
  budgetTokens: number,
): number {
  const total = prior.length;
  let keptTokens = 0;
  let start = total;

  for (let i = total - 1; i >= 0; i--) {
    const t = estimateTokens(prior[i].content);
    if (keptTokens + t > budgetTokens) {
      if (start === total) {
        // Nada entra entero: nos quedamos con el último y lo truncamos después.
        return total - 1;
      }
      break;
    }
    keptTokens += t;
    start = i;
  }

  return start;
}

/**
 * Recorta el historial previo a un budget de tokens estimados.
 * No incluye el mensaje actual del user (eso lo agrega el adapter).
 */
export function trimHistoryToBudget(
  prior: HistoryWindowMessage[],
  budgetTokens: number,
): TrimHistoryResult {
  const total = prior.length;
  if (total === 0) {
    return {
      messages: [],
      truncated: false,
      droppedCount: 0,
      keptCount: 0,
      estimatedTokens: 0,
      summaryIncluded: false,
    };
  }

  // Budget 0: no mandamos historial (tampoco resumen: no hay cupo útil).
  if (budgetTokens <= 0) {
    return {
      messages: [],
      truncated: true,
      droppedCount: total,
      keptCount: 0,
      estimatedTokens: 0,
      summaryIncluded: false,
    };
  }

  const fullTokens = totalTokens(prior);
  if (fullTokens <= budgetTokens) {
    return {
      messages: prior.map((m) => ({ role: m.role, content: m.content })),
      truncated: false,
      droppedCount: 0,
      keptCount: total,
      estimatedTokens: fullTokens,
      summaryIncluded: false,
    };
  }

  let keepStart = findKeepStart(prior, budgetTokens);

  // Alinear a user: si el corte cae en assistant(s), avanzar; si nos pasamos
  // del final, retroceder al último user del historial.
  while (keepStart < total && prior[keepStart].role !== "user") {
    keepStart += 1;
  }
  if (keepStart >= total) {
    keepStart = total - 1;
    while (keepStart > 0 && prior[keepStart].role !== "user") {
      keepStart -= 1;
    }
  }

  let kept: HistoryWindowMessage[] = prior.slice(keepStart).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Encajar en budget: soltar desde el final (nunca el primer mensaje del
  // corte, que queremos que sea user cuando exista).
  while (kept.length > 1 && totalTokens(kept) > budgetTokens) {
    kept.pop();
  }
  if (kept.length > 0 && totalTokens(kept) > budgetTokens) {
    kept = [
      {
        role: kept[0].role,
        content: truncateContentToTokens(kept[0].content, budgetTokens),
      },
    ];
  }

  // Si por algún edge case el head sigue siendo assistant (historial sin
  // ningún user), lo dejamos truncado — mejor eso que vacío.
  const droppedForSummary = prior.slice(0, keepStart);
  const summaryBody = buildHeuristicSummary(droppedForSummary);
  const summaryIncluded = summaryBody.length > 0;
  const summaryMessages = summaryIncluded ? summaryPair(summaryBody) : [];

  // El resumen es overhead acotado (~1.5k); el plan acepta budget + resumen.
  const messages = [...summaryMessages, ...kept];

  return {
    messages,
    truncated: true,
    droppedCount: total - kept.length,
    keptCount: kept.length,
    estimatedTokens: totalTokens(messages),
    summaryIncluded,
  };
}
