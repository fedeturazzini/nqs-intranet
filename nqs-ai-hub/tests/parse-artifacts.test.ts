/**
 * Tests del parser de artifacts (parse-artifacts.ts).
 */
import { describe, expect, test } from "vitest";
import {
  parseMessageWithArtifacts,
  hasIncompleteArtifact,
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
