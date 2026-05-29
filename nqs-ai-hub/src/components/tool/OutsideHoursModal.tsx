"use client";

/**
 * Modal que aparece desde el hub cuando el user clickea una tool a la
 * que tiene acceso pero está FUERA de su ventana horaria.
 *
 * Layout:
 *   - Info de la ventana habilitada (resumen + próxima ventana)
 *   - Botón "Solicitar acceso excepcional" → cambia a form
 *   - Botón "Cerrar"
 *
 * El form de solicitud comparte el card del modal para no abrir 2
 * modales encima.
 */
import { useEffect, useState } from "react";
import { ExceptionalAccessForm } from "./ExceptionalAccessForm";
import {
  nextScheduleWindow,
  summarizeSchedule,
} from "@/lib/utils/schedule-window";
import type { ToolSchedule } from "@/types/db-aliases";

type OutsideHoursModalProps = Readonly<{
  open: boolean;
  toolId: string;
  toolName: string;
  schedule: ToolSchedule | null;
  onClose: () => void;
  /** Llamado tras submit exitoso del form de acceso excepcional. */
  onSubmitted: (requestId: string) => void;
}>;

type Mode = "info" | "form";

export function OutsideHoursModal({
  open,
  toolId,
  toolName,
  schedule,
  onClose,
  onSubmitted,
}: OutsideHoursModalProps) {
  const [mode, setMode] = useState<Mode>("info");

  useEffect(() => {
    if (open) setMode("info");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const summary = schedule ? summarizeSchedule(schedule) : "—";
  const next = schedule ? nextScheduleWindow(schedule) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outside-hours-title"
      onClick={onClose}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={hdStyle}>
          <div className="t-eyebrow" style={{ color: "var(--warn)" }}>
            ↳ FUERA DE HORARIO
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>

        <h2 id="outside-hours-title" style={titleStyle}>
          <em style={{ fontFamily: "var(--serif)" }}>{toolName}</em> está
          restringida por horario
        </h2>

        {mode === "info" ? (
          <>
            <p
              className="t-meta dim"
              style={{ lineHeight: 1.55, margin: 0 }}
            >
              Tu horario habilitado para esta tool:
            </p>
            <div
              style={{
                marginTop: 14,
                padding: "12px 16px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                background: "var(--bg)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                }}
              >
                {summary}
              </div>
              {next && (
                <div
                  className="t-meta dim"
                  style={{ marginTop: 8, fontSize: 11 }}
                >
                  próxima ventana: {next.humanLabel}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 22,
              }}
            >
              <button
                type="button"
                className="btn secondary"
                onClick={onClose}
              >
                cerrar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setMode("form")}
              >
                solicitar acceso excepcional →
              </button>
            </div>
          </>
        ) : (
          <ExceptionalAccessForm
            toolId={toolId}
            toolName={toolName}
            onCancel={() => setMode("info")}
            onSubmitted={onSubmitted}
          />
        )}
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "grid",
  placeItems: "center",
  zIndex: 1000,
  padding: 16,
};
const cardStyle: React.CSSProperties = {
  background: "var(--bg-elev)",
  border: "1px solid var(--line-strong)",
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 500,
  boxShadow: "0 16px 60px rgba(0,0,0,0.5)",
};
const hdStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--serif)",
  fontStyle: "italic",
  fontSize: 24,
  margin: "8px 0 14px",
  letterSpacing: "-0.01em",
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--fg-mute)",
  cursor: "pointer",
  fontSize: 16,
  padding: 4,
};
