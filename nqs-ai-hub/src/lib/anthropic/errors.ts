/**
 * Detección de errores puntuales de la API de Anthropic — SIN dependencias
 * (ni el SDK ni server-only), para poder importarlo tanto del server (adapter /
 * route) como del cliente (useClaudeChat, que necesita el código para mostrar el
 * mensaje al usuario).
 */

/**
 * Código interno para "saldo de la API de Anthropic agotado" (400 no reintentable).
 * El adapter lo usa como `error.message`; la ruta lo manda al cliente como `code`;
 * el chat lo mapea a un mensaje claro (sin exponerle al empleado el texto de
 * billing ni el request_id de Anthropic — info interna del admin).
 */
export const NO_CREDITS_CODE = "no_credits";

/**
 * Detecta el error de saldo agotado de forma robusta, combinando TRES señales
 * (no solo un match de texto frágil):
 *   - status 400
 *   - type "invalid_request_error"
 *   - el mensaje menciona "credit balance is too low"
 *
 * Duck-typing sobre el error del SDK (`status` + body) para no acoplar a la clase
 * concreta ni requerir importar el SDK acá.
 */
export function isNoCreditsError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status !== 400) return false;
  const e = err as { error?: unknown; message?: string };
  const raw = `${JSON.stringify(e.error ?? "")} ${e.message ?? ""}`;
  return (
    /invalid_request_error/i.test(raw) &&
    /credit balance is too low/i.test(raw)
  );
}
