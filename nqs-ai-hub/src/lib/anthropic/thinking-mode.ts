/**
 * Modo de thinking configurable por admin en el System Brain.
 *
 *   off  → mandamos `thinking: { type: "disabled" }` a Anthropic
 *   auto → omitimos el campo (comportamiento nativo del modelo)
 *
 * Sonnet 5 tiene adaptive thinking ON por default; sin `off` el chat
 * se comporta distinto a Opus 4.7 (wrappers raros, dumps de prompts).
 * Docs: platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5
 */

export const THINKING_MODES = ["off", "auto"] as const;
export type ThinkingMode = (typeof THINKING_MODES)[number];

export function isThinkingMode(value: unknown): value is ThinkingMode {
  return value === "off" || value === "auto";
}

/** Default sensato: Sonnet 5 → off; resto → auto. */
export function defaultThinkingModeFor(model: string): ThinkingMode {
  return /^claude-sonnet-5($|-)/i.test(model) ? "off" : "auto";
}

/**
 * Parámetro `thinking` para messages.create/stream.
 * `undefined` = no incluir el campo en el request.
 */
export function thinkingParamFor(
  model: string,
  mode?: ThinkingMode | null,
): { type: "disabled" } | undefined {
  const resolved = isThinkingMode(mode) ? mode : defaultThinkingModeFor(model);
  return resolved === "off" ? { type: "disabled" } : undefined;
}
