/**
 * Gate de acceso al System Brain (migration 0008 + 0022 gate_version).
 *
 * Patrón: bcrypt + cookie httpOnly firmada con HMAC(ENCRYPTION_KEY), TTL 30 min.
 * La cookie lleva `gateVersion` en la firma (como Gastos / proyectos privados):
 * al cambiar la contraseña → gate_version++ → cookies viejas dejan de validar.
 *
 * Se exige SERVER-SIDE en los endpoints de system-prompts (no solo en la UI).
 *
 * Server-only.
 */
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const BRAIN_COOKIE = "brain_session";
const TTL_MS = 30 * 60 * 1000; // 30 minutos
export const BRAIN_TTL_SECONDS = Math.floor(TTL_MS / 1000);

function secret(): string {
  return process.env.ENCRYPTION_KEY ?? "nqs-brain-fallback-secret";
}

function sign(expiry: number, gateVersion: number): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`brain.${expiry}.${gateVersion}`)
    .digest("hex");
}

/** Flags comunes de la cookie de gate (set / clear). */
export function brainGateCookieOptions(maxAge: number): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/** Genera el valor: `${expiry}.${gateVersion}.${sig}`. */
export function mintBrainToken(gateVersion: number): string {
  const expiry = Date.now() + TTL_MS;
  return `${expiry}.${gateVersion}.${sign(expiry, gateVersion)}`;
}

/**
 * Valida token: formato, firma, expiración y gateVersion == current.
 * Tokens viejos de 2 partes (pre-0022) fallan → hay que re-ingresar password.
 */
export function verifyBrainGateToken(
  token: string | undefined | null,
  currentGateVersion: number,
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, verStr, sig] = parts;
  const exp = Number(expStr);
  const ver = Number(verStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (!Number.isFinite(ver) || ver !== currentGateVersion) return false;
  const expected = sign(exp, ver);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * @deprecated Preferir verifyBrainGateToken / hasBrainGate.
 * Tokens sin gate_version (formato viejo) siempre fallan.
 */
export function isValidBrainToken(token: string | undefined | null): boolean {
  // Sin versión de DB no podemos validar; callers deben usar hasBrainGate.
  // Mantener export por compat — falla tokens de 2 partes y exige 3.
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  // Sin currentGateVersion no sabemos si la versión es correcta; devolver
  // false fuerza a usar hasBrainGate en la página.
  return false;
}

/** Lee gate_version actual de brain_config (última fila). */
export async function getBrainGateVersion(): Promise<number | null> {
  const db = createServerClient();
  const { data } = await db
    .from("brain_config")
    .select("gate_version")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.gate_version ?? null;
}

/**
 * ¿Hay cookie de gate del Brain válida para este request?
 * Si no hay config en DB → false.
 */
export async function hasBrainGate(): Promise<boolean> {
  const version = await getBrainGateVersion();
  if (version === null) return false;
  const store = await cookies();
  const token = store.get(BRAIN_COOKIE)?.value;
  return verifyBrainGateToken(token, version);
}

/**
 * Para endpoints `/api/admin/system-prompts*`.
 * Si el gate no está abierto → 403 brain_locked.
 */
export async function requireBrainGateApi(): Promise<true | NextResponse> {
  if (await hasBrainGate()) return true;
  return NextResponse.json(
    {
      error: "brain_locked",
      message: "Se requiere la contraseña del System Brain",
    },
    { status: 403 },
  );
}

/** Invalida la cookie (maxAge=0). */
export function clearBrainGateCookie(res: NextResponse): void {
  res.cookies.set(BRAIN_COOKIE, "", brainGateCookieOptions(0));
}
