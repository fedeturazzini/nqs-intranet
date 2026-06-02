/**
 * Resolución de períodos para los logs de gasto.
 *
 * Nota: los límites de mes se calculan con la hora del server (UTC en
 * Vercel). Para un panel interno alcanza; si se necesita TZ Argentina
 * exacta, ajustar acá.
 */
export type PeriodKey = "this-month" | "last-month" | "7days" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "this-month": "Este mes",
  "last-month": "Mes anterior",
  "7days": "Últimos 7 días",
  custom: "Personalizado",
};

export function isPeriodKey(v: string): v is PeriodKey {
  return (
    v === "this-month" || v === "last-month" || v === "7days" || v === "custom"
  );
}

export function resolvePeriod(
  period: PeriodKey,
  fromParam?: string | null,
  toParam?: string | null,
): { fromIso: string; toIso: string } {
  const now = new Date();

  if (period === "last-month") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    // día 0 del mes actual = último día del mes anterior.
    const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { fromIso: first.toISOString(), toIso: last.toISOString() };
  }

  if (period === "7days") {
    const from = new Date(now.getTime() - 7 * 86_400_000);
    return { fromIso: from.toISOString(), toIso: now.toISOString() };
  }

  if (period === "custom" && fromParam && toParam) {
    const from = new Date(fromParam);
    from.setHours(0, 0, 0, 0);
    const to = new Date(toParam);
    to.setHours(23, 59, 59, 999);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }

  // default: this-month
  const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { fromIso: first.toISOString(), toIso: now.toISOString() };
}
