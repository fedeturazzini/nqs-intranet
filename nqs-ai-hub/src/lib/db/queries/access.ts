/**
 * Catálogo de tools + estado de acceso del usuario.
 *
 * Devuelve la unión de TODAS las tools del catálogo con su estado para
 * el user dado. Si el user no tiene una row en `tool_access`, el estado
 * efectivo se infiere:
 *   - `coming_soon` si `tools.is_active = false` (la tool todavía no
 *     está habilitada en la plataforma — no es que esté bloqueada para
 *     este user, es que no existe operativa).
 *   - `locked` si la tool está activa pero el user no tiene acceso.
 *
 * Para tools `uses_credits`, además incluye `credits` / `creditsTotal`
 * desde `credit_allocations`.
 */
import { createServerClient } from "@/lib/db/supabase";
import type { AccessStatus, ToolId, ToolSchedule } from "@/types/db-aliases";

export type ToolWithAccess = {
  id: ToolId;
  name: string;
  vendor: string;
  category: string;
  description: string;
  color: string;
  glyph: string;
  /** Si la tool está habilitada operativamente en la plataforma. */
  isActive: boolean;
  /** Si la tool usa sistema de créditos (3DSky por ahora). */
  usesCredits: boolean;
  access: {
    status: AccessStatus | "coming_soon";
    credits?: number;
    creditsTotal?: number;
    expiresInMin?: number;
    requestedAt?: string;
    expiredAt?: string;
    /** Schedule del user para esta tool. null = sin restricción. */
    schedule?: ToolSchedule | null;
  };
};

export async function listToolsWithAccess(
  userId: string,
): Promise<ToolWithAccess[]> {
  const db = createServerClient();

  // 4 queries en paralelo — son independientes.
  const [toolsRes, accessRes, allocRes, pendingRes] = await Promise.all([
    // `tutoriales` se gestiona vía tool_access pero NO es una card del hub
    // (es una sección del navbar). Lo excluimos del catálogo del hub.
    db.from("tools").select("*").neq("id", "tutoriales"),
    db.from("tool_access").select("*").eq("user_id", userId),
    db.from("credit_allocations").select("*").eq("user_id", userId),
    db
      .from("access_requests")
      .select("tool_id, created_at")
      .eq("user_id", userId)
      .eq("request_type", "access")
      .eq("status", "pending"),
  ]);

  if (toolsRes.error) throw toolsRes.error;
  if (accessRes.error) throw accessRes.error;
  if (allocRes.error) throw allocRes.error;
  if (pendingRes.error) throw pendingRes.error;

  const tools = toolsRes.data ?? [];
  const accessByToolId = new Map(
    (accessRes.data ?? []).map((a) => [a.tool_id, a]),
  );
  const allocByToolId = new Map(
    (allocRes.data ?? []).map((a) => [a.tool_id, a]),
  );
  const pendingByToolId = new Map(
    (pendingRes.data ?? []).map((r) => [r.tool_id, r.created_at]),
  );

  // Orden estable: primero las que el cliente trabaja activamente, después
  // las "coming soon". Dentro de cada bucket, alfabético por nombre.
  const bucket = tools.map((tool): ToolWithAccess => {
    const access = accessByToolId.get(tool.id);
    const alloc = allocByToolId.get(tool.id);

    // `expires_at` vencido con `status` todavía "active": un acceso temporal
    // (quick access / excepcional) venció, pero NINGÚN job flipea la columna
    // `status` a "expired" — se queda congelada en "active". `canUseTool` (server)
    // ya trata este caso como expired en runtime (middleware/permissions.ts).
    // Si el hub siguiera mostrándolo "active", la card sería clickeable → el user
    // entra a /tool/<id>, el server lo rebota a /hub, y como la card sigue
    // "active" reintenta → loop hub↔tool. Espejamos el criterio del server acá
    // para que la card muestre el estado real. Ver rebote-claude-audit.md.
    const accessExpired =
      !!access?.expires_at && new Date(access.expires_at) < new Date();

    let status: AccessStatus | "coming_soon";
    if (!tool.is_active) {
      status = "coming_soon";
    } else if (!access) {
      status = "locked";
    } else if (access.status === "active" && accessExpired) {
      status = "expired";
    } else {
      status = access.status;
    }

    // Si el user ya pidió renovación/acceso y sigue pendiente, la card
    // debe mostrar "esperando confirmación" en vez de seguir invitando
    // a pedir otra vez. Un acceso efectivo aún activo conserva prioridad.
    const pendingAt = pendingByToolId.get(tool.id) ?? null;
    if (pendingAt && (status === "locked" || status === "expired")) {
      status = "pending";
    }

    const creditsInfo =
      tool.uses_credits && alloc
        ? {
            credits: alloc.credits_assigned - alloc.credits_used,
            creditsTotal: alloc.credits_assigned,
          }
        : {};

    return {
      id: tool.id as ToolId,
      name: tool.name,
      vendor: tool.vendor,
      category: tool.category,
      description: tool.description ?? "",
      color: tool.color ?? "#888",
      glyph: tool.glyph ?? "◇",
      isActive: tool.is_active ?? false,
      usesCredits: tool.uses_credits ?? false,
      access: {
        status,
        ...creditsInfo,
        // Fecha de vencimiento para el pill "expired" (tanto si el status ya
        // venía "expired" en DB como si lo derivamos por `expires_at` vencido).
        ...(status === "expired" && access?.expires_at
          ? { expiredAt: formatExpiredAt(access.expires_at) }
          : {}),
        ...(status === "pending" && pendingAt
          ? { requestedAt: pendingAt }
          : {}),
        schedule: (access?.schedule ?? null) as ToolSchedule | null,
      },
    };
  });

  bucket.sort((a, b) => {
    // active > pending > locked > coming_soon
    const order = (s: ToolWithAccess["access"]["status"]) =>
      s === "active"
        ? 0
        : s === "pending"
          ? 1
          : s === "locked" || s === "expired"
            ? 2
            : 3;
    const diff = order(a.access.status) - order(b.access.status);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  return bucket;
}

/** Fecha de vencimiento en formato corto (TZ del estudio) para el pill "expired". */
function formatExpiredAt(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
