/**
 * Tests de los helpers de logs de diagnóstico sin contenido crudo
 * (src/lib/utils/log-preview.ts): shortHash + previewText. Usados por el log
 * `execute.context` (adapters/claude.ts, aux-log-system-brain).
 */
import { describe, expect, test } from "vitest";
import { shortHash, previewText } from "@/lib/utils/log-preview";

describe("shortHash", () => {
  test("determinístico: mismo texto → mismo hash", () => {
    expect(shortHash("cerebro v1")).toBe(shortHash("cerebro v1"));
  });

  test("distinto texto → distinto hash (detecta que cambió el cerebro)", () => {
    expect(shortHash("cerebro v1")).not.toBe(shortHash("cerebro v2"));
  });

  test("longitud fija de 12 chars hex", () => {
    const h = shortHash("cualquier contenido");
    expect(h).toHaveLength(12);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("previewText", () => {
  test("texto corto (entra en head+tail) → se devuelve completo, sin recorte", () => {
    expect(previewText("hola mundo", 200, 100)).toBe("hola mundo");
  });

  test("texto largo → head + marcador de chars omitidos + tail", () => {
    const text = "A".repeat(200) + "MEDIO".repeat(20) + "Z".repeat(100);
    const preview = previewText(text, 200, 100);
    expect(preview.startsWith("A".repeat(200))).toBe(true);
    expect(preview.endsWith("Z".repeat(100))).toBe(true);
    expect(preview).toContain("chars]");
    // Nunca el contenido completo — confirma que no filtra todo el cerebro.
    expect(preview.length).toBeLessThan(text.length);
  });

  test("nunca incluye el contenido del medio (privacidad del cerebro)", () => {
    const text = "INICIO".repeat(50) + "SECRETO_DEL_MEDIO" + "FIN".repeat(50);
    const preview = previewText(text, 10, 10);
    expect(preview).not.toContain("SECRETO_DEL_MEDIO");
  });
});
