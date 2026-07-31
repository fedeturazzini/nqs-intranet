/**
 * Budget aproximado dedicado EXCLUSIVAMENTE al historial previo. El system
 * prompt, la memoria, el mensaje actual y la salida tienen margen separado
 * dentro de la ventana de contexto del modelo.
 */
export const HISTORY_TOKEN_BUDGET = 48_000;

/**
 * Guardia de payload DB: traemos como máximo los mensajes más recientes y
 * dentro de ellos aplicamos el budget real. No es el criterio de contexto del
 * modelo; evita descargar conversaciones históricas ilimitadas solo para luego
 * descartarlas en memoria.
 */
export const HISTORY_FETCH_MESSAGE_LIMIT = 200;

/**
 * Conservamos siempre los intercambios más recientes completos, incluso si un
 * turno excepcionalmente grande hace superar el budget. Nunca cortamos una
 * pregunta de su respuesta.
 */
export const MIN_RECENT_HISTORY_TURNS = 2;

const CHARS_PER_TOKEN_ESTIMATE = 4;
const MESSAGE_OVERHEAD_TOKENS = 12;
const IMAGE_ATTACHMENT_TOKENS = 1_600;
const DOCUMENT_ATTACHMENT_TOKENS = 8_000;

export type HistoryBudgetMessage = {
  role: string;
  content: string;
  images?: unknown;
};

export type HistoryWindowResult<T> = {
  messages: T[];
  estimatedTokens: number;
  availableEstimatedTokens: number;
  attachmentCount: number;
  availableMessages: number;
  availableTurns: number;
  selectedTurns: number;
  truncated: boolean;
  mandatoryOverflow: boolean;
};

function attachmentPaths(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export function estimateHistoryMessageTokens(
  message: HistoryBudgetMessage,
): number {
  const textTokens =
    Math.ceil(message.content.length / CHARS_PER_TOKEN_ESTIMATE) +
    MESSAGE_OVERHEAD_TOKENS;
  const attachmentTokens = attachmentPaths(message.images).reduce(
    (total, path) =>
      total +
      (path.toLowerCase().endsWith(".pdf")
        ? DOCUMENT_ATTACHMENT_TOKENS
        : IMAGE_ATTACHMENT_TOKENS),
    0,
  );
  return textTokens + attachmentTokens;
}

/**
 * Agrupa user + assistant(s) hasta el próximo user. Tolera mensajes huérfanos
 * de persistencias viejas, pero jamás parte un grupo al seleccionar la ventana.
 */
function groupHistoryTurns<T extends HistoryBudgetMessage>(
  messages: T[],
): T[][] {
  const turns: T[][] = [];
  let current: T[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      if (current.length > 0) turns.push(current);
      current = [message];
    } else if (current.length > 0) {
      current.push(message);
    } else {
      // Assistant huérfano al comienzo: se conserva como unidad indivisible.
      turns.push([message]);
    }
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

export function selectHistoryWindow<T extends HistoryBudgetMessage>(
  orderedMessages: T[],
  options: {
    tokenBudget?: number;
    minRecentTurns?: number;
  } = {},
): HistoryWindowResult<T> {
  const tokenBudget = options.tokenBudget ?? HISTORY_TOKEN_BUDGET;
  const minRecentTurns =
    options.minRecentTurns ?? MIN_RECENT_HISTORY_TURNS;
  const turns = groupHistoryTurns(orderedMessages);
  const turnTokens = turns.map((turn) =>
    turn.reduce(
      (total, message) => total + estimateHistoryMessageTokens(message),
      0,
    ),
  );
  const availableEstimatedTokens = turnTokens.reduce(
    (total, tokens) => total + tokens,
    0,
  );

  const selected: T[][] = [];
  let estimatedTokens = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    const tokens = turnTokens[index];
    const mandatory = selected.length < minRecentTurns;
    if (!mandatory && estimatedTokens + tokens > tokenBudget) break;
    selected.unshift(turns[index]);
    estimatedTokens += tokens;
  }

  const messages = selected.flat();
  return {
    messages,
    estimatedTokens,
    availableEstimatedTokens,
    attachmentCount: messages.reduce(
      (total, message) => total + attachmentPaths(message.images).length,
      0,
    ),
    availableMessages: orderedMessages.length,
    availableTurns: turns.length,
    selectedTurns: selected.length,
    truncated: messages.length < orderedMessages.length,
    mandatoryOverflow:
      selected.length > 0 &&
      selected.length <= minRecentTurns &&
      estimatedTokens > tokenBudget,
  };
}
