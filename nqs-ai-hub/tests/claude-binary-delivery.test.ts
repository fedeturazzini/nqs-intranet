import { describe, expect, test } from "vitest";
import {
  binaryFormatFromMediaType,
  detectBinaryDeliveryIntent,
  resolvePriorDeliveryTurn,
  shouldEnableBinaryFileGeneration,
} from "@/lib/adapters/claude-binary-delivery";

describe("detectBinaryDeliveryIntent", () => {
  test.each([
    ["Generame un PDF descargable", "pdf"],
    ["Creá un PDF que resuma estos datos", "pdf"],
    ["Redactá un informe en PDF", "pdf"],
    ["Armá un archivo Word con este informe", "docx"],
    ["Escribí un documento Word", "docx"],
    ["Exportá estos datos a Excel", "xlsx"],
    ["Armame una planilla con estos datos", "xlsx"],
    ["Creá una presentación PowerPoint", "pptx"],
    ["Diseñá una presentación", "pptx"],
    ["Generá cinco diapositivas", "pptx"],
    ["en PDF", "pdf"],
    ["como docx", "docx"],
    ["archivo xlsx", "xlsx"],
    ["pptx", "pptx"],
  ])("activa sandbox para entrega explícita: %s", (prompt, format) => {
    expect(detectBinaryDeliveryIntent(prompt)).toMatchObject({
      format,
      source: "explicit",
    });
  });

  test.each([
    "Analizá este PDF adjunto",
    "Resumí el contenido del PDF",
    "Quiero que analices un PDF",
    "Quiero entender el PDF adjunto",
    "Necesito leer un PDF",
    "Leé este documento Word",
    "Revisá la presentación adjunta",
    "Convertí este PDF a texto",
    "Mandame el prompt en .txt",
    "Exportalo como Markdown",
    "Generame una imagen del producto",
    "¿Qué ves en esta imagen?",
    "Escribí diez ideas",
  ])("mantiene text-only para análisis/texto/imagen: %s", (prompt) => {
    expect(detectBinaryDeliveryIntent(prompt)).toBeNull();
  });

  test("distingue un PDF fuente de un Word de salida", () => {
    expect(
      detectBinaryDeliveryIntent("Convertí este PDF a Word"),
    ).toMatchObject({ format: "docx", source: "explicit" });
    expect(
      detectBinaryDeliveryIntent("Pasame un resumen del PDF en Excel"),
    ).toMatchObject({ format: "xlsx", source: "explicit" });
  });

  test("follow-up hereda solo el archivo del assistant inmediatamente anterior", () => {
    expect(
      detectBinaryDeliveryIntent("Cambiá esto y hacelo de nuevo", {
        previousAssistantFileMediaTypes: ["application/pdf"],
      }),
    ).toMatchObject({
      format: "pdf",
      source: "follow_up",
      reason: "previous_assistant_file",
    });

    expect(
      detectBinaryDeliveryIntent("Hacelo de nuevo", {
        previousAssistantFileMediaTypes: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
      }),
    ).toMatchObject({ format: "xlsx", source: "follow_up" });
  });

  test("follow-up sin archivo usa solo el pedido binario previo explícito", () => {
    expect(
      detectBinaryDeliveryIntent("Otra versión", {
        previousUserPrompt: "Generame una presentación PPTX",
      }),
    ).toMatchObject({
      format: "pptx",
      source: "follow_up",
      reason: "previous_user_binary_request",
    });
    expect(
      detectBinaryDeliveryIntent("Hacelo de nuevo", {
        previousUserPrompt: "Mandame el prompt en txt",
      }),
    ).toBeNull();
    expect(detectBinaryDeliveryIntent("Hacelo de nuevo")).toBeNull();
  });

  test("no elige por orden de DB si el turno anterior entregó dos formatos", () => {
    expect(
      detectBinaryDeliveryIntent("Hacelo de nuevo", {
        previousUserPrompt: "Generame un PDF",
        previousAssistantFileMediaTypes: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
      }),
    ).toBeNull();
  });

  test("un formato textual explícito corta la herencia binaria", () => {
    expect(
      detectBinaryDeliveryIntent("Hacelo de nuevo pero en .txt", {
        previousAssistantFileMediaTypes: ["application/pdf"],
      }),
    ).toBeNull();
  });
});

describe("binaryFormatFromMediaType", () => {
  test.each([
    ["application/pdf", "pdf"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "docx",
    ],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "xlsx",
    ],
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "pptx",
    ],
  ])("mapea %s", (mediaType, expected) => {
    expect(binaryFormatFromMediaType(mediaType)).toBe(expected);
  });
  test("ignora archivos de texto e imágenes", () => {
    expect(binaryFormatFromMediaType("text/plain")).toBeNull();
    expect(binaryFormatFromMediaType("image/png")).toBeNull();
  });
});

describe("sandbox gate", () => {
  const pdfIntent = detectBinaryDeliveryIntent("Generame un PDF");

  test("se prende solo con capacidad e intención binaria", () => {
    expect(shouldEnableBinaryFileGeneration(true, pdfIntent)).toBe(true);
    expect(shouldEnableBinaryFileGeneration(false, pdfIntent)).toBe(false);
    expect(shouldEnableBinaryFileGeneration(true, null)).toBe(false);
  });

  test("txt, análisis e imágenes nunca prenden el sandbox", () => {
    for (const prompt of [
      "Mandame esto en txt",
      "Analizá este PDF",
      "Generame una imagen",
    ]) {
      expect(
        shouldEnableBinaryFileGeneration(
          true,
          detectBinaryDeliveryIntent(prompt),
        ),
      ).toBe(false);
    }
  });
});

describe("resolvePriorDeliveryTurn — regresión archivo-equivocado", () => {
  test("elige el assistant del segundo turno, nunca un archivo anterior", () => {
    expect(
      resolvePriorDeliveryTurn([
        { id: "user-a", role: "user", content: "Generame un PDF" },
        { id: "assistant-a", role: "assistant", content: "PDF A" },
        { id: "user-b", role: "user", content: "Generame un Excel" },
        { id: "assistant-b", role: "assistant", content: "Excel B" },
      ]),
    ).toEqual({
      previousUserPrompt: "Generame un Excel",
      previousAssistantId: "assistant-b",
    });
  });

  test("no hereda un assistant viejo si el último turno está incompleto", () => {
    expect(
      resolvePriorDeliveryTurn([
        { id: "assistant-a", role: "assistant", content: "PDF A" },
        { id: "user-b", role: "user", content: "nuevo pedido" },
      ]),
    ).toEqual({
      previousUserPrompt: "nuevo pedido",
      previousAssistantId: null,
    });
  });

  test("desempata user antes de assistant cuando el batch comparte created_at", () => {
    expect(
      resolvePriorDeliveryTurn([
        {
          id: "assistant-a",
          role: "assistant",
          content: "PDF A",
          created_at: "2026-07-31T10:00:00.000Z",
        },
        {
          id: "user-a",
          role: "user",
          content: "Generame un PDF",
          created_at: "2026-07-31T10:00:00.000Z",
        },
      ]),
    ).toEqual({
      previousUserPrompt: "Generame un PDF",
      previousAssistantId: "assistant-a",
    });
  });
});
