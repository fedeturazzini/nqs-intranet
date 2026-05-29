/**
 * Tests de lib/utils/crypto — AES-256-GCM round-trip + tamper detection.
 *
 * Seteamos una ENCRYPTION_KEY de test fija (32 bytes hex) en el env del
 * proceso de vitest antes de importar el módulo.
 */
import { beforeAll, describe, expect, test } from "vitest";
import { encrypt, decrypt } from "@/lib/utils/crypto";

// 32 bytes en hex (64 chars) — clave de test, no es la de producción.
// `crypto.ts` lee ENCRYPTION_KEY lazy (en cada encrypt/decrypt), así que
// alcanza con setearla antes de que corran los tests.
const TEST_KEY = "0".repeat(64);

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

describe("crypto round-trip", () => {
  test("encrypt + decrypt devuelve el texto original", () => {
    const plain = "Sos el asistente creativo interno de NQS. 🎨 acentos ñ";
    const cipher = encrypt(plain);
    expect(cipher).not.toBe(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  test("el formato de salida es v1.<iv>.<ct>.<tag>", () => {
    const cipher = encrypt("hola");
    const parts = cipher.split(".");
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("v1");
  });

  test("dos encrypts del mismo texto dan ciphertexts distintos (IV random)", () => {
    const a = encrypt("mismo texto");
    const b = encrypt("mismo texto");
    expect(a).not.toBe(b);
    // Pero ambos desencriptan al mismo plaintext.
    expect(decrypt(a)).toBe(decrypt(b));
  });

  test("string vacío round-trips", () => {
    const cipher = encrypt("");
    expect(decrypt(cipher)).toBe("");
  });

  test("marker PLAINTEXT:: se devuelve sin desencriptar (seeds)", () => {
    expect(decrypt("PLAINTEXT::hola mundo")).toBe("hola mundo");
  });
});

describe("crypto tamper detection", () => {
  test("modificar el ciphertext rompe el decrypt (auth tag)", () => {
    const cipher = encrypt("dato sensible");
    const parts = cipher.split(".");
    // Corrompemos el ciphertext (3er segmento): flip de un char.
    const ct = parts[2];
    const tampered = ct[0] === "A" ? "B" + ct.slice(1) : "A" + ct.slice(1);
    const broken = [parts[0], parts[1], tampered, parts[3]].join(".");
    expect(() => decrypt(broken)).toThrow();
  });

  test("modificar el auth tag rompe el decrypt", () => {
    const cipher = encrypt("dato sensible");
    const parts = cipher.split(".");
    const tag = parts[3];
    const tampered = tag[0] === "A" ? "B" + tag.slice(1) : "A" + tag.slice(1);
    const broken = [parts[0], parts[1], parts[2], tampered].join(".");
    expect(() => decrypt(broken)).toThrow();
  });

  test("formato inválido (no 4 segmentos) tira error", () => {
    expect(() => decrypt("no.es.valido")).toThrow();
  });

  test("versión no soportada tira error", () => {
    const cipher = encrypt("x");
    const parts = cipher.split(".");
    const wrongVersion = ["v99", parts[1], parts[2], parts[3]].join(".");
    expect(() => decrypt(wrongVersion)).toThrow();
  });
});
