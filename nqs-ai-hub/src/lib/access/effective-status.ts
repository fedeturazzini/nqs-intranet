/**
 * Estado efectivo de un acceso temporal.
 *
 * En DB un acceso rápido/excepcional puede quedar `status = "active"` con
 * `expires_at` vencido: ningún job lo flipea. El hub y canUseTool ya tratan
 * ese caso como `expired`; este helper centraliza la regla para el admin y
 * las solicitudes de renovación.
 */

export type AccessExpiryKind = "permanent" | "temporary" | "expired" | "none";

export type AccessExpiryMeta = {
  kind: AccessExpiryKind;
  /** Etiqueta corta para UI admin (sin mayúsculas forzadas). */
  label: string;
  /** Fecha formateada AR, si aplica. */
  expiresAtLabel: string | null;
  /** True si el acceso efectivo todavía permite usar la tool. */
  isEffectivelyActive: boolean;
};

const DATE_TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatAccessDateTime(expiresAt: string): string | null {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_TIME_FMT.format(date);
}

export function getAccessExpiryMeta(
  status: "active" | "pending" | "locked" | "expired" | null | undefined,
  expiresAt: string | null | undefined,
  now = new Date(),
): AccessExpiryMeta {
  if (!status || status === "locked") {
    return {
      kind: "none",
      label: "sin acceso",
      expiresAtLabel: null,
      isEffectivelyActive: false,
    };
  }

  if (status === "pending") {
    return {
      kind: "none",
      label: "solicitud pendiente",
      expiresAtLabel: null,
      isEffectivelyActive: false,
    };
  }

  if (!expiresAt) {
    if (status === "expired") {
      return {
        kind: "expired",
        label: "acceso vencido",
        expiresAtLabel: null,
        isEffectivelyActive: false,
      };
    }
    return {
      kind: "permanent",
      label: "acceso permanente",
      expiresAtLabel: null,
      isEffectivelyActive: status === "active",
    };
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return {
      kind: status === "expired" ? "expired" : "permanent",
      label: status === "expired" ? "acceso vencido" : "acceso permanente",
      expiresAtLabel: null,
      isEffectivelyActive: status === "active",
    };
  }

  const expiresAtLabel = formatAccessDateTime(expiresAt);
  if (date.getTime() < now.getTime() || status === "expired") {
    return {
      kind: "expired",
      label: "acceso vencido",
      expiresAtLabel,
      isEffectivelyActive: false,
    };
  }

  return {
    kind: "temporary",
    label: "acceso temporal",
    expiresAtLabel,
    isEffectivelyActive: true,
  };
}

/** True si el acceso todavía permite usar la tool ahora. */
export function isEffectivelyActiveAccess(
  status: "active" | "pending" | "locked" | "expired" | null | undefined,
  expiresAt: string | null | undefined,
  now = new Date(),
): boolean {
  return getAccessExpiryMeta(status, expiresAt, now).isEffectivelyActive;
}
