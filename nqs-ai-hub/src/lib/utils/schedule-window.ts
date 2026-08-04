/**
 * Helpers para mostrar info de horarios al user.
 *
 * `checkSchedule` (en ./schedule.ts) responde si pasa o no la ventana.
 * Acá calculamos cosas para la UI: cuándo es la próxima ventana, qué
 * resumen humano mostrar.
 *
 * Overnight (`from > to`): la ventana sigue hasta `to` del día siguiente.
 */
import { isOvernightWindow, nowInArgentina } from "./schedule";
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
 * Dada una schedule + el "ahora", devuelve la próxima ventana habilitada
 * (o la que está en curso). `null` si no hay ningún día con `enabled:true`.
 */
export function nextScheduleWindow(
  schedule: ToolSchedule,
  now: Date = new Date(),
): NextWindow | null {
  const { day, time } = nowInArgentina(now);
  const startIdx = DAY_ORDER.indexOf(day);

  // Spill overnight del día anterior (todavía en curso).
  const prev = DAY_ORDER[(startIdx + 6) % 7]!;
  const prevSched = schedule[prev];
  if (
    prevSched?.enabled &&
    isOvernightWindow(prevSched.from, prevSched.to) &&
    time < prevSched.to
  ) {
    return {
      day: prev,
      from: prevSched.from,
      to: prevSched.to,
      daysAhead: 0,
      humanLabel: `hoy (en curso hasta ${prevSched.to})`,
    };
  }

  for (let offset = 0; offset < 7; offset++) {
    const checkDay = DAY_ORDER[(startIdx + offset) % 7]!;
    const sched: DaySchedule | undefined = schedule[checkDay];
    if (!sched || !sched.enabled) continue;

    if (offset === 0) {
      if (isOvernightWindow(sched.from, sched.to)) {
        if (time >= sched.from) {
          return {
            day: checkDay,
            from: sched.from,
            to: sched.to,
            daysAhead: 0,
            humanLabel: `hoy (en curso hasta ${sched.to} del día siguiente)`,
          };
        }
        return {
          day: checkDay,
          from: sched.from,
          to: sched.to,
          daysAhead: 0,
          humanLabel: `hoy a las ${sched.from}`,
        };
      }

      // Misma ventana del día: si ya cerró, buscar el próximo.
      if (time >= sched.to) continue;

      return {
        day: checkDay,
        from: sched.from,
        to: sched.to,
        daysAhead: 0,
        humanLabel: buildHumanLabel(checkDay, sched.from, 0, time),
      };
    }

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
 * Overnight se muestra como "08:00–01:00" (fin = día siguiente).
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
