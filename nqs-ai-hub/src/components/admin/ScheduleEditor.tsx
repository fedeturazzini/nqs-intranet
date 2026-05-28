"use client";

/**
 * Editor de ventana horaria por día.
 *
 * UX:
 *   - Por cada día: checkbox enabled + inputs from / to (HH:MM)
 *   - Botón "copiar este horario a todos los días" (usa el primer día
 *     habilitado como template)
 *   - El estado se debounce (300ms) antes de pegar al endpoint para
 *     no spamear PATCH en cada keystroke.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { DAYS_OF_WEEK } from "@/types/db-aliases";
import type {
  DayOfWeek,
  DaySchedule,
  ToolSchedule,
} from "@/types/db-aliases";

const DAY_LABEL: Record<DayOfWeek, string> = {
  monday: "lun",
  tuesday: "mar",
  wednesday: "mié",
  thursday: "jue",
  friday: "vie",
  saturday: "sáb",
  sunday: "dom",
};

const DEFAULT_DAY: DaySchedule = {
  enabled: true,
  from: "09:00",
  to: "18:00",
};

type ScheduleEditorProps = Readonly<{
  value: ToolSchedule | null;
  onChange: (next: ToolSchedule | null) => Promise<void> | void;
}>;

export function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  // Local copy para edición sin pegar al server en cada keystroke.
  const [local, setLocal] = useState<ToolSchedule>(() =>
    value ?? defaultSchedule(),
  );

  // Re-sincronizar si el padre cambia el value (ej. después de un
  // refresh).
  useEffect(() => {
    setLocal(value ?? defaultSchedule());
  }, [value]);

  // Debounce 400ms para mandar updates al server.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function pushDebounced(next: ToolSchedule) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void onChange(next);
    }, 400);
  }

  // Patch flexible — el discriminated union de DaySchedule no permite
  // `Partial<DaySchedule>` con `from`/`to` cuando la variante es
  // `{enabled:false}`. Usamos un tipo más permisivo y validamos en runtime.
  type DayPatch = {
    enabled?: boolean;
    from?: string;
    to?: string;
  };

  function updateDay(day: DayOfWeek, partial: DayPatch) {
    setLocal((prev) => {
      const current = prev[day];
      const base: DaySchedule = current ?? DEFAULT_DAY;
      let nextDay: DaySchedule;

      if (partial.enabled === false) {
        nextDay = { enabled: false };
      } else if (base.enabled === false && partial.enabled === true) {
        nextDay = DEFAULT_DAY;
      } else if (base.enabled) {
        nextDay = {
          enabled: true,
          from: partial.from ?? base.from,
          to: partial.to ?? base.to,
        };
      } else {
        nextDay = base;
      }

      const next: ToolSchedule = { ...prev, [day]: nextDay };
      pushDebounced(next);
      return next;
    });
  }

  function copyToAll() {
    // Encontrar el primer día habilitado como template.
    const template = DAYS_OF_WEEK.map((d) => local[d]).find(
      (d): d is Extract<DaySchedule, { enabled: true }> =>
        Boolean(d?.enabled),
    );
    if (!template) return;
    const next: ToolSchedule = {};
    for (const d of DAYS_OF_WEEK) {
      next[d] = { ...template };
    }
    setLocal(next);
    pushDebounced(next);
  }

  const summary = useMemo(() => buildSummary(local), [local]);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        className="t-meta dim"
        style={{ fontSize: 11, marginBottom: 8 }}
      >
        {summary}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: "var(--mono)",
          fontSize: 11,
        }}
      >
        {DAYS_OF_WEEK.map((d) => {
          const day = local[d] ?? { enabled: false };
          return (
            <div
              key={d}
              style={{
                display: "grid",
                gridTemplateColumns: "60px auto 1fr 1fr",
                alignItems: "center",
                gap: 8,
              }}
            >
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                <input
                  type="checkbox"
                  checked={day.enabled === true}
                  onChange={(e) =>
                    updateDay(d, { enabled: e.target.checked })
                  }
                />
                {DAY_LABEL[d]}
              </label>
              <span className="t-meta dim">·</span>
              <input
                type="time"
                value={day.enabled ? day.from : ""}
                onChange={(e) => updateDay(d, { from: e.target.value })}
                disabled={!day.enabled}
                style={timeInputStyle}
              />
              <input
                type="time"
                value={day.enabled ? day.to : ""}
                onChange={(e) => updateDay(d, { to: e.target.value })}
                disabled={!day.enabled}
                style={timeInputStyle}
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 10,
        }}
      >
        <button
          type="button"
          onClick={copyToAll}
          className="t-meta"
          style={linkBtnStyle}
        >
          ↳ copiar a todos los días
        </button>
      </div>
    </div>
  );
}

function defaultSchedule(): ToolSchedule {
  return {
    monday: { enabled: true, from: "09:00", to: "18:00" },
    tuesday: { enabled: true, from: "09:00", to: "18:00" },
    wednesday: { enabled: true, from: "09:00", to: "18:00" },
    thursday: { enabled: true, from: "09:00", to: "18:00" },
    friday: { enabled: true, from: "09:00", to: "18:00" },
    saturday: { enabled: false },
    sunday: { enabled: false },
  };
}

function buildSummary(s: ToolSchedule): string {
  const enabledDays = DAYS_OF_WEEK.filter((d) => s[d]?.enabled === true);
  if (enabledDays.length === 0) return "↳ ningún día habilitado";
  if (enabledDays.length === 7) return "↳ todos los días";
  return `↳ ${enabledDays.length} día${enabledDays.length === 1 ? "" : "s"} habilitado${enabledDays.length === 1 ? "" : "s"}`;
}

const timeInputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 4,
  color: "var(--fg)",
  fontFamily: "var(--mono)",
  fontSize: 11,
  padding: "4px 6px",
  width: "100%",
  outline: "none",
};

const linkBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: 0,
};
