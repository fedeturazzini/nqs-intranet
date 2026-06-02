/**
 * Sesión del System Brain (migration 0008).
 *
 * El Brain (ex "Prompt Padre") está protegido por una password aparte de la
 * de login. Tras verificarla, seteamos una cookie httpOnly de corta vida
 * (30 min). La cookie lleva `${expiry}.${hmac}` firmado con ENCRYPTION_KEY
 * para que no se pueda forjar (un admin curioso no puede crear el flag a
 * mano). No requiere env var nueva.
 *
 * Server-only.
 */
import crypto from "crypto";

export const BRAIN_COOKIE = "brain_session";
const TTL_MS = 30 * 60 * 1000; // 30 minutos
export const BRAIN_TTL_SECONDS = Math.floor(TTL_MS / 1000);

function secret(): string {
  return process.env.ENCRYPTION_KEY ?? "nqs-brain-fallback-secret";
}

function sign(expiry: number): string {
  return crypto.createHmac("sha256", secret()).update(String(expiry)).digest("hex");
}

/** Genera el valor de la cookie de sesión del Brain. */
export function mintBrainToken(): string {
  const expiry = Date.now() + TTL_MS;
  return `${expiry}.${sign(expiry)}`;
}

/** Valida una cookie de sesión del Brain (firma + expiración). */
export function isValidBrainToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = sign(exp);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
