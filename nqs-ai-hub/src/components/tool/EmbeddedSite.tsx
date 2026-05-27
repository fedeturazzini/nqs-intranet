"use client";

/**
 * Iframe del sitio externo con preloader animado.
 *
 * Adaptado de design/screens.jsx EmbeddedSite (líneas 567-669). Cambios
 * vs. el original:
 *   - NO hay proxy. URL directa al sitio externo.
 *   - Si el sitio bloquea iframe (X-Frame-Options) el `onLoad` igual
 *     dispara con un about:blank, pero el contenido queda en blanco.
 *     Detectamos esto con un timeout de 9s y mostramos un fallback con
 *     botón "abrir en nueva pestaña".
 *   - El iframe se monta UNA vez y nunca se desmonta para no recargar.
 *
 * Sandbox: 3DSky necesita cookies + scripts + forms para login propio
 * del user. `allow-same-origin + allow-scripts` desactiva el sandbox
 * de seguridad — aceptable porque el iframe es de un sitio que el user
 * ya tiene credentials/acceso por separado.
 */
import { useEffect, useState } from "react";

const STEP_LABELS = [
  "verificando permiso",
  "cargando catálogo",
  "listo",
] as const;

const HARD_TIMEOUT_MS = 9_000;

type EmbeddedSiteProps = Readonly<{
  url: string;
  title?: string;
  brandColor?: string;
  brandGlyph?: string;
}>;

export function EmbeddedSite({
  url,
  title = "Sitio externo",
  brandColor = "#4FD1C5",
  brandGlyph = "◈",
}: EmbeddedSiteProps) {
  const [step, setStep] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Animación del preloader: 3 pasos.
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep(1), 700),
      window.setTimeout(() => setStep(2), 1400),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  // Hard timeout: si el iframe no carga en 9s → fallback.
  useEffect(() => {
    if (iframeLoaded) return;
    const t = window.setTimeout(() => {
      if (!iframeLoaded) setError(true);
    }, HARD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [iframeLoaded]);

  const showPreloader = !error && (step < 2 || !iframeLoaded);

  return (
    <div
      className="embed-wrap"
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <iframe
        src={url}
        title={title}
        onLoad={() => setIframeLoaded(true)}
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          background: "#fff",
        }}
        allow="autoplay; fullscreen; clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
      />

      {showPreloader && (
        <div
          className="embed-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--bg)",
            display: "grid",
            placeItems: "center",
            padding: 40,
          }}
        >
          <div
            className="embed-auth"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              maxWidth: 360,
              textAlign: "center",
            }}
          >
            <div
              className="embed-auth-glyph"
              style={{
                color: brandColor,
                fontFamily: "var(--serif)",
                fontSize: 80,
                lineHeight: 1,
              }}
            >
              {brandGlyph}
            </div>
            <div
              className="embed-auth-title"
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 32,
              }}
            >
              {title}
            </div>
            <div className="embed-auth-steps" style={{ marginTop: 8 }}>
              {STEP_LABELS.map((s, i) => {
                const state =
                  step > i ? "done" : step === i ? "active" : "pending";
                return (
                  <div
                    key={s}
                    className={`embed-auth-step ${state}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "4px 0",
                      color:
                        state === "done"
                          ? "var(--fg)"
                          : state === "active"
                            ? "var(--accent)"
                            : "var(--fg-mute)",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span style={{ width: 16, textAlign: "center" }}>
                      {state === "done" ? "✓" : state === "active" ? "●" : "·"}
                    </span>
                    <span>{s}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          className="embed-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--bg)",
            display: "grid",
            placeItems: "center",
            padding: 40,
          }}
        >
          <div
            className="embed-fallback"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              maxWidth: 420,
              textAlign: "center",
            }}
          >
            <div
              className="embed-fallback-glyph"
              style={{
                color: brandColor,
                fontFamily: "var(--serif)",
                fontSize: 80,
                lineHeight: 1,
              }}
            >
              {brandGlyph}
            </div>
            <div
              className="embed-fallback-title"
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 28,
              }}
            >
              No pudimos abrir {title} embebido.
            </div>
            <div className="t-meta dim" style={{ lineHeight: 1.6 }}>
              El sitio puede estar bloqueando el iframe. Probá abrir en una
              nueva pestaña — la sesión sigue activa en este módulo.
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ marginTop: 8 }}
            >
              abrir en nueva pestaña →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
