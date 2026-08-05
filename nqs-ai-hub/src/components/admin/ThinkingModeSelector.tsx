"use client";

/**
 * Selector off / auto para adaptive thinking (System Brain).
 *
 * off  → thinking: { type: "disabled" } (recomendado en Sonnet 5)
 * auto → omitir el campo (default nativo del modelo)
 */
import type { ThinkingMode } from "@/lib/anthropic/thinking-mode";

type ThinkingModeSelectorProps = Readonly<{
  value: ThinkingMode;
  currentlyActive: ThinkingMode;
  onChange: (next: ThinkingMode) => void;
}>;

const OPTIONS: ReadonlyArray<{
  id: ThinkingMode;
  label: string;
  tagline: string;
}> = [
  {
    id: "off",
    label: "Apagado",
    tagline: "Sin adaptive thinking. Más estable para prompts creativos.",
  },
  {
    id: "auto",
    label: "Automático",
    tagline: "Default del modelo (Sonnet 5 lo prende solo).",
  },
];

export function ThinkingModeSelector({
  value,
  currentlyActive,
  onChange,
}: ThinkingModeSelectorProps) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>
        ↳ THINKING
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
              onClick={() => onChange(opt.id)}
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
                      background: selected ? "var(--accent)" : "transparent",
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
                    {opt.label}
                  </span>
                </div>
                {isActive && (
                  <span
                    className="t-meta"
                    style={{
                      color: "var(--accent)",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    activo
                  </span>
                )}
              </div>
              <span className="t-meta dim" style={{ fontSize: 12 }}>
                {opt.tagline}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
