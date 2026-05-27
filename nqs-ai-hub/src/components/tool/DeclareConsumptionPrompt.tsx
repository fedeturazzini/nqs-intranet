"use client";

/**
 * Modal que pide al user que declare cuántos créditos consumió antes
 * de salir del módulo 3DSky.
 *
 * Esc cierra el modal (= "cancelar"). Click fuera del card también.
 * El primer input recibe foco al abrir.
 */
import { useEffect, useRef, useState } from "react";

type DeclareConsumptionPromptProps = Readonly<{
  open: boolean;
  maxAvailable: number;
  isSubmitting: boolean;
  /** Cierra sin declarar (= 0 implícito). */
  onCancel: () => void;
  /** Confirmar con `amount` créditos. */
  onConfirm: (amount: number) => void;
}>;

export function DeclareConsumptionPrompt({
  open,
  maxAvailable,
  isSubmitting,
  onCancel,
  onConfirm,
}: DeclareConsumptionPromptProps) {
  const [amount, setAmount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset state cuando se cierra/reabre.
  useEffect(() => {
    if (open) {
      setAmount(0);
      // pequeño delay para asegurar que el input está mounted.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const overMax = amount > maxAvailable;
  const canSubmit = !isSubmitting && amount >= 0 && !overMax;

  return (
    <div
      className="credit-modal-backdrop"
      onClick={onCancel}
      style={backdropStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="declare-title"
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
          <div className="t-eyebrow">↳ DECLARAR CONSUMO · 3DSKY</div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>

        <h2
          id="declare-title"
          className="credit-modal-title"
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 28,
            margin: "8px 0 6px",
            letterSpacing: "-0.01em",
          }}
        >
          ¿Descargaste algún modelo?
        </h2>
        <p className="t-meta dim" style={{ lineHeight: 1.55, margin: 0 }}>
          Si compraste modelos en 3DSky, contanos cuántos créditos consumiste
          para descontarlos. Si no descargaste nada, dejá en 0.
        </p>

        <label className="credit-modal-field" style={{ marginTop: 20 }}>
          <span className="t-eyebrow">CRÉDITOS USADOS</span>
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
              onClick={() => setAmount((a) => Math.max(0, a - 1))}
              disabled={isSubmitting || amount === 0}
              style={stepperBtnStyle}
            >
              −
            </button>
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={maxAvailable}
              value={amount}
              onChange={(e) =>
                setAmount(
                  Math.max(
                    0,
                    Math.min(maxAvailable, parseInt(e.target.value, 10) || 0),
                  ),
                )
              }
              disabled={isSubmitting}
              style={amountInputStyle}
            />
            <button
              type="button"
              onClick={() =>
                setAmount((a) => Math.min(maxAvailable, a + 1))
              }
              disabled={isSubmitting || amount >= maxAvailable}
              style={stepperBtnStyle}
            >
              +
            </button>
            <span className="t-meta dim" style={{ marginLeft: 4 }}>
              / {maxAvailable} disponibles
            </span>
          </div>
          {overMax && (
            <div
              className="t-meta"
              style={{ color: "var(--danger)", marginTop: 6 }}
            >
              ↳ no podés declarar más créditos de los que tenés
            </div>
          )}
        </label>

        <div
          className="row"
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 24,
          }}
        >
          <button
            type="button"
            className="btn secondary"
            onClick={() => onConfirm(0)}
            disabled={isSubmitting}
          >
            salir sin declarar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onConfirm(amount)}
            disabled={!canSubmit}
          >
            {isSubmitting ? "guardando…" : "confirmar y salir →"}
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
  maxWidth: 480,
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
