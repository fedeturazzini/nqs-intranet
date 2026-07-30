/**
 * Tests del parser de artifacts (parse-artifacts.ts).
 */
import { describe, expect, test } from "vitest";
import {
  parseMessageWithArtifacts,
  hasIncompleteArtifact,
  hasIncompleteThinking,
  extractPartialArtifact,
  analyzeArtifactAttempt,
} from "@/lib/utils/parse-artifacts";

const artifactBlock = (
  inner: string,
) => `<function_calls>\n<invoke name="artifacts">\n${inner}\n</invoke>\n</function_calls>`;

describe("parseMessageWithArtifacts", () => {
  test("sin artifacts → un único segmento de texto con todo", () => {
    const { segments } = parseMessageWithArtifacts("hola, ¿cómo va?");
    expect(segments).toEqual([{ kind: "text", content: "hola, ¿cómo va?" }]);
  });

  test("texto + artifact → segmentos en orden", () => {
    const msg =
      "Listo, generé el prompt:\n" +
      artifactBlock(
        `<parameter name="command">create</parameter>\n` +
          `<parameter name="type">text/plain</parameter>\n` +
          `<parameter name="title">spa_pool_v1</parameter>\n` +
          `<parameter name="content">PROMPT LARGO ACÁ</parameter>`,
      );
    const { segments } = parseMessageWithArtifacts(msg);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      kind: "text",
      content: "Listo, generé el prompt:",
    });
    expect(segments[1]).toMatchObject({
      kind: "artifact",
      artifact: {
        command: "create",
        type: "text/plain",
        title: "spa_pool_v1",
        content: "PROMPT LARGO ACÁ",
      },
    });
  });

  test("parsea language en artifacts de código", () => {
    const msg = artifactBlock(
      `<parameter name="type">application/vnd.ant.code</parameter>\n` +
        `<parameter name="language">python</parameter>\n` +
        `<parameter name="title">orden</parameter>\n` +
        `<parameter name="content">print(1)</parameter>`,
    );
    const { segments } = parseMessageWithArtifacts(msg);
    expect(segments[0]).toMatchObject({
      kind: "artifact",
      artifact: { language: "python", content: "print(1)" },
    });
  });

  test("command default = create si falta", () => {
    const msg = artifactBlock(
      `<parameter name="type">text/markdown</parameter>\n` +
        `<parameter name="title">doc</parameter>\n` +
        `<parameter name="content"># Hola</parameter>`,
    );
    const { segments } = parseMessageWithArtifacts(msg);
    expect(segments[0]).toMatchObject({
      kind: "artifact",
      artifact: { command: "create", title: "doc" },
    });
  });

  test("limpia tags residuales después de la card (issue 1)", () => {
    const msg =
      artifactBlock(
        `<parameter name="type">text/plain</parameter>\n` +
          `<parameter name="title">t</parameter>\n` +
          `<parameter name="content">contenido</parameter>`,
      ) + "\n</invoke>\n</function_calls>\nlisto.";
    const { segments } = parseMessageWithArtifacts(msg);
    const texts = segments.filter((s) => s.kind === "text");
    expect(texts).toHaveLength(1);
    const textContent = texts[0].kind === "text" ? texts[0].content : "";
    expect(textContent).not.toMatch(/function_calls|invoke|parameter/);
    expect(textContent).toContain("listo.");
  });

  test("acepta whitespace y mayúsculas en los tags (regex tolerante)", () => {
    const msg =
      `<function_calls>\n<invoke  name="artifacts" >\n` +
      `<parameter name="type">text/plain</parameter>\n` +
      `<parameter name="title">x</parameter>\n` +
      `<parameter name="content">ok</parameter>\n` +
      `</invoke>\n</function_calls>`;
    const { segments } = parseMessageWithArtifacts(msg);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: "artifact",
      artifact: { content: "ok", title: "x" },
    });
  });

  test("artifact sin content → se ignora (no rompe)", () => {
    const msg = artifactBlock(
      `<parameter name="type">text/plain</parameter>\n` +
        `<parameter name="title">vacío</parameter>`,
    );
    const { segments } = parseMessageWithArtifacts(msg);
    expect(segments.every((s) => s.kind !== "artifact")).toBe(true);
  });
});

