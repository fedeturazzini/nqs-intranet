/**
 * Tile compacto de stat para el overview del admin.
 * Adaptado del design system del cliente (eyebrow + número grande).
 */
type StatTileProps = Readonly<{
  label: string;
  value: number | string;
  unit?: string;
  accent?: string;
}>;

export function StatTile({ label, value, unit, accent }: StatTileProps) {
  return (
    <div
      style={{
        padding: "18px 18px",
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div className="t-eyebrow" style={{ color: "var(--fg-mute)" }}>
        ↳ {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          color: accent ?? "var(--fg)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 40,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="t-meta dim"
            style={{ fontSize: 11 }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
