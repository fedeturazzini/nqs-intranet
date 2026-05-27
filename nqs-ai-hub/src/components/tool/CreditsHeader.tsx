"use client";

/**
 * Header de créditos para la vista 3DSky.
 * Adaptado de design/screens.jsx líneas 467-485 (ThreeDSkyMock hero).
 *
 * Color de la barra:
 *   - verde (--ok)      si > 50%
 *   - amarillo (--warn) si 20-50%
 *   - rojo (--danger)   si < 20%
 *   - gris (--line)     si == 0 (overlay tomará el render)
 */
type CreditsHeaderProps = Readonly<{
  credits: number;
  creditsTotal: number;
  onRequestMore: () => void;
}>;

export function CreditsHeader({
  credits,
  creditsTotal,
  onRequestMore,
}: CreditsHeaderProps) {
  const used = Math.max(0, creditsTotal - credits);
  const usedPct = creditsTotal > 0 ? (used / creditsTotal) * 100 : 0;
  const availablePct = creditsTotal > 0 ? (credits / creditsTotal) * 100 : 0;

  let barColor: string;
  if (creditsTotal === 0 || credits === 0) barColor = "var(--line-strong)";
  else if (availablePct > 50) barColor = "var(--ok)";
  else if (availablePct > 20) barColor = "var(--warn)";
  else barColor = "var(--danger)";

  return (
    <div
      className="threedsky-hero"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 24,
        padding: "20px 32px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div>
        <div className="t-eyebrow">↳ TUS CRÉDITOS · ESTE MES</div>
        <div
          className="threedsky-credits"
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginTop: 6,
          }}
        >
          <span
            className="threedsky-credits-n"
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 56,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
            }}
          >
            {credits}
          </span>
          <span
            className="threedsky-credits-of t-meta"
            style={{ fontSize: 12, color: "var(--fg-mute)" }}
          >
            de {creditsTotal}
          </span>
        </div>
        <div
          className="meter"
          style={{ width: 320, height: 4, marginTop: 10 }}
          role="progressbar"
          aria-label="créditos usados"
          aria-valuenow={usedPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="meter-fill"
            style={{
              width: `${usedPct}%`,
              background: barColor,
              transition: "width 0.4s, background 0.4s",
            }}
          />
        </div>
        <div className="t-meta dim" style={{ marginTop: 8 }}>
          {used} usados · {credits} disponibles
        </div>
      </div>

      <div
        className="threedsky-cta"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
        }}
      >
        <button
          type="button"
          className="btn secondary"
          onClick={onRequestMore}
        >
          solicitar más créditos
        </button>
        <div className="t-meta dim" style={{ marginTop: 6 }}>
          el admin recibirá tu pedido
        </div>
      </div>
    </div>
  );
}
