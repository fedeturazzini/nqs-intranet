"use client";

/**
 * Modal para solicitar acceso a una tool que el user NO tiene habilitada.
 *
 * Distinto de CreditRequestModal (pide créditos teniendo acceso) y de
 * ExceptionalAccessForm (pide entrar fuera de horario). Acá el user no
 * tiene `tool_access` activo y quiere que el admin se lo habilite.
 *
 * El server valida duplicados (request pendiente, acceso ya activo,
 * tool coming_soon). Si devuelve `already_pending`, mostramos el mensaje
 * y deshabilitamos el submit.
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { showToast } from "@/lib/store/toast";

const FormSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

type RequestAccessModalProps = Readonly<{
  open: boolean;
  toolId: string;
  toolName: string;
  toolGlyph?: string;
  toolColor?: string;
  onClose: () => void;
  onSubmitted: (requestId: string) => void;
}>;

type ApiResponse =
  | { ok: true; requestId: string }
  | { error: string; message?: string };

export function RequestAccessModal({
  open,
  toolId,
  toolName,
  toolGlyph = "◇",
  toolColor = "var(--accent)",
  onClose,
  onSubmitted,
}: RequestAccessModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Si el server dice que ya hay una pendiente, bloqueamos el form. */
  const [alreadyPending, setAlreadyPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setAlreadyPending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
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

  const parsed = FormSchema.safeParse({ reason });
  const canSubmit = parsed.success && !submitting && !alreadyPending;

  async function handleSubmit() {
    if (!parsed.success) {
      setError("El motivo necesita al menos 10 caracteres.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolId, reason: parsed.data.reason }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || "error" in data) {
        const errKey = "error" in data ? data.error : "unknown";
        const msg = "message" in data && data.message ? data.message : errKey;
        if (errKey === "already_pending") {
          setAlreadyPending(true);
        }
        setError(msg);
        setSubmitting(false);
        return;
      }
      showToast({
        title: "SOLICITUD ENVIADA",
        msg: "El admin va a recibir una notificación en Slack.",
        color: "var(--ok)",
      });
      onSubmitted(data.requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-access-title"
      onClick={onClose}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={hdStyle}>
          <div className="t-eyebrow" style={{ color: "#5BC0EB" }}>
            🔓 SOLICITAR ACCESO
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

        <h2 id="request-access-title" style={titleStyle}>
          No tenés acceso a{" "}
          <span style={{ color: toolColor }}>{toolGlyph}</span>{" "}
          <em style={{ fontFamily: "var(--serif)" }}>{toolName}</em>
        </h2>
        <p className="t-meta dim" style={{ lineHeight: 1.55, margin: 0 }}>
          Esta herramienta no está habilitada para tu usuario. Si la
          necesitás para tu trabajo, podés solicitarle acceso al admin.
        </p>

        <label style={{ display: "block", marginTop: 18 }}>
          <span
            className="t-eyebrow"
            style={{ display: "block", marginBottom: 6 }}
          >
            ¿PARA QUÉ LA NECESITÁS?
          </span>
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting || alreadyPending}
            rows={3}
            maxLength={500}
            placeholder="Ej: La voy a usar para análisis de imagen en el proyecto Manhattan"
            style={textareaStyle}
          />
          <div
            className="t-meta dim"
            style={{ textAlign: "right", marginTop: 4, fontSize: 10 }}
          >
            {reason.trim().length}/500
          </div>
        </label>

        {error && (
          <div
            className="t-meta"
            style={{
              color: alreadyPending ? "var(--warn)" : "var(--danger)",
              marginTop: 8,
            }}
          >
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
            onClick={onClose}
            disabled={submitting}
          >
            cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "enviando…" : "enviar solicitud →"}
          </button>
        </div>
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
  margin: "8px 0 12px",
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
