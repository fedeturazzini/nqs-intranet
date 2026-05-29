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
import type {
  AccessStatus,
  ToolId,
  ToolSchedule,
} from "@/types/db-aliases";

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

  // 3 queries en paralelo — son independientes.
  const [toolsRes, accessRes, allocRes] = await Promise.all([
    db.from("tools").select("*"),
    db.from("tool_access").select("*").eq("user_id", userId),
    db.from("credit_allocations").select("*").eq("user_id", userId),
  ]);

  if (toolsRes.error) throw toolsRes.error;
  if (accessRes.error) throw accessRes.error;
  if (allocRes.error) throw allocRes.error;

  const tools = toolsRes.data ?? [];
  const accessByToolId = new Map(
    (accessRes.data ?? []).map((a) => [a.tool_id, a]),
  );
  const allocByToolId = new Map(
    (allocRes.data ?? []).map((a) => [a.tool_id, a]),
  );

  // Orden estable: primero las que el cliente trabaja activamente, después
  // las "coming soon". Dentro de cada bucket, alfabético por nombre.
  const bucket = tools.map((tool): ToolWithAccess => {
    const access = accessByToolId.get(tool.id);
    const alloc = allocByToolId.get(tool.id);

    let status: AccessStatus | "coming_soon";
    if (!tool.is_active) {
      status = "coming_soon";
    } else if (!access) {
      status = "locked";
    } else {
      status = access.status;
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
