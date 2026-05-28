"use client";

/**
 * Card por tool en la página de accesos. Combina:
 *   - Toggle status (active/locked)
 *   - Editor de schedule (solo si está active)
 */
import { useState } from "react";
import { ScheduleEditor } from "./ScheduleEditor";
import type { ToolSchedule } from "@/types/db-aliases";

type ToolAccessCardProps = Readonly<{
  tool: {
    id: string;
    name: string;
    vendor: string;
    color: string | null;
    glyph: string | null;
    is_active: boolean | null;
  };
  access: {
    status: "active" | "pending" | "locked" | "expired";
    schedule: unknown;
  } | null;
  onStatusToggle: (next: "active" | "locked") => Promise<void> | void;
  onScheduleChange: (schedule: ToolSchedule | null) => Promise<void> | void;
}>;

export function ToolAccessCard({
  tool,
  access,
  onStatusToggle,
  onScheduleChange,
}: ToolAccessCardProps) {
  const status = access?.status ?? "locked";
  const isActive = status === "active";
  const [busy, setBusy] = useState(false);
  const [showSchedule, setShowSchedule] = useState(
    access?.schedule != null,
  );

  async function toggle() {
    setBusy(true);
    try {
      await onStatusToggle(isActive ? "locked" : "active");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: 16,
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: tool.is_active ? 1 : 0.55,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              color: tool.color ?? "var(--fg)",
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 22,
            }}
          >
            {tool.glyph ?? "◇"}
          </span>
          <div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 18,
                letterSpacing: "-0.01em",
              }}
            >
              {tool.name}
            </div>
            <div className="t-meta dim" style={{ fontSize: 10 }}>
              {tool.vendor}
            </div>
          </div>
        </div>

        <Toggle on={isActive} busy={busy} onClick={toggle} />
      </div>

      {!tool.is_active && (
        <div
          className="t-meta dim"
          style={{ fontStyle: "italic" }}
        >
          ↳ esta tool todavía no está habilitada en la plataforma
        </div>
      )}

      {isActive && tool.is_active && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div className="t-eyebrow" style={{ color: "var(--fg-mute)" }}>
              ↳ HORARIO
            </div>
            <button
              type="button"
              className="t-meta"
              onClick={() => {
                if (showSchedule) {
                  // limpiar = guardar null + ocultar editor
                  void onScheduleChange(null);
                  setShowSchedule(false);
                } else {
                  setShowSchedule(true);
                }
              }}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {showSchedule ? "sin restricción ←" : "+ configurar horarios"}
            </button>
          </div>

          {showSchedule && (
            <ScheduleEditor
              value={(access?.schedule as ToolSchedule | null) ?? null}
              onChange={onScheduleChange}
            />
          )}
          {!showSchedule && (
            <div
              className="t-meta dim"
              style={{ marginTop: 6, fontSize: 11 }}
            >
              acceso 24/7
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({
  on,
  busy,
  onClick,
}: Readonly<{ on: boolean; busy: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={on ? "desactivar" : "activar"}
      aria-pressed={on}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 0,
        background: on ? "var(--accent)" : "var(--line-strong)",
        position: "relative",
        cursor: busy ? "wait" : "pointer",
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: on ? "var(--accent-fg)" : "var(--bg-elev)",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}
