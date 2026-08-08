/**
 * Gate de acceso al panel de Gastos (migration 0021).
 *
 * Patrón: bcrypt + cookie httpOnly firmada con HMAC(ENCRYPTION_KEY), TTL 30 min.
 * La cookie lleva `gateVersion` en la firma (como proyectos privados): al cambiar
 * la contraseña → gate_version++ → cookies viejas dejan de validar.
 *
 * A diferencia del Brain, este gate se exige SERVER-SIDE en los endpoints de
 * gasto y conversaciones admin (no solo en la UI).
 *
 * Server-only.
 */
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const GASTOS_GATE_COOKIE = "gastos_gate";
const TTL_MS = 30 * 60 * 1000; // 30 minutos
export const GASTOS_GATE_TTL_SECONDS = Math.floor(TTL_MS / 1000);

function secret(): string {
  return process.env.ENCRYPTION_KEY ?? "nqs-brain-fallback-secret";
}

function sign(expiry: number, gateVersion: number): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`gastos.${expiry}.${gateVersion}`)
    .digest("hex");
}

/** Flags comunes de la cookie de gate (set / clear). */
export function gastosGateCookieOptions(maxAge: number): {
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
export function mintGastosGateToken(gateVersion: number): string {
  const expiry = Date.now() + TTL_MS;
  return `${expiry}.${gateVersion}.${sign(expiry, gateVersion)}`;
}

/**
 * Valida token: formato, firma, expiración y gateVersion == current.
 */
export function verifyGastosGateToken(
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

/** Lee gate_version actual de gastos_gate_config (última fila). */
export async function getGastosGateVersion(): Promise<number | null> {
  const db = createServerClient();
  const { data } = await db
    .from("gastos_gate_config")
    .select("gate_version")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.gate_version ?? null;
}

/**
 * ¿Hay cookie de gate de Gastos válida para este request?
 * Si no hay config en DB → false (hay que seedear).
 */
export async function hasGastosGate(): Promise<boolean> {
  const version = await getGastosGateVersion();
  if (version === null) return false;
  const store = await cookies();
  const token = store.get(GASTOS_GATE_COOKIE)?.value;
  return verifyGastosGateToken(token, version);
}

/**
 * Para endpoints `/api/admin/*` de gasto/conversaciones.
 * Si el gate no está abierto → 403 gastos_locked.
 */
export async function requireGastosGateApi(): Promise<true | NextResponse> {
  if (await hasGastosGate()) return true;
  return NextResponse.json(
    { error: "gastos_locked", message: "Se requiere la contraseña de Gastos" },
    { status: 403 },
  );
}

/** Invalida la cookie (maxAge=0). */
export function clearGastosGateCookie(res: NextResponse): void {
  res.cookies.set(GASTOS_GATE_COOKIE, "", gastosGateCookieOptions(0));
}
