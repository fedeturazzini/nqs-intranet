"use client";

/**
 * Overlay que se renderea sobre el iframe cuando el user llegó a 0
 * créditos durante la sesión activa (ej. declaró todo lo que tenía).
 *
 * Adaptado de design/screens.jsx CreditsBlockOverlay (líneas 348-373).
 * Diferencia: el copy fue redactado en el prompt nuevo de NQS, lo
 * usamos textual.
 */
type CreditsBlockOverlayProps = Readonly<{
  onRequestMore: () => void;
  onBackToHub: () => void;
}>;

export function CreditsBlockOverlay({
  onRequestMore,
  onBackToHub,
}: CreditsBlockOverlayProps) {
  return (
    <div
      className="credits-block-overlay"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(10, 9, 8, 0.92)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        className="credits-block-card"
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          padding: 28,
          maxWidth: 460,
          textAlign: "center",
        }}
      >
        <div className="t-eyebrow" style={{ color: "var(--danger)" }}>
          ↳ SIN CRÉDITOS
        </div>
        <div
          className="credits-block-title"
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 32,
            margin: "12px 0 10px",
            letterSpacing: "-0.01em",
          }}
        >
          Te quedaste sin créditos.
        </div>
        <p
          className="credits-block-desc t-meta dim"
          style={{ lineHeight: 1.6, margin: 0 }}
        >
          Para seguir comprando modelos en 3DSky, pedile más créditos al
          admin. El admin recibe una notificación inmediata por Slack.
        </p>
        <div
          className="row"
          style={{
            display: "flex",
            gap: 10,
            marginTop: 22,
            justifyContent: "center",
          }}
        >
          <button type="button" className="btn" onClick={onRequestMore}>
            solicitar más créditos
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={onBackToHub}
          >
            volver al hub
          </button>
        </div>
      </div>
    </div>
  );
}
