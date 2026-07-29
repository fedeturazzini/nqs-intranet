"use client";

/**
 * Refresh PROACTIVO de sesión.
 *
 * Montado en el layout `(dashboard)` → corre en TODA la app autenticada y
 * persiste entre navegaciones soft (el layout no se desmonta al cambiar de
 * sección). Renueva el JWT (~1h) ANTES de que venza, así navegar entre
 * secciones o quedarse un rato NO desloguea (fix NQS 3/7).
 *
 * Reusa el endpoint que ya usa el chat: POST /api/auth/refresh (rota las cookies).
 * Esta es la capa proactiva; el "401 → refresh" del chat sigue como red reactiva.
 *
 * - No redirige si el refresh falla: la próxima navegación / el path reactivo
 *   manejan el re-login (no disruptivo).
 * - Se desmonta al ir a /login (logout navega fuera de (dashboard)) → no revive
 *   la sesión después de cerrar.
 */
import { useEffect, useRef } from "react";

type Props = Readonly<{ expiresAtMs: number }>;

/** Refrescamos este margen ANTES de que venza el token. */
const SKEW_MS = 5 * 60 * 1000;
/** Piso del delay (si ya está por vencer, no disparamos en 0). */
const MIN_DELAY_MS = 1_000;
/** Techo de seguridad por si el exp viniera raro. */
const MAX_DELAY_MS = 60 * 60 * 1000;
/** Backoff ante error de red (no matamos el loop). */
const RETRY_MS = 60_000;

export function SessionKeepAlive({ expiresAtMs }: Props) {
  // exp vigente (se actualiza con cada refresh). Ref para no re-montar el efecto.
  const expRef = useRef(expiresAtMs);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const nextDelay = () => {
      const d = expRef.current - SKEW_MS - Date.now();
      return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, d));
    };

    const schedule = () => {
      clearTimer();
      if (!cancelled) timer = setTimeout(run, nextDelay());
    };

    const run = async () => {
      if (cancelled || refreshing) return;
      refreshing = true;
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok) return; // sesión muerta → cortamos; el re-login lo maneja otro path
        const data = (await res.json().catch(() => null)) as
          | { expiresAt?: number }
          | null;
        expRef.current =
          data && typeof data.expiresAt === "number"
            ? data.expiresAt
            : Date.now() + 55 * 60 * 1000; // sin exp en la respuesta → asumimos ~1h fresco
        if (!cancelled) schedule();
      } catch {
        // Error de red: reintentamos en un rato en vez de matar el loop.
        if (!cancelled) {
          clearTimer();
          timer = setTimeout(run, RETRY_MS);
        }
      } finally {
        refreshing = false;
      }
    };

    // Si el timer se atrasó (tab en background / sleep de la máquina) y ya toca,
    // refrescamos al volver a foco en vez de esperar.
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= expRef.current - SKEW_MS
      ) {
        void run();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
