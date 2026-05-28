"use client";

/**
 * Modal "comprar más créditos". El admin registra una compra que ya
 * hizo manualmente en 3DSky. NO compra en 3DSky desde acá — la
 * plataforma solo guarda el registro para sumar al pool.
 */
import { useEffect, useRef, useState } from "react";
import { showToast } from "@/lib/store/toast";

type BuyCreditsModalProps = Readonly<{
  toolId: string;
  onClose: () => void;
  /** Llamado con la cantidad de créditos sumados al pool. */
  onPurchased: (added: number) => void;
}>;

export function BuyCreditsModal({
  toolId,
  onClose,
  onPurchased,
}: BuyCreditsModalProps) {
  const [credits, setCredits] = useState<number>(50);
  const [costUsd, setCostUsd] = useState<number>(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = !busy && credits >= 1 && credits <= 1_000_000;

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/credits/pools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolId,
          totalCredits: credits,
          costUsd: costUsd > 0 ? costUsd : undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as
        | { pool: { total_credits: number } }
        | { error: string; message?: string };
      if (!res.ok || "error" in data) {
        setError(
          "message" in data && data.message ? data.message : "no_purchase_logged",
        );
        setBusy(false);
        return;
      }
      showToast({
        title: "COMPRA REGISTRADA",
        msg: `+${credits} créditos sumados al pool de ${toolId}.`,
        color: "var(--ok)",
      });
      onPurchased(credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="buy-credits-title"
      onClick={onClose}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={hdStyle}>
          <div className="t-eyebrow">↳ COMPRAR MÁS CRÉDITOS</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>

        <h2 id="buy-credits-title" style={titleStyle}>
          Registrar compra en {toolId}
        </h2>
        <p className="t-meta dim" style={{ lineHeight: 1.5, margin: 0 }}>
          Comprá los créditos en {toolId === "3dsky" ? "3dsky.org" : toolId} con tu cuenta admin y registralos
          acá. Esta vista solo lleva el log — no compra nada por vos.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
          <Field label="CRÉDITOS COMPRADOS">
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={1_000_000}
              value={credits}
              onChange={(e) =>
                setCredits(
                  Math.max(
                    1,
                    Math.min(1_000_000, parseInt(e.target.value, 10) || 1),
                  ),
                )
              }
              disabled={busy}
              style={inputStyle}
            />
          </Field>
          <Field label="COSTO EN USD (opcional)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={costUsd || ""}
              onChange={(e) => setCostUsd(parseFloat(e.target.value) || 0)}
              disabled={busy}
              placeholder="180.00"
              style={inputStyle}
            />
          </Field>
          <Field label="NOTA (opcional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              rows={2}
              maxLength={500}
              placeholder="Ej: pagué con la tarjeta corp el 27/05/2026, factura #12345"
              style={textareaStyle}
            />
          </Field>
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
            onClick={onClose}
            disabled={busy}
          >
            cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {busy ? "registrando…" : `registrar +${credits} →`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label style={{ display: "block" }}>
      <span
        className="t-eyebrow"
        style={{ display: "block", marginBottom: 6 }}
      >
        {label}
      </span>
      {children}
    </label>
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
  maxWidth: 480,
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
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--mono)",
  fontSize: 14,
  padding: "8px 10px",
  outline: "none",
};
const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--sans)",
  fontSize: 13,
  padding: "10px 12px",
  outline: "none",
  resize: "vertical",
  lineHeight: 1.5,
};
