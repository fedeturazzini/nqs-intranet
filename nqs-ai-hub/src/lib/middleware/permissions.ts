/**
 * Middleware de permisos centralizado.
 *
 * UN solo lugar donde se valida si un user puede usar una tool. Cada
 * regla nueva (horarios, aprobaciones, etc.) se suma como un check
 * secuencial. Los endpoints solo llaman a `requireToolAccess` y dejan
 * que esta capa decida.
 *
 * Adaptado de kit/reference/middleware-permissions.ts.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import type { ToolId } from "@/lib/adapters/types";

export type PermissionReason =
  | "not_authenticated"
  | "no_access"
  | "expired"
  | "no_credits"
  | "outside_hours" // [FUTURE]
  | "pending_approval";

export type PermissionResult =
  | { allowed: true }
  | { allowed: false; reason: PermissionReason; message?: string };

/**
 * Verifica si `userId` puede usar `toolId` ahora mismo.
 * No tira excepciones — devuelve `PermissionResult`.
 */
export async function canUseTool(
  userId: string,
  toolId: ToolId,
): Promise<PermissionResult> {
  const db = createServerClient();

  // ─── CHECK 1: usuario existe y está activo ───
  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, is_active, role")
    .eq("id", userId)
    .maybeSingle();

  if (userErr || !user || !user.is_active) {
    return { allowed: false, reason: "not_authenticated" };
  }

  // Admin pasa por arriba de todos los checks de la tool.
  if (user.role === "admin") {
    return { allowed: true };
  }

  // ─── CHECK 2: acceso a la tool ───
  const { data: access, error: accessErr } = await db
    .from("tool_access")
    .select("*")
    .eq("user_id", userId)
    .eq("tool_id", toolId)
    .maybeSingle();

  if (accessErr || !access || access.status === "locked") {
    return { allowed: false, reason: "no_access" };
  }

  if (access.status === "pending") {
    return { allowed: false, reason: "pending_approval" };
  }

  if (access.status === "expired") {
    return {
      allowed: false,
      reason: "expired",
      message: access.expires_at
        ? `Tu acceso expiró el ${access.expires_at}`
        : "Tu acceso está expirado",
    };
  }

  // Si `expires_at` está seteado y ya pasó, también es expired aunque el
  // status no se haya actualizado todavía.
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { allowed: false, reason: "expired" };
  }

  // ─── CHECK 3: [FUTURE] ventana horaria — módulo horarios ───
  // TODO: cuando exista el módulo de horarios, llamar a
  //   checkTimeWindow(userId, toolId) y devolver `outside_hours` si
  //   no estamos dentro de la ventana habilitada. Usa la tabla
  //   `time_windows` (ya creada vacía en la migration 0001).

  // ─── CHECK 4: créditos disponibles (si la tool los usa) ───
  const { data: tool, error: toolErr } = await db
    .from("tools")
    .select("uses_credits")
    .eq("id", toolId)
    .maybeSingle();

  if (toolErr || !tool) {
    // La tool no existe en el catálogo. Tratar como no-access.
    return { allowed: false, reason: "no_access" };
  }

  if (tool.uses_credits) {
    const { data: alloc, error: allocErr } = await db
      .from("credit_allocations")
      .select("credits_assigned, credits_used")
      .eq("user_id", userId)
      .eq("tool_id", toolId)
      .maybeSingle();

    if (allocErr || !alloc) {
      return {
        allowed: false,
        reason: "no_credits",
        message: "No tenés créditos asignados",
      };
    }

    if (alloc.credits_assigned - alloc.credits_used <= 0) {
      return {
        allowed: false,
        reason: "no_credits",
        message: "Te quedaste sin créditos",
      };
    }
  }

  return { allowed: true };
}

/**
 * Helper para usar en API routes. Si NO tiene permiso, devuelve un
 * `NextResponse` listo para `return`. Si tiene permiso, devuelve `null`.
 *
 *   const denied = await requireToolAccess(userId, "claude");
 *   if (denied) return denied;
 */
export async function requireToolAccess(
  userId: string,
  toolId: ToolId,
): Promise<NextResponse | null> {
  const result = await canUseTool(userId, toolId);
  if (result.allowed) return null;

  const status = result.reason === "not_authenticated" ? 401 : 403;
  return NextResponse.json(
    { error: result.reason, message: result.message ?? null },
    { status },
  );
}
