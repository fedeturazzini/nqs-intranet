// ============================================================
// ToolAdapter Pattern — Patrón crítico de extensibilidad
// ============================================================
// Cada herramienta del stack implementa esta interfaz.
// Agregar una tool nueva = crear un archivo nuevo en lib/adapters/.
// El resto del sistema no cambia.
// ============================================================

import { createClient } from '@supabase/supabase-js'

// ============================================================
// Tipos compartidos
// ============================================================

export type ToolId =
  | 'claude'
  | 'weavy'
  | 'kling'
  | 'runway'
  | 'elevenlabs'
  | 'highsfield'
  | '3dsky'

export type AccessState =
  | { status: 'active'; expiresAt?: Date; credits?: number; creditsTotal?: number }
  | { status: 'pending'; requestedAt: Date }
  | { status: 'locked' }
  | { status: 'expired'; expiredAt: Date }

export type ToolCategory = 'text' | 'visual' | 'video' | 'audio' | 'assets'

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

// ============================================================
// Interface ToolAdapter
// ============================================================

export interface ToolAdapter {
  /** ID único de la herramienta */
  readonly id: ToolId

  /** Categoría para agrupar */
  readonly category: ToolCategory

  /** Si usa sistema de créditos (3DSky sí, Claude no) */
  readonly usesCredits: boolean

  /** Si se renderiza vía iframe embebido (3DSky sí, Claude no) */
  readonly isEmbedded: boolean

  // ------------------------------------------------------------
  // Métodos obligatorios para todas las tools
  // ------------------------------------------------------------

  /** Verifica si el usuario puede usar esta tool */
  checkAccess(userId: string): Promise<AccessState>

  /** Loguea una acción del usuario sobre esta tool */
  logUsage(
    userId: string,
    action: string,
    metadata?: Record<string, unknown>
  ): Promise<void>

  // ------------------------------------------------------------
  // Métodos opcionales (solo si aplican a la tool)
  // ------------------------------------------------------------

  /** Para tools con API directa (Claude). Ejecuta la operación principal. */
  execute?(userId: string, params: ExecuteParams): Promise<Result<ExecuteResult>>

  /** Para tools con créditos. Devuelve cuántos créditos tiene el usuario. */
  getRemainingCredits?(userId: string): Promise<number>

  /** Para tools con créditos. Consume N créditos. */
  consumeCredit?(
    userId: string,
    amount: number,
    reason: string
  ): Promise<Result<{ remaining: number }>>

  /** Para tools embebidas. Devuelve la URL del proxy. */
  getEmbedUrl?(userId: string): Promise<string>
}

// ============================================================
// Tipos de parámetros
// ============================================================

export type ExecuteParams = {
  prompt: string
  images?: Array<{
    type: 'base64'
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }>
  conversationId?: string
}

export type ExecuteResult = {
  text: string
  tokensInput: number
  tokensOutput: number
  conversationId: string
  messageId: string
}

// ============================================================
// Registry de adapters
// ============================================================
// Acá se registran todos los adapters del sistema.
// Agregar una tool nueva = importar el adapter y agregarlo al registry.
// ============================================================

import { claudeAdapter } from './claude'
import { threeDSkyAdapter } from './three-dsky'
// FUTURE: import { weavyAdapter } from './weavy'
// FUTURE: import { klingAdapter } from './kling'

export const adapters: Record<ToolId, ToolAdapter> = {
  claude: claudeAdapter,
  '3dsky': threeDSkyAdapter,
  // Placeholders para tools "próximamente"
  weavy: createPlaceholderAdapter('weavy', 'visual'),
  kling: createPlaceholderAdapter('kling', 'video'),
  runway: createPlaceholderAdapter('runway', 'video'),
  elevenlabs: createPlaceholderAdapter('elevenlabs', 'audio'),
  highsfield: createPlaceholderAdapter('highsfield', 'video'),
}

export function getAdapter(toolId: ToolId): ToolAdapter {
  const adapter = adapters[toolId]
  if (!adapter) {
    throw new Error(`No adapter registered for tool: ${toolId}`)
  }
  return adapter
}

// ============================================================
// Placeholder adapter (para tools "próximamente")
// ============================================================

function createPlaceholderAdapter(id: ToolId, category: ToolCategory): ToolAdapter {
  return {
    id,
    category,
    usesCredits: false,
    isEmbedded: false,

    async checkAccess(): Promise<AccessState> {
      return { status: 'locked' }
    },

    async logUsage(): Promise<void> {
      // no-op para placeholders
    },
  }
}

// ============================================================
// Helper para loggear uso (usado por todos los adapters)
// ============================================================

