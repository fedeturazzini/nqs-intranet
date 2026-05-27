/**
 * Helpers para mostrar info de horarios al user.
 *
 * `checkSchedule` (en ./schedule.ts) responde si pasa o no la ventana.
 * Acá calculamos cosas para la UI: cuándo es la próxima ventana, qué
 * resumen humano mostrar.
 */
import { nowInArgentina } from "./schedule";
import type {
  DayOfWeek,
  DaySchedule,
  ToolSchedule,
} from "@/types/db-aliases";

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

const DAY_ORDER: readonly DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function dayLabel(d: DayOfWeek): string {
  return DAY_LABELS[d];
}

export type NextWindow = {
  day: DayOfWeek;
  from: string;
  to: string;
  /** Cuántos días hasta ese día (0 = hoy más tarde, 1 = mañana, …). */
  daysAhead: number;
  /** "hoy a las 14:00", "mañana a las 9:00", "el sábado a las 9:00" */
  humanLabel: string;
};

/**
 * Dada una schedule + el "ahora", devuelve la próxima ventana habilitada.
 * `null` si no hay ningún día con `enabled:true` en la schedule (estado
 * inválido pero lo cubrimos).
 */
export function nextScheduleWindow(
  schedule: ToolSchedule,
  now: Date = new Date(),
): NextWindow | null {
  const { day, time } = nowInArgentina(now);
  const startIdx = DAY_ORDER.indexOf(day);

  for (let offset = 0; offset < 7; offset++) {
    const checkDay = DAY_ORDER[(startIdx + offset) % 7];
    const sched: DaySchedule | undefined = schedule[checkDay];
    if (!sched || !sched.enabled) continue;

    // Si es hoy y ya pasamos la ventana, saltamos al siguiente match.
    if (offset === 0 && time >= sched.to) continue;

    return {
      day: checkDay,
      from: sched.from,
      to: sched.to,
      daysAhead: offset,
      humanLabel: buildHumanLabel(checkDay, sched.from, offset, time),
    };
  }

  return null;
}

function buildHumanLabel(
  day: DayOfWeek,
  from: string,
  daysAhead: number,
  nowTime: string,
): string {
  if (daysAhead === 0) {
    // Hoy, pero todavía no entramos a la ventana.
    if (nowTime < from) return `hoy a las ${from}`;
    return `hoy (en curso hasta cerrar)`;
  }
  if (daysAhead === 1) return `mañana a las ${from}`;
  return `el ${dayLabel(day).toLowerCase()} a las ${from}`;
}

/**
 * Resumen para mostrar arriba del módulo: "Lun-Vie 9-18hs".
 * Agrupa días contiguos con la misma ventana.
 */
export function summarizeSchedule(schedule: ToolSchedule): string {
  // Recopilar (día, "from-to") solo de los habilitados.
  const entries: Array<{ day: DayOfWeek; window: string }> = [];
  for (const d of DAY_ORDER) {
    const s = schedule[d];
    if (s && s.enabled) {
      entries.push({ day: d, window: `${s.from}–${s.to}` });
    }
  }
  if (entries.length === 0) return "sin acceso configurado";

  // Agrupar por ventana.
  type Group = { from: DayOfWeek; to: DayOfWeek; window: string };
  const groups: Group[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.window === e.window) {
      last.to = e.day;
    } else {
      groups.push({ from: e.day, to: e.day, window: e.window });
    }
  }

  return groups
    .map((g) => {
      const days =
        g.from === g.to
          ? dayLabel(g.from)
          : `${shortDay(g.from)}–${shortDay(g.to)}`;
      return `${days} ${g.window}`;
    })
    .join(" · ");
}

const SHORT: Record<DayOfWeek, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mié",
  thursday: "Jue",
  friday: "Vie",
  saturday: "Sáb",
  sunday: "Dom",
};

function shortDay(d: DayOfWeek): string {
  return SHORT[d];
}
