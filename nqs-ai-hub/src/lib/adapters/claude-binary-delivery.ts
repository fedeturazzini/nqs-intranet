export type BinaryDeliveryFormat = "pdf" | "docx" | "xlsx" | "pptx";

export type BinaryDeliveryIntent = {
  format: BinaryDeliveryFormat;
  source: "explicit" | "follow_up";
  reason: string;
};

export type BinaryDeliveryContext = {
  previousUserPrompt?: string | null;
  previousAssistantFileMediaTypes?: string[];
};

export function shouldEnableBinaryFileGeneration(
  available: boolean,
  intent: BinaryDeliveryIntent | null,
): boolean {
  return available && intent != null;
}

export type PriorDeliveryMessage = {
  id: string;
  role: string;
  content: string;
  created_at?: string | null;
};

export function orderPriorDeliveryMessages<T extends PriorDeliveryMessage>(
  messages: T[],
): T[] {
  return [...messages].sort((left, right) => {
    if (!left.created_at || !right.created_at) return 0;
    const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
    const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    // El batch INSERT asigna el mismo NOW() al user y assistant. Ante empate,
    // forzamos el orden conversacional, en vez de depender del orden de Postgres.
    if (left.role === right.role) return 0;
    if (left.role === "user") return -1;
    if (right.role === "user") return 1;
    return 0;
  });
}

export function resolvePriorDeliveryTurn(messages: PriorDeliveryMessage[]): {
  previousUserPrompt: string | null;
  previousAssistantId: string | null;
} {
  const ordered = orderPriorDeliveryMessages(messages);
  let previousUserPrompt: string | null = null;
  for (let index = ordered.length - 1; index >= 0; index--) {
    if (ordered[index].role === "user") {
      previousUserPrompt = ordered[index].content;
      break;
    }
  }
  const immediatelyPrevious = ordered.at(-1);
  return {
    previousUserPrompt,
    previousAssistantId:
      immediatelyPrevious?.role === "assistant" ? immediatelyPrevious.id : null,
  };
}

const DELIVERY_ACTION =
  /\b(?:gener|cre|arm|hac|prepar|export|convert|entreg|mand|envi|pas|devolv|guard|descarg|quier|necesit|dame|d[áa]|redact|escrib|diseñ|disen|elabor|maquet|create|generate|make|send|give|return|export|save|download|convert|write|design)\w*/i;
const STRONG_CREATE_ACTION =
  /\b(?:gener|cre|arm|hac|prepar|export|redact|escrib|diseñ|disen|elabor|maquet|create|generate|make|export|write|design)\w*/i;
const FOLLOW_UP_ACTION =
  /\b(?:hacelo|hac[eé]lo|hazlo|de nuevo|otra vez|regener|reintent|volv[eé]\s+a|otra\s+versi[oó]n|actualiz|modific|cambi|correg|ajust)\w*/i;
const TXT_OR_MARKDOWN =
  /(?:\.txt\b|\.md\b|\bmarkdown\b|\barchivo\s+de\s+texto\b)/i;
const IMAGE_REQUEST =
  /\b(?:imagen|image|mockup|mock-up|render|foto|visual|ilustraci[oó]n)\b/i;
const ANALYSIS_ACTION =
  /\b(?:anali[cz]|revis|le[eé]|resum|interpret|explic|extra[eé]|entend|comprend|consult|mir|ver|review|summari|understand|read)\w*/i;
const BINARY_TO_TEXT =
  /\bconvert\w*[\s\S]{0,40}(?:\.?pdf|\.?docx?|word|\.?xlsx?|excel|\.?pptx?)[\s\S]{0,24}\b(?:a|en)\s+(?:\.?txt|\.?md|texto|markdown)\b/i;

export function isPotentialBinaryFollowUp(prompt: string): boolean {
  return (
    FOLLOW_UP_ACTION.test(prompt) &&
    !TXT_OR_MARKDOWN.test(prompt) &&
    !IMAGE_REQUEST.test(prompt)
  );
}

const FORMAT_PATTERNS: Record<BinaryDeliveryFormat, RegExp> = {
  pdf: /(?:\.pdf\b|\bpdf\b)/i,
  docx: /(?:\.docx?\b|\bword\b|\bdocumento\s+(?:de\s+)?word\b)/i,
  xlsx: /(?:\.xlsx?\b|\bexcel\b|\bhoja\s+de\s+c[aá]lculo\b|\bplanilla\b)/i,
  pptx: /(?:\.pptx?\b|\bpower\s*point\b|\bpresentaci[oó]n\b|\bdiapositivas?\b|\bslides?\b)/i,
};

