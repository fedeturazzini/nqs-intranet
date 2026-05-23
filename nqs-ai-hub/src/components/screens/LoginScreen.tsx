"use client";

/**
 * Login del NQS AI Hub. Adaptado de design/screens.jsx líneas 4-95.
 *
 * Diferencias vs. el original:
 *   - El campo "USUARIO" es ahora EMAIL — Supabase Auth indexa por email.
 *   - El switch user/admin queda como UX (pre-rellena el email), pero el
 *     rol REAL se determina server-side leyendo `public.users.role`. El
 *     frontend nunca le dice al backend "soy admin".
 *   - El submit pega a POST /api/auth/login, y redirige al destino que el
 *     server diga (/hub o /admin).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NqsLogo } from "@/components/ui/NqsLogo";
import { LoginTicker, type LoginTickerVariant } from "./LoginTicker";

type LoginScreenProps = Readonly<{
  tickerVariant?: LoginTickerVariant;
  /** Fecha mostrada arriba del card, "DD.MM.YYYY". Se calcula en server. */
  displayDate: string;
}>;

type Role = "user" | "admin";

// Pre-rellena del switch — solo conveniencia, no controla autorización.
const PREFILL: Record<Role, string> = {
  user: "sofia@nqs.test",
  admin: "tomas@nqs.test",
};

type LoginResponse =
  | { ok: true; redirect: string; user: { name: string; role: string } }
  | { ok: false; error: string };

export function LoginScreen({
  tickerVariant = "cube",
  displayDate,
}: LoginScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");

  const [role, setRole] = useState<Role>("user");
  const [email, setEmail] = useState<string>(PREFILL.user);
  const [password, setPassword] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cambio de switch pre-rellena el email, sin pisar lo que el user tipeó.
  // Heurística: si el email actual es uno de los pre-fills, lo cambiamos.
  useEffect(() => {
    if (Object.values(PREFILL).includes(email)) {
      setEmail(PREFILL[role]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const shakeTimer = useRef<number | null>(null);
  function triggerShake() {
    setShake(true);
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 400);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!email || !password) {
      triggerShake();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as LoginResponse;

      if (!body.ok) {
        triggerShake();
        setErrorMsg(body.error);
        setBusy(false);
        return;
      }

      const target = nextPath && nextPath.startsWith("/") ? nextPath : body.redirect;
      // Hard nav: que el proxy lea las cookies nuevas en limpio.
      window.location.href = target;
    } catch {
      triggerShake();
      setErrorMsg("error de red, probá de nuevo");
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="bracket tl" />
        <div className="bracket tr" />
        <div className="bracket bl" />
        <div className="bracket br" />

        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <div className="brand brand-lg">
            <NqsLogo size={48} variant="wide" />
            <span style={{ display: "none" }}>NQS · INTRANET</span>
          </div>
          <div className="t-meta">v 2.04 · NEXT LAYER</div>
        </div>

        <div style={{ marginTop: "auto", marginBottom: "auto" }}>
          <div
            className="t-eyebrow"
            style={{ marginBottom: 24, letterSpacing: "-0.2px" }}
          >
            ↳ Bienvenidos al estudio
          </div>
          <div
            className="login-hero"
            style={{ letterSpacing: "2.8px", lineHeight: "0.75" }}
          >
            Todo lo que <em>somos</em>,
            <br />
            en un solo lugar.
          </div>
          <div className="login-sub">
            Tu base de operaciones diaria. Herramientas, playbooks,
            organigrama, workflows y todo lo que necesitás para crear con
            NQS — listo y a un click.
          </div>
        </div>

        <LoginTicker variant={tickerVariant} />
      </div>

      <div className="login-right">
        <div
          className="login-card"
          style={{ transform: shake ? "translateX(-4px)" : undefined }}
        >
          <div className="login-eyebrow">
            <div className="t-eyebrow">↳ INGRESO</div>
            <div className="t-meta">{displayDate}</div>
          </div>
          <h1 className="login-title">Hola de nuevo.</h1>
          <p
            className="t-meta"
            style={{ lineHeight: 1.6, color: "var(--fg-mute)", margin: 0 }}
          >
            Ingresá con tu usuario de NQS para acceder a tu workspace.
          </p>

          <form className="login-fields" onSubmit={submit} noValidate>
            <div>
              <div className="field-label">¿CÓMO INGRESÁS?</div>
              <div className="row" style={{ gap: 6 }}>
                <RoleSwitch
                  active={role === "user"}
                  onClick={() => setRole("user")}
                  label="como usuario"
                />
                <RoleSwitch
                  active={role === "admin"}
                  onClick={() => setRole("admin")}
                  label="como admin"
                />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="field-label">EMAIL</div>
              <input
                className="field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@nqs.test"
                autoFocus
                disabled={busy}
              />
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="field-label">CONTRASEÑA</div>
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                disabled={busy}
              />
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="t-meta"
                style={{
                  color: "var(--danger, #ff6b6b)",
                  marginTop: 6,
                  letterSpacing: "0.04em",
                }}
              >
                ↳ {errorMsg}
              </div>
            )}

            <div className="login-actions">
              <button
                type="submit"
                className="btn"
                style={{ width: "100%" }}
                disabled={busy}
              >
                {busy
                  ? "ingresando…"
                  : `Ingresar ${role === "admin" ? "como admin " : ""}→`}
              </button>
            </div>
          </form>
        </div>

        <div className="login-foot">
          <div>NQS CREATIVE © 2026</div>
          <div className="row" style={{ gap: 18 }}>
            <span
              className="btn-link"
              role="button"
              tabIndex={0}
              onClick={() => router.refresh()}
            >
              ¿olvidaste tu pass?
            </span>
            <span>SUPPORT · #ai-hub</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type RoleSwitchProps = Readonly<{
  active: boolean;
  onClick: () => void;
  label: string;
}>;

function RoleSwitch({ active, onClick, label }: RoleSwitchProps) {
  return (
    <button
      type="button"
      className="btn sm"
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--accent-fg)" : "var(--fg-mute)",
        border: active ? "0" : "1px solid var(--line-strong)",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