export async function logToolUsage(params: {
  userId: string
  toolId: ToolId
  action: string
  metadata?: Record<string, unknown>
  tokensConsumed?: number
  creditsConsumed?: number
}): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('usage_logs').insert({
    user_id: params.userId,
    tool_id: params.toolId,
    action: params.action,
    metadata: params.metadata ?? {},
    tokens_consumed: params.tokensConsumed,
    credits_consumed: params.creditsConsumed,
  })
}

// ============================================================
// EJEMPLO: ClaudeAdapter
// ============================================================
// Este código se construye en la Sesión 06.
// Acá va como ejemplo de implementación de la interfaz.
// ============================================================

/*
// lib/adapters/claude.ts

import Anthropic from '@anthropic-ai/sdk'
import { decryptSystemPrompt } from '@/lib/crypto'
import { ToolAdapter, AccessState, ExecuteParams, ExecuteResult, Result, logToolUsage } from './index'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const claudeAdapter: ToolAdapter = {
  id: 'claude',
  category: 'text',
  usesCredits: false,
  isEmbedded: false,

  async checkAccess(userId: string): Promise<AccessState> {
    // Buscar en tool_access si el user tiene acceso a Claude
    const access = await getToolAccess(userId, 'claude')
    if (!access) return { status: 'locked' }
    return { status: access.status }
  },

  async logUsage(userId, action, metadata) {
    await logToolUsage({ userId, toolId: 'claude', action, metadata })
  },

  async execute(userId, params): Promise<Result<ExecuteResult>> {
    try {
      // 1. Traer el system prompt activo
      const systemPrompt = await decryptSystemPrompt('claude')

      // 2. Armar mensajes con texto + imágenes
      const content: any[] = [{ type: 'text', text: params.prompt }]
      if (params.images) {
        for (const img of params.images) {
          content.push({ type: 'image', source: img })
        }
      }

      // 3. Llamar a Anthropic
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      })

      // 4. Loguear consumo
      await logToolUsage({
        userId,
        toolId: 'claude',
        action: 'execute',
        tokensConsumed: response.usage.input_tokens + response.usage.output_tokens,
      })

      // 5. Guardar en claude_conversations / claude_messages
      const { conversationId, messageId } = await saveMessage(userId, params, response)

      return {
        ok: true,
        value: {
          text: response.content[0].type === 'text' ? response.content[0].text : '',
          tokensInput: response.usage.input_tokens,
          tokensOutput: response.usage.output_tokens,
          conversationId,
          messageId,
        },
      }
    } catch (error) {
      return { ok: false, error: error as Error }
    }
  },
}
*/

// ============================================================
// EJEMPLO: ThreeDSkyAdapter
// ============================================================
/*
// lib/adapters/three-dsky.ts

import { ToolAdapter, AccessState, Result, logToolUsage } from './index'

export const threeDSkyAdapter: ToolAdapter = {
  id: '3dsky',
  category: 'assets',
  usesCredits: true,
  isEmbedded: true,

  async checkAccess(userId: string): Promise<AccessState> {
    const access = await getToolAccess(userId, '3dsky')
    if (!access || access.status === 'locked') return { status: 'locked' }
    const credits = await this.getRemainingCredits!(userId)
    const allocation = await getCreditAllocation(userId, '3dsky')
    return {
      status: 'active',
      credits,
      creditsTotal: allocation.credits_assigned,
    }
  },

  async logUsage(userId, action, metadata) {
    await logToolUsage({ userId, toolId: '3dsky', action, metadata })
  },

  async getRemainingCredits(userId: string): Promise<number> {
    const allocation = await getCreditAllocation(userId, '3dsky')
    return allocation.credits_assigned - allocation.credits_used
  },

  async consumeCredit(userId, amount, reason): Promise<Result<{ remaining: number }>> {
    // Transacción atómica: descuenta créditos + registra transaction + loguea
    const result = await db.transaction(async (tx) => {
      const allocation = await tx.from('credit_allocations')
        .select('*')
        .eq('user_id', userId)
        .eq('tool_id', '3dsky')
        .single()

      if (allocation.credits_assigned - allocation.credits_used < amount) {
        throw new Error('Insufficient credits')
      }

      await tx.from('credit_allocations')
        .update({ credits_used: allocation.credits_used + amount })
        .eq('id', allocation.id)

      await tx.from('credit_transactions').insert({
        user_id: userId,
        tool_id: '3dsky',
        type: 'consumption',
        amount: -amount,
        reason,
      })

      return { remaining: allocation.credits_assigned - allocation.credits_used - amount }
    })

    await logToolUsage({
      userId,
      toolId: '3dsky',
      action: 'consume_credit',
      metadata: { reason },
      creditsConsumed: amount,
    })

    return { ok: true, value: result }
  },

  async getEmbedUrl(userId: string): Promise<string> {
    // En producción esto apunta al proxy de NQS
    return `https://3dsky.nqs.com.ar/?user=${userId}`
  },
}
*/
