/**
 * Logger central mínimo (server-side).
 *
 * Emite UNA línea JSON estructurada a `console` → Vercel la indexa y queda
 * grepeable por `route` / `userId` / `requestId` / `reason`. Sin dependencias
 * externas: es `console` + `JSON.stringify` con forma fija.
 *
 * Estandariza el patrón que ya usaban sueltos el adapter, slack y access-request
 * (`console.log(JSON.stringify({ level, msg, … }))`). Migrar esos a este helper
 * queda como cleanup; los nuevos puntos ya lo usan.
 *
 *   logWarn("upload-url: sesión inválida", { route, userId, status: 401, reason });
 *   logError("execute: fallo inesperado", { route, userId, err });
 *   logInfo("login OK", { route, userId, role });
 *
 * Niveles: `error` (5xx / 4xx inesperado), `warn` (4xx esperado: 401/403/validación),
 * `info` (acciones clave: login, solicitudes, cambios de admin).
 */

export type LogFields = {
  /** Ruta lógica, ej. "tools/claude/upload-url". */
  route?: string;
  /** userId de la sesión, o null/"anon" si no hay. */
  userId?: string | null;
  /** HTTP status devuelto (para errores de API). */
  status?: number;
  /** Motivo corto y estable, ej. "session_invalid", "token_expired". */
  reason?: string;
  /** Id de request para correlacionar el error del user con Vercel. */
  requestId?: string;
  /** Error capturado — se normaliza a su mensaje. */
  err?: unknown;
  /** Campos extra ad-hoc (toolId, email, etc.). */
  [key: string]: unknown;
};

type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, fields: LogFields): void {
  const { err, ...rest } = fields;
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...rest,
  };
  if (err !== undefined && err !== null) {
    // Error nativo, o error-like de Supabase (PostgrestError = objeto plano con
    // `.message`, NO instanceof Error), o cualquier otra cosa.
    line.err =
      err instanceof Error
        ? err.message
        : typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
  }
  const serialized = JSON.stringify(line);
  // Canal por nivel para que Vercel los clasifique (error/warn/log).
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export function logInfo(msg: string, fields: LogFields = {}): void {
  emit("info", msg, fields);
}

export function logWarn(msg: string, fields: LogFields = {}): void {
  emit("warn", msg, fields);
}

export function logError(msg: string, fields: LogFields = {}): void {
  emit("error", msg, fields);
}

/**
 * Id de request para correlacionar. Vercel setea `x-vercel-id` en cada request;
 * si no está (local), devolvemos undefined y el log simplemente lo omite.
 */
export function requestIdFrom(request: Request): string | undefined {
  return request.headers.get("x-vercel-id") ?? undefined;
}
