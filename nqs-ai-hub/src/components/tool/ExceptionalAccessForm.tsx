"use client";

/**
 * Form de solicitud de acceso excepcional fuera de horario.
 *
 * Campos:
 *   - reason (textarea, 5-500 chars)
 *   - duration: selector con presets (1h / 2h / hasta fin del día / custom)
 *
 * Submit: POST /api/me/exceptional-access.
 *
 * "Hasta fin del día" se calcula client-side: minutos desde ahora hasta
 * las 23:59 del día actual en la zona del usuario.
 */
import { useRef, useState } from "react";
import { showToast } from "@/lib/store/toast";

type DurationKey = "1h" | "2h" | "eod" | "custom";

type Preset = {
  key: DurationKey;
  label: string;
  minutes?: number;
};

const PRESETS: Preset[] = [
  { key: "1h", label: "1 hora", minutes: 60 },
  { key: "2h", label: "2 horas", minutes: 120 },
  { key: "eod", label: "hasta fin del día" },
  { key: "custom", label: "custom" },
];

function minutesUntilEod(): number {
  const now = new Date();
  const eod = new Date(now);
  eod.setHours(23, 59, 0, 0);
  return Math.max(5, Math.round((eod.getTime() - now.getTime()) / 60_000));
}

type ExceptionalAccessFormProps = Readonly<{
  toolId: string;
  toolName: string;
  onCancel: () => void;
  onSubmitted: (requestId: string) => void;
}>;

export function ExceptionalAccessForm({
  toolId,
  toolName,
  onCancel,
  onSubmitted,
}: ExceptionalAccessFormProps) {
  const [reason, setReason] = useState("");
  const [durKey, setDurKey] = useState<DurationKey>("1h");
  const [customMin, setCustomMin] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function effectiveDuration(): number {
    if (durKey === "1h") return 60;
    if (durKey === "2h") return 120;
    if (durKey === "eod") return minutesUntilEod();
    return customMin;
  }

  const duration = effectiveDuration();
  const canSubmit = !busy && reason.trim().length >= 5 && duration >= 5 && duration <= 720;

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/exceptional-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolId,
          reason: reason.trim(),
          duration,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; requestId: string }
        | { error: string; message?: string };
      if (!res.ok || "error" in data) {
        setError(
          "message" in data && data.message
            ? data.message
            : "no_request_created",
        );
        setBusy(false);
        return;
      }
      showToast({
        title: "SOLICITUD ENVIADA",
        msg: `El admin va a recibir notificación en Slack. Pedido ${data.requestId.slice(0, 8)}…`,
        color: "var(--ok)",
      });
      onSubmitted(data.requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <p className="t-meta dim" style={{ lineHeight: 1.55, margin: 0 }}>
        Pedile al admin acceso temporal a{" "}
        <strong style={{ color: "var(--fg)" }}>{toolName}</strong>. Al
        aprobar, vas a poder entrar durante el tiempo que pediste.
      </p>

      <label style={{ display: "block", marginTop: 18 }}>
        <span
          className="t-eyebrow"
          style={{ display: "block", marginBottom: 6 }}
        >
          ¿POR QUÉ NECESITÁS EL ACCESO?
        </span>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          rows={3}
          maxLength={500}
          placeholder="Ej: deadline cliente lunes 9am, necesito descargar 2 modelos esta noche"
          style={textareaStyle}
          autoFocus
        />
        <div
          className="t-meta dim"
          style={{ textAlign: "right", marginTop: 4, fontSize: 10 }}
        >
          {reason.trim().length}/500
        </div>
      </label>

      <div style={{ marginTop: 12 }}>
        <span
          className="t-eyebrow"
          style={{ display: "block", marginBottom: 6 }}
        >
          DURACIÓN
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="btn sm"
              onClick={() => setDurKey(p.key)}
              style={{
                background:
                  durKey === p.key ? "var(--accent)" : "transparent",
                color:
                  durKey === p.key ? "var(--accent-fg)" : "var(--fg-mute)",
                border:
                  durKey === p.key ? "0" : "1px solid var(--line-strong)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {durKey === "custom" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
            }}
          >
            <input
              type="number"
              min={5}
              max={720}
              value={customMin}
              onChange={(e) =>
                setCustomMin(
                  Math.max(5, Math.min(720, parseInt(e.target.value, 10) || 5)),
                )
              }
              disabled={busy}
              style={inputStyle}
            />
            <span className="t-meta dim">minutos (5–720)</span>
          </div>
        )}
        {durKey === "eod" && (
          <div
            className="t-meta dim"
            style={{ marginTop: 8, fontSize: 11 }}
          >
            → {duration} minutos hasta las 23:59 de hoy
          </div>
        )}
      </div>

      {error && (
        <div className="t-meta" style={{ color: "var(--danger)", marginTop: 12 }}>
          ↳ {error}
        </div>
      )}

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
          onClick={onCancel}
          disabled={busy}
        >
          ← volver
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {busy ? "enviando…" : `enviar (${duration} min) →`}
        </button>
      </div>
    </div>
  );
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  color: "var(--fg)",
  fontFamily: "var(--sans)",
  fontSize: 13,
  padding: "10px 12px",
  resize: "vertical",
  outline: "none",
  lineHeight: 1.5,
};
const inputStyle: React.CSSProperties = {
  width: 80,
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--mono)",
  fontSize: 13,
  padding: "6px 10px",
  outline: "none",
  textAlign: "center",
};
