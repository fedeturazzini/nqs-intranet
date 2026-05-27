"use client";

/**
 * Modal para que el empleado pida más créditos al admin.
 * Adaptado de design/screens.jsx CreditRequestModal (líneas 376-433).
 *
 * Submit dispara POST /api/tools/3dsky/request-credits que crea la row
 * en access_requests + notifica a Slack. La validación matchea Zod del
 * endpoint (amount 1-1000, reason 5-500 chars).
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

const FormSchema = z.object({
  amount: z.number().int().min(1).max(1000),
  reason: z.string().trim().min(5).max(500),
});

type CreditRequestModalProps = Readonly<{
  open: boolean;
  currentCredits: number;
  /** Cierra sin enviar. */
  onClose: () => void;
  /** Llamado tras un POST exitoso, con el requestId. */
  onSubmitted: (requestId: string) => void;
}>;

type ApiResponse =
  | { ok: true; requestId: string }
  | { error: string; message?: string };

export function CreditRequestModal({
  open,
  currentCredits,
  onClose,
  onSubmitted,
}: CreditRequestModalProps) {
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(10);
      setReason("");
      setError(null);
      setTimeout(() => amountRef.current?.focus(), 50);
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

  const parsed = FormSchema.safeParse({ amount, reason });
  const canSubmit = parsed.success && !submitting;

  async function handleSubmit() {
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/3dsky/request-credits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || "error" in data) {
        setError(
          "message" in data && data.message ? data.message : "no_request_created",
        );
        setSubmitting(false);
        return;
      }
      onSubmitted(data.requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="credit-modal-backdrop"
      onClick={onClose}
      style={backdropStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-title"
    >
      <div
        className="credit-modal"
        onClick={(e) => e.stopPropagation()}
        style={cardStyle}
      >
        <div
          className="credit-modal-hd"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div className="t-eyebrow">↳ SOLICITUD DE CRÉDITOS · 3DSKY</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>

        <h2
          id="request-title"
          className="credit-modal-title"
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 28,
            margin: "8px 0 6px",
            letterSpacing: "-0.01em",
          }}
        >
          ¿Cuántos créditos necesitás?
        </h2>
        <p className="t-meta dim" style={{ lineHeight: 1.55, margin: 0 }}>
          Tenés <strong style={{ color: "var(--fg)" }}>{currentCredits}</strong>{" "}
          ahora. El admin recibirá tu pedido y lo aprueba o ajusta — también
          le llega una notificación inmediata a Slack.
        </p>

        <label className="credit-modal-field" style={{ marginTop: 20 }}>
          <span className="t-eyebrow">CANTIDAD</span>
          <div
            className="credit-modal-amount"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setAmount((a) => Math.max(1, a - 1))}
              disabled={submitting || amount === 1}
              style={stepperBtnStyle}
            >
              −
            </button>
            <input
              ref={amountRef}
              type="number"
              min={1}
              max={1000}
              value={amount}
              onChange={(e) =>
                setAmount(
                  Math.max(
                    1,
                    Math.min(1000, parseInt(e.target.value, 10) || 1),
                  ),
                )
              }
              disabled={submitting}
              style={amountInputStyle}
            />
            <button
              type="button"
              onClick={() => setAmount((a) => Math.min(1000, a + 1))}
              disabled={submitting || amount >= 1000}
              style={stepperBtnStyle}
            >
              +
            </button>
            <span className="t-meta dim" style={{ marginLeft: 4 }}>
              créditos
            </span>
          </div>
        </label>

        <label className="credit-modal-field" style={{ marginTop: 16 }}>
          <span className="t-eyebrow">PARA QUÉ</span>
          <textarea
            className="credit-modal-textarea"
            placeholder="Ej: Pitch Manhattan One — necesito 3 modelos de iluminación + 2 sofás para los renders del lunes."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={submitting}
            style={textareaStyle}
          />
          <div
            className="t-meta dim"
            style={{ textAlign: "right", marginTop: 4 }}
          >
            {reason.trim().length}/500
          </div>
        </label>

        {error && (
          <div
            className="t-meta"
            style={{ color: "var(--danger)", marginTop: 8 }}
          >
            ↳ {error}
          </div>
        )}

        <div
          className="row"
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 20,
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
            {submitting ? "enviando…" : "enviar al admin →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
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
  maxWidth: 520,
  boxShadow: "0 16px 60px rgba(0,0,0,0.5)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--fg-mute)",
  cursor: "pointer",
  fontSize: 16,
  padding: 4,
  lineHeight: 1,
};

const stepperBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: "1px solid var(--line-strong)",
  background: "var(--bg)",
  color: "var(--fg)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "var(--mono)",
  fontSize: 16,
};

const amountInputStyle: React.CSSProperties = {
  width: 80,
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--mono)",
  fontSize: 14,
  padding: "6px 10px",
  textAlign: "center",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
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
