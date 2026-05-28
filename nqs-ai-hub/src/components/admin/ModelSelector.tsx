"use client";

/**
 * Selector del modelo de Claude (Haiku/Sonnet/Opus).
 *
 * Cada opción muestra precio + descripción para que el admin decida con
 * info de costo. La opción "currently active" se destaca con un border
 * accent — útil para que el admin vea de un vistazo qué está corriendo
 * en producción sin abrir la versión activa en el sidebar.
 *
 * Si cambia a Haiku o Opus (no Sonnet), pide confirmación porque el
 * prompt suele estar optimizado para Sonnet.
 */
import { useState } from "react";

export type ClaudeModel =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7";

type ModelOption = {
  id: ClaudeModel;
  shortName: string;
  fullName: string;
  pricingIn: string;
  pricingOut: string;
  tagline: string;
};

const OPTIONS: readonly ModelOption[] = [
  {
    id: "claude-haiku-4-5",
    shortName: "Haiku",
    fullName: "Claude Haiku 4.5",
    pricingIn: "$1",
    pricingOut: "$5",
    tagline: "Rápido y barato. Para tareas simples (resumir, traducir).",
  },
  {
    id: "claude-sonnet-4-6",
    shortName: "Sonnet",
    fullName: "Claude Sonnet 4.6",
    pricingIn: "$3",
    pricingOut: "$15",
    tagline: "Balanceado. Recomendado para uso general.",
  },
  {
    id: "claude-opus-4-7",
    shortName: "Opus",
    fullName: "Claude Opus 4.7",
    pricingIn: "$15",
    pricingOut: "$75",
    tagline: "Top capacidad. Para tareas complejas o razonamiento profundo.",
  },
];

type ModelSelectorProps = Readonly<{
  /** Modelo seleccionado en el editor (puede diferir del activo). */
  value: ClaudeModel;
  /** Modelo actualmente corriendo en producción (versión activa). */
  currentlyActive: ClaudeModel;
  onChange: (next: ClaudeModel) => void;
}>;

export function ModelSelector({
  value,
  currentlyActive,
  onChange,
}: ModelSelectorProps) {
  const [pending, setPending] = useState<ClaudeModel | null>(null);

  function attemptChange(next: ClaudeModel) {
    if (next === value) return;
    // Pedimos confirmación si el switch sale o entra a algo que NO es
    // Sonnet (el "balanceado"). Cambios entre Sonnet ↔ algo, en cualquier
    // dirección, son sensibles para calidad y costo.
    const isSwitchFromOrToNonSonnet =
      next !== "claude-sonnet-4-6" || value !== "claude-sonnet-4-6";
    if (isSwitchFromOrToNonSonnet && next !== currentlyActive) {
      setPending(next);
      return;
    }
    onChange(next);
  }

  function confirmPending() {
    if (pending) onChange(pending);
    setPending(null);
  }

  return (
    <div>
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>
        ↳ MODELO DE CLAUDE
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {OPTIONS.map((opt) => {
          const selected = opt.id === value;
          const isActive = opt.id === currentlyActive;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => attemptChange(opt.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
                padding: "14px 14px",
                border: selected
                  ? "1px solid var(--accent)"
                  : "1px solid var(--line)",
                borderRadius: 10,
                background: selected
                  ? "rgba(232, 255, 61, 0.06)"
                  : "var(--bg-elev)",
                color: "var(--fg)",
                cursor: "pointer",
                textAlign: "left",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "1px solid var(--line-strong)",
                      background: selected
                        ? "var(--accent)"
                        : "transparent",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--serif)",
                      fontStyle: "italic",
                      fontSize: 18,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {opt.shortName}
                  </span>
                </div>
                {isActive && (
                  <span
                    className="tag ok"
                    style={{ padding: "1px 6px", fontSize: 9 }}
                  >
                    en uso
                  </span>
                )}
              </div>
              <div className="t-meta dim" style={{ fontSize: 10 }}>
                {opt.fullName}
              </div>
              <div
                className="t-meta"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--fg-mute)",
                }}
              >
                {opt.pricingIn} input · {opt.pricingOut} output / 1M
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-mute)",
                  lineHeight: 1.4,
                  marginTop: 4,
                }}
              >
                {opt.tagline}
              </div>
            </button>
          );
        })}
      </div>

      {pending && (
        <ConfirmModal
          pendingModel={pending}
          currentlyActive={currentlyActive}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}

type ConfirmModalProps = Readonly<{
  pendingModel: ClaudeModel;
  currentlyActive: ClaudeModel;
  onCancel: () => void;
  onConfirm: () => void;
}>;

function ConfirmModal({
  pendingModel,
  currentlyActive,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const opt = OPTIONS.find((o) => o.id === pendingModel);
  const activeOpt = OPTIONS.find((o) => o.id === currentlyActive);
  if (!opt) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 460,
          width: "100%",
        }}
      >
        <div className="t-eyebrow" style={{ color: "var(--warn)" }}>
          ↳ CAMBIO DE MODELO
        </div>
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 24,
            margin: "8px 0 12px",
            letterSpacing: "-0.01em",
          }}
        >
          ¿Pasar de {activeOpt?.shortName ?? currentlyActive} a {opt.shortName}?
        </h2>
        <p
          className="t-meta dim"
          style={{ lineHeight: 1.55, margin: 0 }}
        >
          El prompt actual está optimizado para Sonnet. Cambiar el modelo
          afecta calidad y costo de cada llamada. Pricing nuevo:{" "}
          <strong style={{ color: "var(--fg)" }}>
            {opt.pricingIn} input · {opt.pricingOut} output
          </strong>{" "}
          / 1M tokens.
        </p>
        <p
          className="t-meta dim"
          style={{ marginTop: 10, fontSize: 11 }}
        >
          Recordá: el cambio entra en efecto cuando guardes (modelo solo)
          o cuando actives una nueva versión que use este modelo.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 20,
          }}
        >
          <button
            type="button"
            className="btn secondary"
            onClick={onCancel}
          >
            cancelar
          </button>
          <button type="button" className="btn" onClick={onConfirm}>
            sí, usar {opt.shortName} →
          </button>
        </div>
      </div>
    </div>
  );
}
