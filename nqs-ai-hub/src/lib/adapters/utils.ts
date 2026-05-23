/**
 * Helpers compartidos por los adapters.
 */
import { createServerClient } from "@/lib/db/supabase";
import type { Json } from "@/types/db";
import type { ToolId } from "@/types/db-aliases";

export type LogToolUsageParams = {
  userId: string;
  toolId: ToolId;
  action: string;
  metadata?: Record<string, unknown>;
  tokensConsumed?: number;
  creditsConsumed?: number;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Escribe en `usage_logs`. NO tira excepción si falla — el caller
 * decide qué hacer (queremos que un fallo de log NO tumbe una request
 * que ya cobró tokens a la API). El error queda en console.error con
 * suficiente metadata para auditar después.
 *
 * Si querés que falle la operación cuando el log falla, chequeá el
 * boolean que devuelve esta función y actuá en consecuencia.
 */
export async function logToolUsage(
  params: LogToolUsageParams,
): Promise<boolean> {
  const db = createServerClient();

  const { error } = await db.from("usage_logs").insert({
    user_id: params.userId,
    tool_id: params.toolId,
    action: params.action,
    // `metadata` viaja como JSONB. El autogen lo tipa como `Json` (más
    // estricto que `Record<string, unknown>`) — castamos porque acá
    // confiamos en el caller (solo lo llama nuestro propio código).
    metadata: (params.metadata ?? {}) as unknown as Json,
    tokens_consumed: params.tokensConsumed ?? null,
    credits_consumed: params.creditsConsumed ?? null,
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ?? null,
  });

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "logToolUsage failed",
        userId: params.userId,
        toolId: params.toolId,
        action: params.action,
        dbError: error.message,
      }),
    );
    return false;
  }
  return true;
}
