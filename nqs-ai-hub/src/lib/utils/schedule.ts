/**
 * Helpers para chequear ventanas horarias de `tool_access.schedule`.
 *
 * Convención: las horas en `schedule` están en `America/Argentina/Buenos_Aires`
 * (timezone del estudio). Server-side validamos siempre contra esa TZ —
 * el server puede correr en UTC en Vercel, no podemos confiar en
 * `new Date().getDay()`/`getHours()` server-locale.
 */
import type { DayOfWeek, DaySchedule, ToolSchedule } from "@/types/db-aliases";

const TZ = "America/Argentina/Buenos_Aires";

const DAY_INDEX_TO_NAME: readonly DayOfWeek[] = [
  "sunday", // getDay() === 0
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export type ScheduleCheck =
  | { allowed: true }
  | { allowed: false; reason: "day_disabled" | "outside_hours"; humanMessage: string };

/**
 * Devuelve la hora actual en TZ Argentina como `{ day, time }` con
 * `time` en formato "HH:MM" 24h.
 */
export function nowInArgentina(now: Date = new Date()): {
  day: DayOfWeek;
  time: string;
} {
  // `Intl.DateTimeFormat` con formatToParts es la forma confiable de
  // extraer componentes en una TZ específica sin libs externas.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Monday";
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minutePart = parts.find((p) => p.type === "minute")?.value ?? "00";

  // En `hour12: false` algunos browsers devuelven "24" en lugar de "00"
  // para medianoche. Normalizamos.
  const hourNum = parseInt(hourPart, 10) % 24;
  const hh = String(hourNum).padStart(2, "0");

  return {
    day: weekdayPart.toLowerCase() as DayOfWeek,
    time: `${hh}:${minutePart}`,
  };
}

/**
 * Validador puro: dada una schedule + el "ahora", responde si pasa el
 * filtro horario. Si la schedule está vacía/null, allow.
 */
export function checkSchedule(
  schedule: ToolSchedule | null | undefined,
  now: Date = new Date(),
): ScheduleCheck {
  if (!schedule || Object.keys(schedule).length === 0) {
    return { allowed: true };
  }

  const { day, time } = nowInArgentina(now);
  const daySchedule: DaySchedule | undefined = schedule[day];

  if (!daySchedule || !daySchedule.enabled) {
    return {
      allowed: false,
      reason: "day_disabled",
      humanMessage: `Acceso deshabilitado para ${dayLabel(day)}.`,
    };
  }

  if (time < daySchedule.from || time >= daySchedule.to) {
    return {
      allowed: false,
      reason: "outside_hours",
      humanMessage: `Acceso permitido entre ${daySchedule.from} y ${daySchedule.to} (${dayLabel(day)}).`,
    };
  }

  return { allowed: true };
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miércoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sábado",
  sunday: "domingo",
};

function dayLabel(d: DayOfWeek): string {
  return DAY_LABELS[d];
}

/**
 * Helper expuesto solo para tests: pemite forzar el día/hora.
 * NO usar en código de producción.
 */
export const __testing = { DAY_INDEX_TO_NAME };
