// ============================================================
// Middleware de permisos centralizado
// ============================================================
// UN solo lugar donde se valida si un usuario puede usar una tool.
// Cada nueva regla se agrega como un check secuencial.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import type { ToolId } from '@/lib/adapters'

export type PermissionResult =
  | { allowed: true }
  | {
      allowed: false
      reason:
        | 'not_authenticated'
        | 'no_access'
        | 'expired'
        | 'no_credits'
        | 'outside_hours'
        | 'pending_approval'
      message?: string
    }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Valida si un usuario puede usar una herramienta específica.
 * Llamar desde TODOS los endpoints antes de ejecutar la acción.
 */
export async function canUseTool(
  userId: string,
  toolId: ToolId
): Promise<PermissionResult> {
  // ============================================================
  // CHECK 1: Usuario autenticado y activo
  // ============================================================
  const { data: user } = await supabase
    .from('users')
    .select('id, is_active, role')
    .eq('id', userId)
    .single()

  if (!user || !user.is_active) {
    return { allowed: false, reason: 'not_authenticated' }
  }

  // Admin tiene acceso a todo (early return)
  if (user.role === 'admin') {
    return { allowed: true }
  }

  // ============================================================
  // CHECK 2: Acceso a la herramienta
  // ============================================================
  const { data: access } = await supabase
    .from('tool_access')
    .select('*')
    .eq('user_id', userId)
    .eq('tool_id', toolId)
    .single()

  if (!access || access.status === 'locked') {
    return { allowed: false, reason: 'no_access' }
  }

  if (access.status === 'pending') {
    return { allowed: false, reason: 'pending_approval' }
  }

  if (access.status === 'expired') {
    return {
      allowed: false,
      reason: 'expired',
      message: `Tu acceso expiró el ${access.expires_at}`,
    }
  }

  // Validación de expiración por fecha (si la tiene seteada)
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { allowed: false, reason: 'expired' }
  }

  // ============================================================
  // CHECK 3: [FUTURE] Ventana horaria — módulo horarios
  // ============================================================
  // const inWindow = await checkTimeWindow(userId, toolId)
  // if (!inWindow.allowed) {
  //   return { allowed: false, reason: 'outside_hours', message: inWindow.message }
  // }

  // ============================================================
  // CHECK 4: Créditos disponibles (si la tool los usa)
  // ============================================================
  const { data: tool } = await supabase
    .from('tools')
    .select('uses_credits')
    .eq('id', toolId)
    .single()

  if (tool?.uses_credits) {
    const { data: allocation } = await supabase
      .from('credit_allocations')
      .select('credits_assigned, credits_used')
      .eq('user_id', userId)
      .eq('tool_id', toolId)
      .single()

    if (!allocation) {
      return { allowed: false, reason: 'no_credits', message: 'No tenés créditos asignados' }
    }

    const available = allocation.credits_assigned - allocation.credits_used
    if (available <= 0) {
      return { allowed: false, reason: 'no_credits', message: 'Te quedaste sin créditos' }
    }
  }

  return { allowed: true }
}

/**
 * Helper para usar en API routes.
 * Devuelve early con un Response si no tiene permisos.
 */
export async function requireToolAccess(userId: string, toolId: ToolId) {
  const result = await canUseTool(userId, toolId)
  if (!result.allowed) {
    return Response.json(
      {
        error: result.reason,
        message: result.message,
      },
      { status: result.reason === 'not_authenticated' ? 401 : 403 }
    )
  }
  return null // permiso OK
}

// ============================================================
// [FUTURE] checkTimeWindow — módulo horarios
// ============================================================
/*
async function checkTimeWindow(
  userId: string,
  toolId: ToolId
): Promise<{ allowed: boolean; message?: string }> {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=domingo
  const hour = now.getHours()

  // Buscar ventanas aplicables
  // Prioridad: user-specific > global; tool-specific > all-tools
  const { data: windows } = await supabase
    .from('time_windows')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .or(`tool_id.eq.${toolId},tool_id.is.null`)
    .eq('is_active', true)

  if (!windows || windows.length === 0) {
    return { allowed: true } // sin ventanas configuradas = libre
  }

  // Si hay ventanas, alguna tiene que aplicar
  const inWindow = windows.some(w => {
    if (w.day_of_week != null && w.day_of_week !== dayOfWeek) return false
    if (hour < w.start_hour || hour >= w.end_hour) return false
    return true
  })

  if (!inWindow) {
    return {
      allowed: false,
      message: 'Fuera del horario habilitado para esta herramienta',
    }
  }

  return { allowed: true }
}
*/

// ============================================================
// USO en API routes
// ============================================================
/*
// app/api/tools/claude/execute/route.ts

import { requireToolAccess } from '@/lib/middleware/permissions'
import { getSession } from '@/lib/auth'
import { getAdapter } from '@/lib/adapters'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Validar permisos
  const permissionError = await requireToolAccess(session.userId, 'claude')
  if (permissionError) return permissionError

  // Ejecutar acción
  const body = await req.json()
  const adapter = getAdapter('claude')
  const result = await adapter.execute!(session.userId, body)

  if (!result.ok) {
    return Response.json({ error: result.error.message }, { status: 500 })
  }

  return Response.json(result.value)
}
*/
