/**
 * Helpers para chequear ventanas horarias de `tool_access.schedule`.
 *
 * Convención: las horas en `schedule` están en `America/Argentina/Buenos_Aires`
 * (timezone del estudio). Server-side validamos siempre contra esa TZ —
 * el server puede correr en UTC en Vercel, no podemos confiar en
 * `new Date().getDay()`/`getHours()` server-locale.
 *
 * Ventanas overnight: si `from > to` (ej. 08:00–01:00), el acceso corre
 * desde `from` hasta medianoche y sigue hasta `to` del día siguiente.
 */
import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type DaySchedule,
  type ToolSchedule,
} from "@/types/db-aliases";

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

function previousDay(day: DayOfWeek): DayOfWeek {
  const idx = DAYS_OF_WEEK.indexOf(day);
  return DAYS_OF_WEEK[(idx + 6) % 7]!;
}

/** `from > to` → cruza medianoche hasta `to` del día siguiente. */
export function isOvernightWindow(from: string, to: string): boolean {
  return from > to;
}

/**
 * ¿Está `time` dentro de la porción del día de inicio de la ventana?
 * Overnight solo cubre desde `from` hasta fin de día (el tramo post-medianoche
 * se evalúa vía spill del día anterior).
 */
function timeInStartDayWindow(
  time: string,
  from: string,
  to: string,
): boolean {
  if (from < to) return time >= from && time < to;
  if (from > to) return time >= from;
  return false;
}

function inOvernightSpill(
  time: string,
  prev: Extract<DaySchedule, { enabled: true }>,
): boolean {
  return isOvernightWindow(prev.from, prev.to) && time < prev.to;
}

/**
 * Validador puro: dada una schedule + el "ahora", responde si pasa el
 * filtro horario. Si la schedule está vacía/null, allow.
 *
 * Overnight (`from > to`): permite desde `from` el día de inicio y hasta
 * `to` (exclusivo) del día siguiente, aunque ese día esté disabled.
 */
export function checkSchedule(
  schedule: ToolSchedule | null | undefined,
  now: Date = new Date(),
): ScheduleCheck {
  if (!schedule || Object.keys(schedule).length === 0) {
    return { allowed: true };
  }

  const { day, time } = nowInArgentina(now);

  const prev = previousDay(day);
  const prevSchedule = schedule[prev];
  if (
    prevSchedule?.enabled &&
    inOvernightSpill(time, prevSchedule)
  ) {
    return { allowed: true };
  }

  const daySchedule: DaySchedule | undefined = schedule[day];

  if (!daySchedule || !daySchedule.enabled) {
    return {
      allowed: false,
      reason: "day_disabled",
      humanMessage: `Acceso deshabilitado para ${dayLabel(day)}.`,
    };
  }

  if (timeInStartDayWindow(time, daySchedule.from, daySchedule.to)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "outside_hours",
    humanMessage: windowHumanMessage(day, daySchedule.from, daySchedule.to),
  };
}

function windowHumanMessage(day: DayOfWeek, from: string, to: string): string {
  if (isOvernightWindow(from, to)) {
    return `Acceso permitido entre ${from} y ${to} del día siguiente (${dayLabel(day)}).`;
  }
  return `Acceso permitido entre ${from} y ${to} (${dayLabel(day)}).`;
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
 * Días habilitados con `from === to` (ventana vacía — inválida).
 */
export function zeroLengthScheduleDays(
  schedule: ToolSchedule | null | undefined,
): DayOfWeek[] {
  if (!schedule) return [];
  return DAYS_OF_WEEK.filter((day) => {
    const d = schedule[day];
    return Boolean(d?.enabled && d.from === d.to);
  });
}

function joinDayLabels(days: DayOfWeek[]): string {
  const labels = days.map(dayLabel);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}`;
}

/** Mensaje claro cuando from === to. */
export function describeZeroLengthScheduleError(days: DayOfWeek[]): string {
  if (days.length === 0) {
    return "La hora de inicio y de fin no pueden ser iguales.";
  }
  return `El horario de ${joinDayLabels(days)} no es válido: la hora de inicio y de fin no pueden ser iguales.`;
}

/**
 * Traduce el `message` del PATCH /api/admin/tools/schedule a texto usable
 * en la UI. Si no reconoce el patrón, cae a un fallback genérico.
 */
export function describeScheduleSaveError(
  raw: string | null | undefined,
): string {
  const msg = (raw ?? "").trim();
  if (!msg) {
    return "No se pudo guardar el horario. Revisá los datos e intentá de nuevo.";
  }

  const equalMatch = msg.match(
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday):\s*.*(?:iguales|from y to)/i,
  );
  if (equalMatch) {
    return describeZeroLengthScheduleError([
      equalMatch[1]!.toLowerCase() as DayOfWeek,
    ]);
  }

  if (/HH:MM/i.test(msg)) {
    return "Usá horarios en formato HH:MM (ej. 08:00).";
  }

  if (/no_user_selected|schedule_update_failed/i.test(msg)) {
    return "No se pudo guardar el horario. Revisá los datos e intentá de nuevo.";
  }

  return msg;
}

/**
 * Helper expuesto solo para tests: pemite forzar el día/hora.
 * NO usar en código de producción.
 */
export const __testing = { DAY_INDEX_TO_NAME, previousDay };
