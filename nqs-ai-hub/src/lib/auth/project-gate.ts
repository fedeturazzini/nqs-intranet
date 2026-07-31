/**
 * Gate de acceso a PROYECTOS PRIVADOS (migration 0016).
 *
 * Mismo patrón que el System Brain (`src/lib/auth/brain.ts`): contraseña bcrypt
 * + cookie httpOnly firmada con HMAC(`ENCRYPTION_KEY`), TTL 15 min. La
 * diferencia clave: la cookie lleva `{ projectId, gateVersion }` EN LA FIRMA, y
 * el server valida que `gateVersion` coincida con `projects.gate_version`.
 * Cambiar la contraseña o pasar el proyecto a abierto hace `gate_version++` →
 * las cookies viejas dejan de validar solas (una cookie httpOnly no se puede
 * borrar desde el server sin setear maxAge=0).
 *
 * Se limpia la cookie al salir del proyecto (POST /api/me/active-project a otro
 * id) y al cerrar sesión (POST /api/auth/logout), para que la próxima entrada
 * vuelva a pedir clave.
 *
 * Feature independiente del Brain: sólo calca el patrón, no comparte datos.
 * Server-only.
 */
import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getProjectGateFields } from "@/lib/db/queries/projects";

const TTL_MS = 15 * 60 * 1000; // 15 minutos — vigencia mientras se usa el proyecto
export const PROJECT_GATE_TTL_SECONDS = Math.floor(TTL_MS / 1000);

/** Prefijo de cookies de gate (`pg_{projectId}`). */
export const PROJECT_GATE_COOKIE_PREFIX = "pg_";

function secret(): string {
  return process.env.ENCRYPTION_KEY ?? "nqs-brain-fallback-secret";
}

/** Nombre de la cookie del gate de un proyecto (una cookie por proyecto). */
export function projectGateCookieName(projectId: string): string {
  return `${PROJECT_GATE_COOKIE_PREFIX}${projectId}`;
}

/** Flags comunes de la cookie de gate (set / clear). */
export function projectGateCookieOptions(maxAge: number): {
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

/**
 * Firma que ata el token a (proyecto, expiración, versión de gate). Incluir
 * `projectId` + `gateVersion` en el material firmado evita reusar la cookie en
 * otro proyecto o después de un `gate_version++`.
 */
function sign(projectId: string, expiry: number, gateVersion: number): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`${projectId}.${expiry}.${gateVersion}`)
    .digest("hex");
}

/** Genera el valor de la cookie de gate: `${expiry}.${gateVersion}.${sig}`. */
export function mintProjectGateToken(
  projectId: string,
  gateVersion: number,
): string {
  const expiry = Date.now() + TTL_MS;
  return `${expiry}.${gateVersion}.${sign(projectId, expiry, gateVersion)}`;
}

/**
 * Valida un token de gate: formato, firma, expiración y que el `gateVersion`
 * del token coincida con el actual de la DB.
 */
export function verifyProjectGateToken(
  token: string | undefined | null,
  projectId: string,
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
  const expected = sign(projectId, exp, ver);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * ¿El user puede acceder al CONTENIDO de este proyecto?
 *
 *   - proyecto abierto (o inexistente) → true (no hay nada que gatear).
 *   - proyecto privado → true sólo si hay una cookie de gate válida (firmada,
 *     no expirada, con el `gate_version` al día).
 *
 * Los admins NO están exentos (decisión de diseño: pasan el mismo gate; el
 * reset de contraseña es su mecanismo de recuperación). Lee las cookies del
 * request con `cookies()` de next/headers (mismo patrón que `getSession`).
 *
 * `preloaded` permite reutilizar una fila de `projects` leída en este mismo
 * request. No se cachea nada entre requests: cada execute compara la cookie con
 * el gate_version que acaba de traer de la DB.
 */
export type ProjectGateFields = {
  is_private: boolean;
  gate_version: number;
};

export async function hasProjectGate(
  projectId: string,
  preloaded?: ProjectGateFields,
): Promise<boolean> {
  const fields = preloaded ?? (await getProjectGateFields(projectId));
  if (!fields || !fields.is_private) return true;
  const store = await cookies();
  const token = store.get(projectGateCookieName(projectId))?.value;
  return verifyProjectGateToken(token, projectId, fields.gate_version);
}

/** Invalida la cookie de gate de un proyecto (maxAge=0). */
export function clearProjectGateCookie(
  res: NextResponse,
  projectId: string,
): void {
  res.cookies.set(projectGateCookieName(projectId), "", projectGateCookieOptions(0));
}

/**
 * Invalida todas las cookies `pg_*` presentes en el request (p.ej. al logout).
 */
export function clearAllProjectGateCookies(
  res: NextResponse,
  requestCookies: Iterable<{ name: string }>,
): void {
  for (const c of requestCookies) {
    if (c.name.startsWith(PROJECT_GATE_COOKIE_PREFIX)) {
      res.cookies.set(c.name, "", projectGateCookieOptions(0));
    }
  }
}
