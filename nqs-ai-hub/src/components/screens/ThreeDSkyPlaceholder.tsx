/**
 * Placeholder de la vista 3DSky. La vista real (créditos + iframe del
 * proxy) se construye en sesión 09.
 */
import Link from "next/link";

export function ThreeDSkyPlaceholder() {
  return (
    <div className="page">
      <Link
        href="/hub"
        prefetch={false}
        className="t-meta"
        style={{
          color: "var(--fg-mute)",
          textDecoration: "none",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.12em",
          display: "inline-block",
          marginBottom: 24,
        }}
      >
        ← VOLVER AL HUB
      </Link>
      <div className="t-eyebrow" style={{ marginBottom: 12 }}>
        ↳ TOOL · 3DSKY
      </div>
      <h1 className="t-display" style={{ fontSize: 48, margin: 0 }}>
        3DSky <em style={{ fontFamily: "var(--serif)" }}>(próxima sesión)</em>
      </h1>
      <p className="muted" style={{ marginTop: 12, maxWidth: 520 }}>
        La vista con créditos + iframe del proxy se construye en{" "}
        <span className="mono">prompts/mvp/09-3dsky-view.md</span>.
      </p>
    </div>
  );
}
