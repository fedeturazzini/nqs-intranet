"use client";

/**
 * Hook que maneja el ciclo de vida de una sesión del módulo 3DSky.
 *
 * Al montar:
 *   1. POST /api/tools/3dsky/session/start → guardamos sessionId.
 *   2. GET  /api/tools/3dsky/credits → hidratamos contador inicial.
 *
 * Al desmontar (sin que el user haya declarado):
 *   - sendBeacon a /session/end con declaredConsumption=0. Esto cubre
 *     el caso "cerró la tab" — el beacon viaja aunque la página muera.
 *
 * Métodos expuestos:
 *   - `declareAndEnd(amount)` → cierra con declared = amount, refresca
 *      contador.
 *   - `refreshCredits()` → re-fetcha el contador (post-aprobación, etc.).
 *
 * Inicia con `initialCredits` que viene del Server Component (evita un
 * flash de "0/0" mientras el primer fetch corre).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type CreditsState = {
  credits: number;
  creditsTotal: number;
  used: number;
};

export type UseThreeDSkySession = {
  sessionId: string | null;
  credits: CreditsState;
  isStarting: boolean;
  isEnding: boolean;
  startError: string | null;
  /**
   * Declara consumo y cierra la sesión. Si amount es 0, también cierra
   * sin descuento.
   */
  declareAndEnd: (
    declaredConsumption: number,
  ) => Promise<{ ok: true; credits: CreditsState } | { ok: false; error: string }>;
  refreshCredits: () => Promise<void>;
};

type StartResponse = { sessionId: string } | { error: string; message?: string };
type EndResponse = CreditsState | { error: string; message?: string };

export function useThreeDSkySession(
  initialCredits: CreditsState,
): UseThreeDSkySession {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditsState>(initialCredits);
  const [isStarting, setIsStarting] = useState(true);
  const [isEnding, setIsEnding] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Ref para que el cleanup vea el sessionId actual sin re-mount.
  const sessionIdRef = useRef<string | null>(null);
  const declaredRef = useRef(false);

  // Start on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tools/3dsky/session/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        const data = (await res.json()) as StartResponse;
        if (cancelled) return;
        if (!res.ok || "error" in data) {
          setStartError(
            "message" in data && data.message ? data.message : "no_session_started",
          );
          return;
        }
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
      } catch (err) {
        if (!cancelled) {
          setStartError(err instanceof Error ? err.message : "network_error");
        }
      } finally {
        if (!cancelled) setIsStarting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup: si el componente se desmonta sin que el user haya declarado,
  // mandamos un beacon a /session/end con declared=0. El navegador
  // garantiza la entrega del beacon incluso si la página se está
  // cerrando.
  useEffect(() => {
    return () => {
      if (declaredRef.current) return;
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        const payload = JSON.stringify({
          sessionId: sid,
          declaredConsumption: 0,
        });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/tools/3dsky/session/end", blob);
      } catch {
        // Si sendBeacon no existe (entornos viejos), no hay mucho que hacer.
      }
    };
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/tools/3dsky/credits", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as CreditsState;
      setCredits(data);
    } catch {
      // silent
    }
  }, []);

  const declareAndEnd = useCallback(
    async (
      declaredConsumption: number,
    ): Promise<
      { ok: true; credits: CreditsState } | { ok: false; error: string }
    > => {
      const sid = sessionIdRef.current;
      if (!sid) return { ok: false, error: "no_session" };
      if (declaredRef.current) {
        return { ok: false, error: "already_declared" };
      }
      setIsEnding(true);
      try {
        const res = await fetch("/api/tools/3dsky/session/end", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            declaredConsumption,
          }),
        });
        const data = (await res.json()) as EndResponse;
        if (!res.ok || "error" in data) {
          const msg = "message" in data && data.message ? data.message : "end_failed";
          return { ok: false, error: msg };
        }
        declaredRef.current = true;
        setCredits(data);
        return { ok: true, credits: data };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "network_error",
        };
      } finally {
        setIsEnding(false);
      }
    },
    [],
  );

  return {
    sessionId,
    credits,
    isStarting,
    isEnding,
    startError,
    declareAndEnd,
    refreshCredits,
  };
}
