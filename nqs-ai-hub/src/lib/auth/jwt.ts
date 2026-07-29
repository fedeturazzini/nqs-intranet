/**
 * Decodifica el `exp` de un JWT SIN verificar la firma.
 *
 * Uso EXCLUSIVO: agendar el refresh proactivo (SessionKeepAlive / refresh route).
 * La validación real del token sigue en `getSession()` (`auth.getUser`) — NUNCA
 * confiar en esto para autorizar, solo para saber "cuándo conviene refrescar".
 *
 * Server-side (Node/edge): usa Buffer si está, si no atob. El payload de un JWT
 * es base64url (sin padding) → normalizamos antes de decodificar.
 */
export function decodeJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(b64 + pad, "base64").toString("utf8")
        : atob(b64 + pad);
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
