"use client";

/**
 * Ticker de frases del manifesto NQS en la columna izquierda del login.
 * Adaptado de design/screens.jsx (líneas 1148-1234).
 *
 * Variantes:
 *   - "cube"    → dos columnas con relojes desfasados (default).
 *   - "stack"   → una sola fila que rota, con pips abajo.
 *   - "marquee" → scroll horizontal infinito.
 */
import { useEffect, useState } from "react";

type Phrase = {
  kicker: string;
  text: string;
  accent: string;
};

export const TICKER_PHRASES: readonly Phrase[] = [
  { kicker: "MANIFIESTO", text: "No reemplazamos el oficio. Lo aceleramos.", accent: "#D97757" },
  { kicker: "PRINCIPIO",  text: "Una llave para todo el stack creativo.", accent: "#9B7EFF" },
  { kicker: "MÉTODO",     text: "Dirigido, no generado. Siempre con criterio.", accent: "#5BC0EB" },
  { kicker: "VALOR",      text: "Velocidad sin perder el oficio.", accent: "#4FD1C5" },
  { kicker: "ENFOQUE",    text: "Dueños de nuestro stack, dueños de nuestra obra.", accent: "#FF6B9D" },
  { kicker: "RITMO",      text: "Iterar diez veces antes que pulir una.", accent: "#FFB800" },
  { kicker: "OFICIO",     text: "La idea manda. La herramienta acompaña.", accent: "#FF6B6B" },
  { kicker: "DISCIPLINA", text: "Hecho a mano, con la potencia de la máquina.", accent: "#A78BFA" },
] as const;

export type LoginTickerVariant = "cube" | "stack" | "marquee";

type LoginTickerProps = Readonly<{
  variant?: LoginTickerVariant;
}>;

const KICKER_STYLE: React.CSSProperties = {
  fontStyle: "normal",
  fontFamily: "var(--mono)",
  fontSize: 9,
  letterSpacing: "0.16em",
};

export function LoginTicker({ variant = "cube" }: LoginTickerProps) {
  if (variant === "marquee") return <MarqueeVariant />;
  if (variant === "stack") return <StackVariant />;
  return <CubeVariant />;
}

function CubeVariant() {
  return (
    <div className="login-cube" aria-label="actualidad NQS">
      <div className="login-cube-row">
        <TickerCol startAt={0} interval={3800} />
        <div className="login-cube-divider" />
        <TickerCol startAt={3} interval={5200} />
      </div>
    </div>
  );
}

type TickerColProps = Readonly<{
  startAt?: number;
  interval?: number;
}>;

function TickerCol({ startAt = 0, interval = 4200 }: TickerColProps) {
  const [k, setK] = useState(startAt);

  useEffect(() => {
    const id = window.setInterval(
      () => setK((x) => (x + 1) % TICKER_PHRASES.length),
      interval,
    );
    return () => window.clearInterval(id);
  }, [interval]);

  return (
    <div className="login-cube-stage">
      {TICKER_PHRASES.map((p, idx) => {
        const offset = (idx - k + TICKER_PHRASES.length) % TICKER_PHRASES.length;
        return (
          <div key={p.kicker} className="login-cube-face" data-offset={offset}>
            <em style={{ ...KICKER_STYLE, color: p.accent }}>↳ {p.kicker}</em>
            <div className="login-cube-text">{p.text}</div>
          </div>
        );
      })}
    </div>
  );
}

function StackVariant() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setI((x) => (x + 1) % TICKER_PHRASES.length),
      4200,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="login-stack" aria-label="actualidad NQS">
      <div className="login-stack-window">
        {TICKER_PHRASES.map((p, k) => (
          <div
            key={p.kicker}
            className={"login-stack-row " + (k === i ? "is-active" : "")}
          >
            <em style={{ ...KICKER_STYLE, color: p.accent }}>↳ {p.kicker}</em>
            <div className="login-stack-text">{p.text}</div>
          </div>
        ))}
      </div>
      <div className="login-stack-pips">
        {TICKER_PHRASES.map((p, k) => (
          <span key={p.kicker} className={k === i ? "is-active" : ""} />
        ))}
      </div>
    </div>
  );
}

function MarqueeVariant() {
  const items = [...TICKER_PHRASES, ...TICKER_PHRASES];
  return (
    <div className="login-marquee" aria-label="actualidad NQS">
      <div className="login-marquee-track">
        {items.map((p, k) => (
          <span key={`${p.kicker}-${k}`} className="login-marquee-item">
            <em
              style={{
                ...KICKER_STYLE,
                color: p.accent,
                marginRight: 8,
              }}
            >
              ↳ {p.kicker}
            </em>
            <span>{p.text}</span>
            <span className="login-marquee-sep">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
