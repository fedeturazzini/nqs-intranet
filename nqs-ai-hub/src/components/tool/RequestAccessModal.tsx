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
 *
 * El MOTIVO es opcional: no hay mínimo de caracteres y se puede enviar vacío
 * (el endpoint también lo acepta así). El botón solo se deshabilita mientras
 * se está enviando o si ya hay una solicitud pendiente.
 */
import { useEffect, useRef, useState } from "react";
import { showToast } from "@/lib/store/toast";

type RequestAccessModalProps = Readonly<{
  open: boolean;
  toolId: string;
  toolName: string;
  toolGlyph?: string;
  toolColor?: string;
  /**
   * "request" (default): el user nunca tuvo acceso → "solicitar acceso".
   * "renewal": el acceso expiró → copy de renovación. FEEDBACK NQS v2.0:
   * el acceso expirado ahora se maneja desde el hub con este modal en vez
   * de la pantalla full del módulo.
   */
  variant?: "request" | "renewal";
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
  variant = "request",
  onClose,
  onSubmitted,
}: RequestAccessModalProps) {
  const isRenewal = variant === "renewal";
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Si el server dice que ya hay una pendiente, bloqueamos el form. */
  const [alreadyPending, setAlreadyPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      // En renovación pre-cargamos un motivo (cumple el mín. de 10 chars)
      // para que el user pueda pedir con un click; igual lo puede editar.
      setReason(
        variant === "renewal"
          ? `Mi acceso a ${toolName} expiró y necesito renovarlo para seguir trabajando.`
          : "",
      );
      setError(null);
      setAlreadyPending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, variant, toolName]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit() {
    // Sin validación de longitud: el motivo puede ir vacío.
    if (submitting || alreadyPending) return;
    setSubmitting(true);
    setError(null);

    // Timeout duro: si el server no responde en 30s, abortamos y el finally
    // resetea el botón (nunca queda colgado en "enviando…").
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch("/api/me/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ toolId, reason: reason.trim() }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || "error" in data) {
        const errKey = "error" in data ? data.error : "unknown";
        const msg = "message" in data && data.message ? data.message : errKey;
        if (errKey === "already_pending") {
          setAlreadyPending(true);
        }
        setError(msg);
        return;
      }
      showToast({
        title: "SOLICITUD ENVIADA",
        msg: "El admin va a recibir una notificación en Slack.",
        color: "var(--ok)",
      });
      onSubmitted(data.requestId);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("La solicitud tardó demasiado, probá de nuevo.");
      } else {
        setError(err instanceof Error ? err.message : "network_error");
      }
    } finally {
      clearTimeout(timeout);
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
          <div
            className="t-eyebrow"
            style={{ color: isRenewal ? "#FF8A3D" : "#5BC0EB" }}
          >
            {isRenewal ? "⏳ TU ACCESO EXPIRÓ" : "🔓 SOLICITAR ACCESO"}
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
          {isRenewal ? "Expiró tu acceso a " : "No tenés acceso a "}
          <span style={{ color: toolColor }}>{toolGlyph}</span>{" "}
          <em style={{ fontFamily: "var(--serif)" }}>{toolName}</em>
        </h2>
        <p className="t-meta dim" style={{ lineHeight: 1.55, margin: 0 }}>
          {isRenewal
            ? "Tu acceso a esta herramienta venció. Pedile al admin que te lo renueve para seguir usándola."
            : "Esta herramienta no está habilitada para tu usuario. Si la necesitás para tu trabajo, podés solicitarle acceso al admin."}
        </p>

        <label style={{ display: "block", marginTop: 18 }}>
          <span
            className="t-eyebrow"
            style={{ display: "block", marginBottom: 6 }}
          >
            ¿PARA QUÉ LA NECESITÁS? (OPCIONAL)
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
            disabled={submitting || alreadyPending}
          >
            {submitting
              ? "enviando…"
              : isRenewal
                ? "pedir renovación →"
                : "enviar solicitud →"}
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
