/**
 * Tipos de la base de datos NQS AI Hub.
 *
 * ⚠️ Este archivo está hand-typed por ahora — fiel al schema en
 * `supabase/migrations/0001_initial_schema.sql`. Se va a regenerar con:
 *
 *   npx supabase login                                  # interactivo, abre browser
 *   npx supabase gen types typescript \
 *     --project-id nslliqinzpqjiysjlulm > src/types/db.ts
 *
 * Cualquier cambio de schema requiere regenerar. Mientras tanto, si tocan
 * la migration, también tocan este archivo.
 */

export type UserRole = "admin" | "employee";
export type ToolCategory = "text" | "visual" | "video" | "audio" | "assets";
export type AccessStatus = "active" | "pending" | "locked" | "expired";
export type MessageRole = "user" | "assistant";
export type CreditTxType =
  | "allocation"
  | "consumption"
  | "refund"
  | "adjustment";
export type RequestStatus = "pending" | "approved" | "rejected" | "expired";
export type SecuritySeverity = "low" | "med" | "high";
export type SnapVerdict = "ok" | "review" | "flag";

export type ToolId =
  | "claude"
  | "weavy"
  | "kling"
  | "runway"
  | "elevenlabs"
  | "highsfield"
  | "3dsky";

// ============================================================
// Tablas
// ============================================================

export type UserRow = {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: UserRole;
  dept: string | null;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ToolRow = {
  id: ToolId;
  name: string;
  vendor: string;
  category: ToolCategory;
  description: string | null;
  color: string | null;
  glyph: string | null;
  is_active: boolean;
  uses_credits: boolean;
  embed_url: string | null;
  created_at: string;
};

export type ToolAccessRow = {
  id: string;
  user_id: string;
  tool_id: ToolId;
  status: AccessStatus;
  expires_at: string | null;
  granted_by: string | null;
  granted_at: string;
};

export type SystemPromptRow = {
  id: string;
  tool_id: ToolId;
  name: string;
  content_encrypted: string;
  is_active: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClaudeConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type ClaudeMessageRow = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  images: unknown; // JSONB
  tokens_input: number | null;
  tokens_output: number | null;
  created_at: string;
};

export type CreditPoolRow = {
  id: string;
  tool_id: ToolId;
  total_credits: number;
  cost_usd: number | null;
  purchased_by: string | null;
  purchase_note: string | null;
  created_at: string;
};

export type CreditAllocationRow = {
  id: string;
  user_id: string;
  tool_id: ToolId;
  credits_assigned: number;
  credits_used: number;
  reset_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditTransactionRow = {
  id: string;
  user_id: string;
  tool_id: ToolId;
  type: CreditTxType;
  amount: number;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
};

export type UsageLogRow = {
  id: string;
  user_id: string;
  tool_id: ToolId | null;
  action: string;
  metadata: unknown;
  tokens_consumed: number | null;
  credits_consumed: number | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

// ============================================================
// Database (forma compatible con supabase-js generics)
// ============================================================

type TableDef<R, I = Partial<R>, U = Partial<R>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      users: TableDef<
        UserRow,
        Partial<UserRow> & Pick<UserRow, "email" | "name" | "initials">
      >;
      tools: TableDef<ToolRow, ToolRow>;
      tool_access: TableDef<
        ToolAccessRow,
        Partial<ToolAccessRow> & Pick<ToolAccessRow, "user_id" | "tool_id">
      >;
      system_prompts: TableDef<
        SystemPromptRow,
        Partial<SystemPromptRow> &
          Pick<SystemPromptRow, "tool_id" | "name" | "content_encrypted">
      >;
      claude_conversations: TableDef<
        ClaudeConversationRow,
        Partial<ClaudeConversationRow> & Pick<ClaudeConversationRow, "user_id">
      >;
      claude_messages: TableDef<
        ClaudeMessageRow,
        Partial<ClaudeMessageRow> &
          Pick<ClaudeMessageRow, "conversation_id" | "role" | "content">
      >;
      credit_pools: TableDef<
        CreditPoolRow,
        Partial<CreditPoolRow> &
          Pick<CreditPoolRow, "tool_id" | "total_credits">
      >;
      credit_allocations: TableDef<
        CreditAllocationRow,
        Partial<CreditAllocationRow> &
          Pick<CreditAllocationRow, "user_id" | "tool_id">
      >;
      credit_transactions: TableDef<
        CreditTransactionRow,
        Partial<CreditTransactionRow> &
          Pick<
            CreditTransactionRow,
            "user_id" | "tool_id" | "type" | "amount"
          >
      >;
      usage_logs: TableDef<
        UsageLogRow,
        Partial<UsageLogRow> & Pick<UsageLogRow, "user_id" | "action">
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      tool_category: ToolCategory;
      access_status: AccessStatus;
      message_role: MessageRole;
      credit_tx_type: CreditTxType;
      request_status: RequestStatus;
      security_severity: SecuritySeverity;
      snap_verdict: SnapVerdict;
    };
  };
};
