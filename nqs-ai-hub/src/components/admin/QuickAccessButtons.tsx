"use client";

/**
 * Botones de aprobación rápida para las cards de /admin/solicitudes.
 *
 * FEEDBACK NQS v2.0 (Part 8): Chule pidió poder aprobar accesos con
 * duración de un click (1h/2h/… o 1 día/1 semana/permanente) en vez de
 * hacerlo manual.
 *
 *   - exceptional_access → [1h][2h][3h][4h][fin del día][custom]
 *   - access             → [1 día][3 días][1 semana][permanente][custom]
 *
 * "custom" despliega un datetime-local para elegir el vencimiento a mano.
 * Cada click llama `onApprove` con la duración elegida; el endpoint calcula
 * el expires_at.
 */
import { useState } from "react";

export type ApproveOpts = {
  durationMinutes?: number;
  /** ISO. null = permanente. undefined = usar duración. */
  customExpiresAt?: string | null;
  /** Texto humano para el toast (ej "2 horas", "1 semana", "permanente"). */
  label: string;
};

type QuickOption = {
  label: string;
  durationMinutes?: number;
  endOfDay?: boolean;
  permanent?: boolean;
};

const EXCEPTIONAL_OPTIONS: QuickOption[] = [
  { label: "1h", durationMinutes: 60 },
  { label: "2h", durationMinutes: 120 },
  { label: "3h", durationMinutes: 180 },
  { label: "4h", durationMinutes: 240 },
  { label: "fin del día", endOfDay: true },
];

const ACCESS_OPTIONS: QuickOption[] = [
  { label: "1 día", durationMinutes: 1440 },
  { label: "3 días", durationMinutes: 4320 },
  { label: "1 semana", durationMinutes: 10080 },
  { label: "permanente", permanent: true },
];

/** ISO del final del día de hoy (23:59:59 hora local del admin). */
function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

type QuickAccessButtonsProps = Readonly<{
  /** ID de la solicitud (para data-attr / tracking). */
  requestId: string;
  requestType: "exceptional_access" | "access";
  onApprove: (opts: ApproveOpts) => void | Promise<void>;
  onReject: () => void;
  disabled?: boolean;
}>;

export function QuickAccessButtons({
  requestId,
  requestType,
  onApprove,
  onReject,
  disabled = false,
}: QuickAccessButtonsProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const options =
    requestType === "exceptional_access"
      ? EXCEPTIONAL_OPTIONS
      : ACCESS_OPTIONS;

  function handleQuick(opt: QuickOption) {
    if (opt.permanent) {
      void onApprove({ customExpiresAt: null, label: "permanente" });
      return;
    }
    if (opt.endOfDay) {
      void onApprove({
        customExpiresAt: endOfTodayIso(),
        label: "fin del día",
      });
      return;
    }
    void onApprove({
      durationMinutes: opt.durationMinutes,
      label: opt.label,
    });
  }

  function confirmCustom() {
    setCustomError(null);
    if (!customValue) {
      setCustomError("elegí una fecha y hora");
      return;
    }
    const dt = new Date(customValue);
    if (Number.isNaN(dt.getTime())) {
      setCustomError("fecha inválida");
      return;
    }
    if (dt.getTime() <= Date.now()) {
      setCustomError("tiene que ser a futuro");
      return;
    }
    void onApprove({
      customExpiresAt: dt.toISOString(),
      label: `hasta ${dt.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      })}`,
    });
    setCustomOpen(false);
    setCustomValue("");
  }

  return (
    <div
      data-request-id={requestId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <span
          className="t-meta dim"
          style={{ fontSize: 10, marginRight: "auto" }}
        >
          ↳ aprobar por:
        </span>
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            className="btn sm secondary"
            disabled={disabled}
            onClick={() => handleQuick(opt)}
            style={{ fontSize: 11 }}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          className="btn sm secondary"
          disabled={disabled}
          onClick={() => setCustomOpen((v) => !v)}
          style={{ fontSize: 11 }}
        >
          custom
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled}
          onClick={onReject}
          style={{ color: "var(--danger)" }}
        >
          rechazar
        </button>
      </div>

      {customOpen && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            borderTop: "1px solid var(--line)",
            paddingTop: 8,
          }}
        >
          <span className="t-eyebrow">↳ VENCE EL</span>
          <input
            type="datetime-local"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            disabled={disabled}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--line-strong)",
              borderRadius: 6,
              color: "var(--fg)",
              fontFamily: "var(--mono)",
              fontSize: 12,
              padding: "6px 8px",
              outline: "none",
            }}
          />
          {customError && (
            <span className="t-meta" style={{ color: "var(--danger)" }}>
              {customError}
            </span>
          )}
          <button
            type="button"
            className="btn sm"
            disabled={disabled}
            onClick={confirmCustom}
          >
            aprobar →
          </button>
        </div>
      )}
    </div>
  );
}
