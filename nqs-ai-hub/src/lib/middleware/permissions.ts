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
import { checkSchedule } from "@/lib/utils/schedule";
import type { ToolId } from "@/lib/adapters/types";
import type { ToolSchedule, UserRole } from "@/types/db-aliases";
import { logWarn } from "@/lib/log";

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

export type PermissionUserHint = {
  role: UserRole;
  isActive: boolean;
};

/**
 * Verifica si `userId` puede usar `toolId` ahora mismo.
 * No tira excepciones — devuelve `PermissionResult`.
 *
 * Si el caller ya resolvió el perfil con `getSession`, puede pasarlo como hint
 * para no repetir el SELECT de `users`. El hint es interno/server-side: nunca
 * viene del body del cliente.
 */
export async function canUseTool(
  userId: string,
  toolId: ToolId,
  options: { user?: PermissionUserHint } = {},
): Promise<PermissionResult> {
  const db = createServerClient();

  // ─── CHECK 1: usuario existe y está activo ───
  let user: { id: string; is_active: boolean | null; role: UserRole } | null;
  let userErr: unknown = null;
  if (options.user) {
    user = {
      id: userId,
      is_active: options.user.isActive,
      role: options.user.role,
    };
  } else {
    const result = await db
      .from("users")
      .select("id, is_active, role")
      .eq("id", userId)
      .maybeSingle();
    user = result.data;
    userErr = result.error;
  }

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

  // ─── CHECK 3: ventana horaria (tool_access.schedule) ───
  // Si el admin configuró `schedule` para este (user, tool), validamos
  // que estemos dentro de la ventana del día actual. El check vive en
  // `lib/utils/schedule.ts` y trabaja en TZ America/Argentina/Buenos_Aires.
  if (access.schedule) {
    const schedCheck = checkSchedule(access.schedule as ToolSchedule);
    if (!schedCheck.allowed) {
      return {
        allowed: false,
        reason: "outside_hours",
        message: schedCheck.humanMessage,
      };
    }
  }

  // ─── CHECK 4: créditos ───
  // DESACTIVADO (mini-fix "créditos no bloquean"): tener 0 créditos NO impide
  // entrar. Los créditos son manuales (los asigna el admin); 0 créditos
  // significa "el admin todavía no te asignó cupo", no "no podés usar la tool".
  // El user entra igual, ve su saldo y pide más con "pedir créditos". La
  // existencia de la tool ya la cubre el CHECK 2 (tool_access tiene FK a tools).
  //
  // TODO: re-habilitar cuando la deducción de créditos sea automática (post-MVP):
  //   if (tool.uses_credits) {
  //     const remaining = alloc ? alloc.credits_assigned - alloc.credits_used : 0;
  //     if (remaining <= 0) return { allowed: false, reason: "no_credits", … };
  //   }
  // (El tipo PermissionReason mantiene "no_credits" para ese futuro.)

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
  options: { user?: PermissionUserHint } = {},
): Promise<NextResponse | null> {
  const result = await canUseTool(userId, toolId, options);
  if (result.allowed) return null;

  const status = result.reason === "not_authenticated" ? 401 : 403;
  logWarn("acceso a tool denegado", {
    route: `tools/${toolId}`,
    userId,
    status,
    reason: result.reason,
  });
  return NextResponse.json(
    { error: result.reason, message: result.message ?? null },
    { status },
  );
}
