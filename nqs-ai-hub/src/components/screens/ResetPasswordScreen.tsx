"use client";

/**
 * Pantalla /reset-password — destino del link que manda Supabase Auth.
 *
 * Flujo:
 *   1. El user llega desde el mail con un token de recovery en el hash de
 *      la URL (#access_token=...&type=recovery). El cliente del browser
 *      (createBrowserClient, con `detectSessionInUrl` por default) lo
 *      detecta y emite `PASSWORD_RECOVERY` → establece una sesión temporal.
 *   2. Mostramos el form de nueva password.
 *   3. `updateUser({ password })` setea la nueva pass usando esa sesión.
 *   4. Cerramos sesión y redirigimos a /login para que entre con la nueva.
 *
 * FEEDBACK NQS v2.0: parte del bug "¿olvidaste tu pass?".
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NqsLogo } from "@/components/ui/NqsLogo";
import { createBrowserClient } from "@/lib/db/supabase";
import { showToast } from "@/lib/store/toast";
import type { SupabaseClient } from "@supabase/supabase-js";

type Phase = "verifying" | "ready" | "invalid" | "done";

export function ResetPasswordScreen() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabaseRef.current = supabase;

    // El evento PASSWORD_RECOVERY se dispara cuando el cliente parsea el
    // token del hash. Tambien chequeamos getSession por si ya se procesó
    // antes de montar el listener.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setPhase("ready");
      }
    });

    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setPhase("ready");
      } else {
        // Damos un margen para que el listener procese el hash; si tras
        // un tick no hay sesión, el link es inválido/expiró.
        setTimeout(() => {
          if (!cancelled && supabaseRef.current) {
            void supabaseRef.current.auth
              .getSession()
              .then(({ data: d }) => {
                if (!cancelled && !d.session) setPhase("invalid");
              });
          }
        }, 1200);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg("la contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("las contraseñas no coinciden");
      return;
    }
    const supabase = supabaseRef.current;
    if (!supabase) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(error.message || "no pudimos actualizar la password");
        setBusy(false);
        return;
      }
      // Cerramos la sesión temporal de recovery — el user vuelve a loguear.
      await supabase.auth.signOut();
      setPhase("done");
      showToast({
        title: "PASSWORD ACTUALIZADA",
        msg: "Ya podés ingresar con tu nueva contraseña.",
        color: "var(--ok, #4ade80)",
      });
      setTimeout(() => router.push("/login"), 1500);
    } catch {
      setErrorMsg("error de red, probá de nuevo");
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-right" style={{ margin: "auto", maxWidth: 440 }}>
        <div className="login-card">
          <div className="brand" style={{ marginBottom: 18 }}>
            <NqsLogo size={36} variant="wide" />
          </div>
          <div className="login-eyebrow">
            <div className="t-eyebrow">↳ NUEVA CONTRASEÑA</div>
          </div>
          <h1 className="login-title">Reseteá tu pass.</h1>

          {phase === "verifying" && (
            <p className="t-meta" style={{ color: "var(--fg-mute)", margin: 0 }}>
              Verificando el link…
            </p>
          )}

          {phase === "invalid" && (
            <>
              <p
                className="t-meta"
                style={{ lineHeight: 1.6, color: "var(--fg-mute)", margin: 0 }}
              >
                Este link no es válido o ya expiró. Pedí uno nuevo desde
                "¿olvidaste tu pass?".
              </p>
              <div className="login-actions">
                <Link
                  href="/forgot-password"
                  className="btn"
                  style={{ width: "100%" }}
                >
                  Pedir un nuevo link →
                </Link>
              </div>
            </>
          )}

          {phase === "done" && (
            <p className="t-meta" style={{ color: "var(--fg-mute)", margin: 0 }}>
              Listo. Redirigiendo al ingreso…
            </p>
          )}

          {phase === "ready" && (
            <>
              <p
                className="t-meta"
                style={{ lineHeight: 1.6, color: "var(--fg-mute)", margin: 0 }}
              >
                Elegí una contraseña nueva (mínimo 8 caracteres).
              </p>
              <form className="login-fields" onSubmit={submit} noValidate>
                <div style={{ marginTop: 14 }}>
                  <div className="field-label">NUEVA CONTRASEÑA</div>
                  <input
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    autoFocus
                    disabled={busy}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="field-label">REPETÍ LA CONTRASEÑA</div>
                  <input
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
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
                    {busy ? "guardando…" : "Guardar y volver →"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
