/**
 * AES-256-GCM encrypt/decrypt para datos at-rest sensibles (system prompts).
 *
 * Formato de salida (string base64-url-safe):
 *
 *   v1.<iv_b64>.<ciphertext_b64>.<authtag_b64>
 *
 * Donde:
 *   v1          → versión del esquema (para futuras migraciones de algoritmo).
 *   iv          → 12 bytes random por mensaje. GCM requiere IV único por (key, msg).
 *   ciphertext  → texto cifrado.
 *   authtag     → 16 bytes que autentican el ciphertext + AAD.
 *
 * La clave maestra (`ENCRYPTION_KEY`) son 32 bytes en hex (64 chars). Se
 * genera con:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Reglas (ver kit/docs/02-conventions.md):
 *   - Nunca llamar desde el cliente. Sólo server-side.
 *   - Si `ENCRYPTION_KEY` rota, hay que reencriptar los registros existentes.
 *     El prefijo de versión permite hacerlo gradualmente sin downtime.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const SCHEMA_VERSION = "v1";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY no está definida. Generala con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" y pegala en .env.local.",
    );
  }
  if (hex.length !== KEY_LENGTH_BYTES * 2) {
    throw new Error(
      `ENCRYPTION_KEY debe ser de ${KEY_LENGTH_BYTES * 2} chars hex (= ${KEY_LENGTH_BYTES} bytes). Recibí ${hex.length}.`,
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SCHEMA_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decrypt(ciphertext: string): string {
  // Compatibilidad con seeds — un placeholder marcado PLAINTEXT:: se devuelve
  // tal cual (sin la pista). Esto es solo para los seeds iniciales; los
  // contenidos reales que pasen por el ABM admin SIEMPRE están encriptados.
  if (ciphertext.startsWith("PLAINTEXT::")) {
    return ciphertext.slice("PLAINTEXT::".length);
  }

  const parts = ciphertext.split(".");
  if (parts.length !== 4) {
    throw new Error(
      `Formato inválido. Esperado v1.<iv>.<ct>.<tag>, recibí ${parts.length} segmentos.`,
    );
  }
  const [version, ivB64, ctB64, tagB64] = parts;

  if (version !== SCHEMA_VERSION) {
    throw new Error(`Versión de cifrado no soportada: ${version}.`);
  }

  const key = getKey();
  const iv = Buffer.from(ivB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString("utf8");
}
