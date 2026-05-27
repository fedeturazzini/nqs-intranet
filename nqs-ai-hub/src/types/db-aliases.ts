/**
 * Aliases semánticos sobre los types de `./db.ts` (que es output puro de
 * `npx supabase gen types`).
 *
 * Existe para que regenerar `db.ts` sea 1 comando sin tener que re-pegar
 * nada:
 *
 *   npx supabase gen types typescript \
 *     --project-id nslliqinzpqjiysjlulm > src/types/db.ts
 *
 * Si el schema cambia (sumamos tabla, modificamos enum, etc.) — después
 * de regenerar `db.ts`, repasar este archivo y agregar/ajustar los
 * aliases que correspondan.
 *
 * Convención: solo se importa desde acá. `db.ts` queda como artefacto
 * autogenerado intocado.
 */
import type { Tables, Enums, Database } from "./db";

// Re-export del Database para que el resto del código importe todo
// desde un solo punto si quiere (opcional — también es válido importarlo
// directo desde `@/types/db`).
export type { Database };

// ============================================================
// ENUMS
// ============================================================

export type UserRole = Enums<"user_role">;
export type ToolCategory = Enums<"tool_category">;
export type AccessStatus = Enums<"access_status">;
export type MessageRole = Enums<"message_role">;
export type CreditTxType = Enums<"credit_tx_type">;
export type RequestStatus = Enums<"request_status">;
export type SecuritySeverity = Enums<"security_severity">;
export type SnapVerdict = Enums<"snap_verdict">;

// ============================================================
// TOOL IDS
// ============================================================
// `tools.id` en DB es TEXT sin CHECK constraint, así que el autogen lo
// tipa como `string`. Acá lo restringimos al catálogo real del MVP. Si
// sumamos una tool nueva, primero actualizar esta union.
export type ToolId =
  | "claude"
  | "weavy"
  | "kling"
  | "runway"
  | "elevenlabs"
  | "highsfield"
  | "3dsky";

// ============================================================
// ROW ALIASES
// ============================================================
// `UserRow` queda más limpio en firmas que `Tables<"users">`.

export type UserRow = Tables<"users">;
export type ToolRow = Tables<"tools">;
export type ToolAccessRow = Tables<"tool_access">;
export type SystemPromptRow = Tables<"system_prompts">;
export type ClaudeConversationRow = Tables<"claude_conversations">;
export type ClaudeMessageRow = Tables<"claude_messages">;
export type CreditPoolRow = Tables<"credit_pools">;
export type CreditAllocationRow = Tables<"credit_allocations">;
export type CreditTransactionRow = Tables<"credit_transactions">;
export type UsageLogRow = Tables<"usage_logs">;
export type ModuleSessionRow = Tables<"module_sessions">;

// ============================================================
// SCHEDULE — schema del JSONB en tool_access.schedule
// ============================================================
// El autogen lo tipa como `Json` (correcto al nivel DB). Acá le damos
// shape para que el código de horarios sea type-safe.

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Ventana horaria por día. `enabled=false` → bloqueado ese día. */
export type DaySchedule =
  | { enabled: true; from: string /* "HH:MM" */; to: string /* "HH:MM" */ }
  | { enabled: false };

export type ToolSchedule = Partial<Record<DayOfWeek, DaySchedule>>;

export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
