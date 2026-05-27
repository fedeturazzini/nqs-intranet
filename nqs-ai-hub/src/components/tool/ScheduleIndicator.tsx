"use client";

/**
 * Indicador chico debajo del header con info de la ventana horaria.
 *
 * Si no hay schedule configurado: no renderiza nada.
 *
 * Renderiza:
 *   - resumen "Lun-Vie 09:00–18:00 · Sáb 10:00–14:00"
 *   - pip verde "activo ahora" si estamos dentro de la ventana
 *   - texto "próxima ventana: …" si estamos fuera
 *
 * Re-evalúa cada minuto para que la transición "abro hoy a las 09:00"
 * se vea sin recargar.
 */
import { useEffect, useState } from "react";
import { checkSchedule } from "@/lib/utils/schedule";
import {
  nextScheduleWindow,
  summarizeSchedule,
} from "@/lib/utils/schedule-window";
import type { ToolSchedule } from "@/types/db-aliases";

type ScheduleIndicatorProps = Readonly<{
  schedule: ToolSchedule | null;
}>;

export function ScheduleIndicator({ schedule }: ScheduleIndicatorProps) {
  // Tick para re-evaluar cada 60s.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!schedule || Object.keys(schedule).length === 0) return null;

  const summary = summarizeSchedule(schedule);
  const now = new Date();
  const check = checkSchedule(schedule, now);
  const isActive = check.allowed;

  let rightSide: React.ReactNode;
  if (isActive) {
    rightSide = (
      <span
        className="row"
        style={{ gap: 8, color: "var(--ok)" }}
        aria-label="activo ahora"
      >
        <span className="dot pulse" style={{ background: "var(--ok)" }} />
        activo ahora
      </span>
    );
  } else {
    const next = nextScheduleWindow(schedule, now);
    rightSide = (
      <span className="t-meta dim" style={{ color: "var(--fg-mute)" }}>
        próxima ventana: {next ? next.humanLabel : "—"}
      </span>
    );
  }

  return (
    <div
      style={{
        padding: "10px 32px",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "var(--bg-elev)",
      }}
    >
      <div className="t-meta" style={{ color: "var(--fg-mute)" }}>
        ↳ HORARIOS · {summary}
      </div>
      <div className="t-meta">{rightSide}</div>
    </div>
  );
}