describe("fallback anti silent-drop (prompt-no-visible-audit.md)", () => {
  /** Devuelve el texto concatenado de todos los segmentos de texto. */
  const textOf = (msg: string) =>
    parseMessageWithArtifacts(msg)
      .segments.filter((s) => s.kind === "text")
      .map((s) => (s.kind === "text" ? s.content : ""))
      .join("\n");

  test("sin `type` (no rinde artifact) → el contenido NO se pierde, sale como texto", () => {
    const msg = artifactBlock(
      `<parameter name="title">prompt</parameter>\n` +
        `<parameter name="content">EL PROMPT QUE NO SE VEIA</parameter>`,
    );
    const { segments } = parseMessageWithArtifacts(msg);
    expect(segments.some((s) => s.kind === "artifact")).toBe(false);
    expect(textOf(msg)).toContain("EL PROMPT QUE NO SE VEIA");
  });

  test("comillas simples en name → se rescata el contenido", () => {
    const msg = artifactBlock(
      `<parameter name='content'>CONTENIDO CON COMILLAS SIMPLES</parameter>`,
    );
    expect(textOf(msg)).toContain("CONTENIDO CON COMILLAS SIMPLES");
  });

  test("parámetro con namespace (antml:) → se rescata el contenido", () => {
    // Armado por concatenación para no escribir la etiqueta de cierre literal.
    const open = "<" + "parameter" + ' name="content">';
    const close = "</" + "parameter>";
    const msg = artifactBlock(`${open}CONTENIDO NAMESPACED${close}`);
    expect(textOf(msg)).toContain("CONTENIDO NAMESPACED");
  });

  test("no muestra la METADATA como si fuera el prompt", () => {
    // Sin `content`: no hay nada que rescatar → no inventamos un segmento con
    // "text/plain" ni con el título.
    const msg = artifactBlock(
      `<parameter name="type">text/plain</parameter>\n` +
        `<parameter name="title">solo-metadata</parameter>`,
    );
    const t = textOf(msg);
    expect(t).not.toContain("text/plain");
    expect(t).not.toContain("solo-metadata");
  });

  test("no rompe el camino feliz: el artifact válido sigue siendo card", () => {
    const msg = artifactBlock(
      `<parameter name="type">text/plain</parameter>\n` +
        `<parameter name="title">ok</parameter>\n` +
        `<parameter name="content">CONTENIDO</parameter>`,
    );
    const { segments } = parseMessageWithArtifacts(msg);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("artifact");
  });

  test("conserva el texto conversacional alrededor del bloque roto", () => {
    const msg =
      "Listo, va el prompt:\n" +
      artifactBlock(`<parameter name="content">EL PROMPT</parameter>`) +
      "\nprobalo.";
    const t = textOf(msg);
    expect(t).toContain("Listo, va el prompt:");
    expect(t).toContain("EL PROMPT");
    expect(t).toContain("probalo.");
  });
});

describe("hasIncompleteArtifact", () => {
  test("false cuando está completo o no hay artifacts", () => {
    expect(hasIncompleteArtifact("texto plano")).toBe(false);
    expect(
      hasIncompleteArtifact(artifactBlock(`<parameter name="x">y</parameter>`)),
    ).toBe(false);
  });

  test("true mientras el artifact está abriéndose (streaming)", () => {
    expect(
      hasIncompleteArtifact(
        `Listo:\n<function_calls>\n<invoke name="artifacts">\n<parameter name="content">a med`,
      ),
    ).toBe(true);
  });
});

describe("filtrado de <thinking> (el razonamiento no se muestra)", () => {
  test("parseMessageWithArtifacts borra el bloque <thinking>", () => {
    const { segments } = parseMessageWithArtifacts(
      "<thinking>el user pidió X, voy a…</thinking>Acá está tu respuesta.",
    );
    expect(segments).toHaveLength(1);
    const text = segments[0].kind === "text" ? segments[0].content : "";
    expect(text).toBe("Acá está tu respuesta.");
    expect(text).not.toMatch(/thinking|el user pidió/i);
  });

  test("hasIncompleteThinking detecta el <thinking> abierto (streaming)", () => {
    expect(hasIncompleteThinking("hola")).toBe(false);
    expect(hasIncompleteThinking("<thinking>razono</thinking>ok")).toBe(false);
    expect(hasIncompleteThinking("<thinking>razonando a med")).toBe(true);
  });
});

describe("extractPartialArtifact (artifact cortado por max_tokens)", () => {
  test("extrae el contenido parcial de un artifact sin cerrar", () => {
    const cut =
      `Listo, va el archivo:\n<function_calls>\n<invoke name="artifacts">\n` +
      `<parameter name="type">text/plain</parameter>\n` +
      `<parameter name="title">prompts</parameter>\n` +
      `<parameter name="content">prompt 1…\nprompt 2…`; // cortado sin cerrar
    const partial = extractPartialArtifact(cut);
    expect(partial).not.toBeNull();
    expect(partial?.type).toBe("text/plain");
    expect(partial?.title).toContain("(cortado)");
    expect(partial?.content).toContain("prompt 1");
    expect(partial?.content).toContain("prompt 2");
  });

  test("devuelve null si no hay artifact", () => {
    expect(extractPartialArtifact("texto normal sin artifact")).toBeNull();
  });
});

describe("analyzeArtifactAttempt (para el log execute.summary)", () => {
  test("sin <function_calls> → no intentó (attempted false)", () => {
    expect(analyzeArtifactAttempt("hola, ¿cómo va?")).toEqual({
      attempted: false,
      detected: false,
    });
  });

  test("artifact bien formado → detected true, sin reason", () => {
    const msg = artifactBlock(
      `<parameter name="type">text/plain</parameter>\n` +
        `<parameter name="title">t</parameter>\n` +
        `<parameter name="content">ok</parameter>`,
    );
    expect(analyzeArtifactAttempt(msg)).toEqual({
      attempted: true,
      detected: true,
    });
  });

  test("cerrado pero sin content → missing_type_or_content (el bug de prompt no visible)", () => {
    const msg = artifactBlock(
      `<parameter name="type">text/plain</parameter>\n` +
        `<parameter name="title">vacío</parameter>`,
    );
    expect(analyzeArtifactAttempt(msg)).toEqual({
      attempted: true,
      detected: false,
      reason: "missing_type_or_content",
    });
  });

  test("cortado sin cerrar (max_tokens) → unclosed", () => {
    const cut =
      `Listo:\n<function_calls>\n<invoke name="artifacts">\n` +
      `<parameter name="type">text/plain</parameter>\n` +
      `<parameter name="content">a med`;
    expect(analyzeArtifactAttempt(cut)).toEqual({
      attempted: true,
      detected: false,
      reason: "unclosed",
    });
  });
});
