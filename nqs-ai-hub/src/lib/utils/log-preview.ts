/**
 * Helpers puros para logs de diagnóstico que necesitan confirmar contenido SIN
 * loguearlo entero (ej. `execute.context` en adapters/claude.ts, aux-log-system-
 * brain). Sin dependencias más allá de `node:crypto` — importable en cualquier
 * lado sin arrastrar Supabase/Next.
 */
import { createHash } from "node:crypto";

/** Hash corto (12 hex) del contenido — compara entre llamadas si es el mismo
 *  contenido o cambió, sin loguearlo. */
export function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** Primeros `head` + últimos `tail` chars, con la cuenta de lo omitido en el
 *  medio — confirma de un vistazo que el contenido no viene cortado ni vacío,
 *  sin loguearlo entero. */
export function previewText(text: string, head: number, tail: number): string {
  if (text.length <= head + tail) return text;
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}…[${omitted} chars]…${text.slice(-tail)}`;
}