const TERSE_FORMATS: Array<[BinaryDeliveryFormat, RegExp]> = [
  ["pdf", /^(?:(?:en|como)\s+)?(?:archivo\s+)?\.?pdf[.!]?\s*$/i],
  ["docx", /^(?:(?:en|como)\s+)?(?:archivo\s+)?(?:\.?docx?|word)[.!]?\s*$/i],
  ["xlsx", /^(?:(?:en|como)\s+)?(?:archivo\s+)?(?:\.?xlsx?|excel)[.!]?\s*$/i],
  [
    "pptx",
    /^(?:(?:en|como)\s+)?(?:archivo\s+)?(?:\.?pptx?|power\s*point)[.!]?\s*$/i,
  ],
];

const SOURCE_REFERENCE: Record<BinaryDeliveryFormat, RegExp> = {
  pdf: /\b(?:del|este|ese|adjunt[oa])\s+(?:archivo\s+)?\.?pdf\b/i,
  docx: /\b(?:del|este|ese|adjunt[oa])\s+(?:documento\s+)?(?:\.?docx?|word)\b/i,
  xlsx: /\b(?:del|este|ese|adjunt[oa])\s+(?:planilla\s+)?(?:\.?xlsx?|excel)\b/i,
  pptx: /\b(?:de\s+la|esta|esa|adjunt[oa])\s+(?:presentaci[oó]n|\.?pptx?|power\s*point)\b/i,
};

function explicitIntent(prompt: string): BinaryDeliveryIntent | null {
  const trimmed = prompt.trim();
  for (const [format, pattern] of TERSE_FORMATS) {
    if (pattern.test(trimmed)) {
      return { format, source: "explicit", reason: "terse_binary_format" };
    }
  }

  for (const format of Object.keys(FORMAT_PATTERNS) as BinaryDeliveryFormat[]) {
    if (!FORMAT_PATTERNS[format].test(prompt)) continue;
    const formatPattern =
      format === "docx"
        ? "docx?|word"
        : format === "xlsx"
          ? "xlsx?|excel|planilla"
          : format === "pptx"
            ? "pptx?|power\\s*point|presentaci[oó]n|diapositivas?|slides?"
            : "pdf";
    const outputConnector = new RegExp(
      `\\b(?:en|como|a|formato)\\s+(?:un\\s+)?(?:${formatPattern})\\b`,
      "i",
    );
    const directCreation = new RegExp(
      `${STRONG_CREATE_ACTION.source}[\\s\\S]{0,40}(?:${formatPattern})\\b`,
      "i",
    );
    if (
      ANALYSIS_ACTION.test(prompt) &&
      !outputConnector.test(prompt) &&
      !directCreation.test(prompt)
    ) {
      continue;
    }
    if (BINARY_TO_TEXT.test(prompt)) continue;
    if (SOURCE_REFERENCE[format].test(prompt)) {
      if (!outputConnector.test(prompt)) continue;
    }
    if (DELIVERY_ACTION.test(prompt)) {
      return { format, source: "explicit", reason: "action_and_binary_format" };
    }
  }
  return null;
}

export function binaryFormatFromMediaType(
  mediaType: string,
): BinaryDeliveryFormat | null {
  const normalized = mediaType.toLowerCase();
  if (normalized === "application/pdf") return "pdf";
  if (normalized.includes("wordprocessingml")) return "docx";
  if (normalized.includes("spreadsheetml")) return "xlsx";
  if (normalized.includes("presentationml")) return "pptx";
  return null;
}

export function detectBinaryDeliveryIntent(
  prompt: string,
  context: BinaryDeliveryContext = {},
): BinaryDeliveryIntent | null {
  const explicit = explicitIntent(prompt);
  if (explicit) return explicit;

  // Un pedido textual o visual nunca hereda un binario anterior.
  if (!isPotentialBinaryFollowUp(prompt)) return null;

  const previousFileFormats = [
    ...new Set(
      (context.previousAssistantFileMediaTypes ?? [])
        .map(binaryFormatFromMediaType)
        .filter((format): format is BinaryDeliveryFormat => format != null),
    ),
  ];
  if (previousFileFormats.length === 1) {
    return {
      format: previousFileFormats[0],
      source: "follow_up",
      reason: "previous_assistant_file",
    };
  }
  // Un mismo turno con formatos distintos es ambiguo: no elegimos uno por
  // orden de DB porque eso recrearía una variante de archivo-equivocado.
  if (previousFileFormats.length > 1) return null;

  const previousPrompt = context.previousUserPrompt?.trim();
  const previousIntent = previousPrompt ? explicitIntent(previousPrompt) : null;
  if (previousIntent) {
    return {
      format: previousIntent.format,
      source: "follow_up",
      reason: "previous_user_binary_request",
    };
  }
  return null;
}
