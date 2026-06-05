/**
 * Resolución de períodos para los logs de gasto.
 *
 * Los límites de mes/día se calculan en **hora Argentina** (UTC-3 fijo, sin
 * horario de verano desde 2009). Si se usara la hora del runtime (UTC en
 * Vercel), "este mes" arrancaría 3hs antes y podría bucketear mal los pedidos
 * hechos cerca de la medianoche de fin de mes.
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

// ART = UTC-3 fijo. Una hora de pared T en Argentina equivale al instante
// UTC = T + 3h (ej.: 00:00 ART del 1° = 03:00 UTC del 1°).
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Componentes de fecha (año / mes 0-index / día) de `d` en hora Argentina. */
function argParts(d: Date): { y: number; m: number; day: number } {
  const shifted = new Date(d.getTime() - AR_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/**
 * Instante (ISO UTC) de la medianoche 00:00 ART del día y/m/day.
 * `Date.UTC` normaliza overflow de día/mes (ej.: day = 32 → mes siguiente).
 */
function argMidnightIso(y: number, m: number, day: number): string {
  return new Date(Date.UTC(y, m, day, 3, 0, 0, 0)).toISOString();
}

/** Parsea "YYYY-MM-DD" (valor de <input type="date">) a componentes. */
function parseYmd(s: string): { y: number; m: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, day: Number(match[3]) };
}

export function resolvePeriod(
  period: PeriodKey,
  fromParam?: string | null,
  toParam?: string | null,
): { fromIso: string; toIso: string } {
  const now = new Date();
  const { y, m } = argParts(now);

  if (period === "last-month") {
    const prevY = m === 0 ? y - 1 : y;
    const prevM = m === 0 ? 11 : m - 1;
    const fromIso = argMidnightIso(prevY, prevM, 1);
    // Último instante del mes anterior = 1ms antes del 1° de este mes (ART).
    const toIso = new Date(
      new Date(argMidnightIso(y, m, 1)).getTime() - 1,
    ).toISOString();
    return { fromIso, toIso };
  }

  if (period === "7days") {
    // Ventana móvil: tz-agnóstica.
    const from = new Date(now.getTime() - 7 * 86_400_000);
    return { fromIso: from.toISOString(), toIso: now.toISOString() };
  }

  if (period === "custom" && fromParam && toParam) {
    const f = parseYmd(fromParam);
    const t = parseYmd(toParam);
    if (f && t) {
      const fromIso = argMidnightIso(f.y, f.m, f.day);
      // Fin del día elegido = 1ms antes de la medianoche ART del día siguiente.
      const toIso = new Date(
        new Date(argMidnightIso(t.y, t.m, t.day + 1)).getTime() - 1,
      ).toISOString();
      return { fromIso, toIso };
    }
    // Fallback defensivo si el formato no es YYYY-MM-DD.
    return {
      fromIso: new Date(fromParam).toISOString(),
      toIso: new Date(toParam).toISOString(),
    };
  }

  // default: this-month — desde el 1° (00:00 ART) hasta ahora.
  return { fromIso: argMidnightIso(y, m, 1), toIso: now.toISOString() };
}
