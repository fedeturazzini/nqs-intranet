/**
 * Pill de estado para una tool. Server Component — markup puro.
 * Adaptado de design/components.jsx líneas 21-35.
 *
 * Soporta 5 estados (los 4 del enum `access_status` + `coming_soon`):
 *   - active        → verde (con créditos o con expiración)
 *   - pending       → amarillo, dot pulse
 *   - locked        → gris, "sin acceso"
 *   - expired       → rojo
 *   - coming_soon   → gris, "próximamente"
 */
import type { AccessStatus } from "@/types/db-aliases";

export type StatusPillProps = Readonly<{
  status: AccessStatus | "coming_soon";
  /** Cuánto le queda activa la tool (minutos). Solo para `active` sin créditos. */
  expiresInMin?: number;
  /** Cuándo se pidió. Solo para `pending`. */
  requestedAt?: string;
  /** Cuándo expiró. Solo para `expired`. */
  expiredAt?: string;
  /** Créditos disponibles. Solo `active` con créditos (3DSky). */
  credits?: number;
  creditsTotal?: number;
}>;

export function StatusPill({
  status,
  expiresInMin,
  requestedAt,
  expiredAt,
  credits,
  creditsTotal,
}: StatusPillProps) {
  if (status === "active") {
    if (credits != null && creditsTotal != null) {
      return (
        <span className="tag ok">
          <span className="dot" /> {credits} / {creditsTotal} créditos
        </span>
      );
    }
    if (expiresInMin != null) {
      const h = Math.floor(expiresInMin / 60);
      const m = expiresInMin % 60;
      const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return (
        <span className="tag ok">
          <span className="dot" /> activa · {label}
        </span>
      );
    }
    // active sin créditos ni expiración (caso Claude en MVP).
    return (
      <span className="tag ok">
        <span className="dot" /> activa
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="tag warn">
        <span className="dot pulse" /> pendiente
        {requestedAt ? ` · ${requestedAt}` : ""}
      </span>
    );
  }

  if (status === "expired") {
    return (
      <span className="tag danger">
        <span className="dot" /> expirada
        {expiredAt ? ` · ${expiredAt}` : ""}
      </span>
    );
  }

  if (status === "coming_soon") {
    return (
      <span className="tag">
        <span className="dot" /> próximamente
      </span>
    );
  }

  // locked
  return (
    <span className="tag">
      <span className="dot" /> sin acceso
    </span>
  );
}
