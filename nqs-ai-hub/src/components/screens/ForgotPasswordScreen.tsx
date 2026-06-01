"use client";

/**
 * Pantalla "¿olvidaste tu pass?" — pide el email y dispara el mail de
 * recuperación de Supabase Auth.
 *
 * Usa el cliente ANON del browser (`createBrowserClient`) porque
 * `resetPasswordForEmail` es una operación pública/no autenticada,
 * pensada para correr client-side. El link del mail apunta a
 * `${NEXT_PUBLIC_APP_URL}/reset-password`, donde el user setea la nueva
 * password.
 *
 * FEEDBACK NQS v2.0: bug "¿olvidaste tu pass?" — antes el link hacía
 * router.refresh() y no hacía nada. Ahora el flujo es end-to-end.
 *
 * Nota: el mail por ahora es el default de Supabase Auth. El customizado
 * con Resend va en el prompt 18.
 */
import { useState } from "react";
import Link from "next/link";
import { NqsLogo } from "@/components/ui/NqsLogo";
import { createBrowserClient } from "@/lib/db/supabase";

function resetRedirectUrl(): string {
  // NEXT_PUBLIC_APP_URL se referencia estático para que Next lo incruste
  // en el bundle. Fallback al origin actual si no está seteada.
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/reset-password`;
}

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setErrorMsg("ingresá tu email");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: resetRedirectUrl(),
      });
      // No revelamos si el email existe o no (no enumeration): mostramos
      // el mismo mensaje de éxito siempre, salvo error de red real.
      if (error && error.status && error.status >= 500) {
        setErrorMsg("hubo un problema, probá de nuevo en un momento");
        setBusy(false);
        return;
      }
      setSent(true);
    } catch {
      setErrorMsg("error de red, probá de nuevo");
    } finally {
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
            <div className="t-eyebrow">↳ RECUPERAR ACCESO</div>
          </div>
          <h1 className="login-title">¿Olvidaste tu pass?</h1>

          {sent ? (
            <>
              <p
                className="t-meta"
                style={{ lineHeight: 1.6, color: "var(--fg-mute)", margin: 0 }}
              >
                Si <strong>{email.trim().toLowerCase()}</strong> tiene una
                cuenta, te enviamos un mail para resetear tu password. Revisá
                tu bandeja (y el spam).
              </p>
              <div className="login-actions">
                <Link href="/login" className="btn" style={{ width: "100%" }}>
                  Volver al ingreso →
                </Link>
              </div>
            </>
          ) : (
            <>
              <p
                className="t-meta"
                style={{ lineHeight: 1.6, color: "var(--fg-mute)", margin: 0 }}
              >
                Ingresá tu email y te mandamos un link para crear una nueva
                contraseña.
              </p>
              <form className="login-fields" onSubmit={submit} noValidate>
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
                    {busy ? "enviando…" : "Enviar link →"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="login-foot">
          <div>NQS CREATIVE © 2026</div>
          <Link href="/login" className="btn-link">
            ← volver al ingreso
          </Link>
        </div>
      </div>
    </div>
  );
}
