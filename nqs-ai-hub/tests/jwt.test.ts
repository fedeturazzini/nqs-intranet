/**
 * Tests de decodeJwtExpMs (src/lib/auth/jwt). Función pura: decodifica el exp
 * de un JWT sin verificar firma, solo para agendar el refresh.
 */
import { describe, expect, test } from "vitest";
import { decodeJwtExpMs } from "@/lib/auth/jwt";

/** Arma un JWT trucho con el payload dado (header/firma no importan). */
function fakeJwt(payload: object): string {
  const b64url = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;
}

describe("decodeJwtExpMs", () => {
  test("devuelve exp en milisegundos", () => {
    const exp = 1_800_000_000; // segundos
    expect(decodeJwtExpMs(fakeJwt({ exp, sub: "u1" }))).toBe(exp * 1000);
  });

  test("token sin exp → null", () => {
    expect(decodeJwtExpMs(fakeJwt({ sub: "u1" }))).toBeNull();
  });

  test("exp no numérico → null", () => {
    expect(decodeJwtExpMs(fakeJwt({ exp: "123" }))).toBeNull();
  });

  test("token basura → null", () => {
    expect(decodeJwtExpMs("no-es-un-jwt")).toBeNull();
    expect(decodeJwtExpMs("")).toBeNull();
  });
});
