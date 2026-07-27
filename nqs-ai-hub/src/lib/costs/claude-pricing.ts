/**
 * Pricing de Claude (USD por token) para el cálculo de gasto.
 *
 * Precios oficiales por millón de tokens (input / output). Si el modelo no
 * está en la tabla, devolvemos 0 (no rompemos el agregado).
 *
 * Mantener sincronizado con los modelos vigentes (migration 0017):
 *   claude-haiku-4-5 / claude-sonnet-4-6 /
 *   claude-opus-4-6 / claude-opus-4-7 / claude-opus-4-8 / claude-opus-5.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0 / 1_000_000, output: 5.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  // Los Opus vigentes comparten pricing: $5 in / $25 out por 1M.
  "claude-opus-4-6": { input: 5.0 / 1_000_000, output: 25.0 / 1_000_000 },
  "claude-opus-4-7": { input: 5.0 / 1_000_000, output: 25.0 / 1_000_000 },
  "claude-opus-4-8": { input: 5.0 / 1_000_000, output: 25.0 / 1_000_000 },
  "claude-opus-5": { input: 5.0 / 1_000_000, output: 25.0 / 1_000_000 },
};

export function calculateCostUSD(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const price = PRICING[model];
  if (!price) return 0;
  return tokensIn * price.input + tokensOut * price.output;
}

/** Formatea un monto USD con 2-4 decimales según magnitud. */
export function formatUSD(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export const SUPPORTED_MODELS = Object.keys(PRICING);
