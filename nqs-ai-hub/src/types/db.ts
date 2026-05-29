export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string | null
          credits_requested: number | null
          duration_minutes: number | null
          exceptional_duration_minutes: number | null
          id: string
          reason: string | null
          request_type: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"] | null
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_requested?: number | null
          duration_minutes?: number | null
          exceptional_duration_minutes?: number | null
          id?: string
          reason?: string | null
          request_type?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_requested?: number | null
          duration_minutes?: number | null
          exceptional_duration_minutes?: number | null
          id?: string
          reason?: string | null
          request_type?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"] | null
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claude_conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claude_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claude_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          images: Json | null
          role: Database["public"]["Enums"]["message_role"]
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          images?: Json | null
          role: Database["public"]["Enums"]["message_role"]
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          images?: Json | null
          role?: Database["public"]["Enums"]["message_role"]
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "claude_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "claude_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_allocations: {
        Row: {
          created_at: string | null
          credits_assigned: number
          credits_used: number
          id: string
          reset_at: string | null
          tool_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_assigned?: number
          credits_used?: number
          id?: string
          reset_at?: string | null
          tool_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_assigned?: number
          credits_used?: number
          id?: string
          reset_at?: string | null
          tool_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_allocations_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_allocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_pools: {
        Row: {
          cost_usd: number | null
          created_at: string | null
          id: string
          purchase_note: string | null
          purchased_by: string | null
          tool_id: string
          total_credits: number
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          purchase_note?: string | null
          purchased_by?: string | null
          tool_id: string
          total_credits: number
        }
        Update: {
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          purchase_note?: string | null
          purchased_by?: string | null
          tool_id?: string
          total_credits?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_pools_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_pools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          performed_by: string | null
          reason: string | null
          tool_id: string
          type: Database["public"]["Enums"]["credit_tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          performed_by?: string | null
          reason?: string | null
          tool_id: string
          type: Database["public"]["Enums"]["credit_tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          performed_by?: string | null
          reason?: string | null
          tool_id?: string
          type?: Database["public"]["Enums"]["credit_tx_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      module_sessions: {
        Row: {
          declared_consumption: number | null
          entered_at: string
          exited_at: string | null
          id: string
          ip_address: unknown
          tool_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          declared_consumption?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          ip_address?: unknown
          tool_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          declared_consumption?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          ip_address?: unknown
          tool_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_sessions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshots: {
        Row: {
          created_at: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          tool_id: string | null
          user_id: string
          verdict: Database["public"]["Enums"]["snap_verdict"] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          tool_id?: string | null
          user_id: string
          verdict?: Database["public"]["Enums"]["snap_verdict"] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string
          tool_id?: string | null
          user_id?: string
          verdict?: Database["public"]["Enums"]["snap_verdict"] | null
        }
        Relationships: [
          {
            foreignKeyName: "screenshots_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          action_taken: string | null
          created_at: string | null
          excerpt: string | null
          full_content: string | null
          id: string
          rule_id: string
          severity: Database["public"]["Enums"]["security_severity"]
          tool_id: string | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          excerpt?: string | null
          full_content?: string | null
          id?: string
          rule_id: string
          severity: Database["public"]["Enums"]["security_severity"]
          tool_id?: string | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          excerpt?: string | null
          full_content?: string | null
          id?: string
          rule_id?: string
          severity?: Database["public"]["Enums"]["security_severity"]
          tool_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_events_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          content_encrypted: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          model: string
          name: string
          tool_id: string
          type: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          content_encrypted: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          model?: string
          name: string
          tool_id: string
          type?: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          content_encrypted?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          model?: string
          name?: string
          tool_id?: string
          type?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "system_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_prompts_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      time_windows: {
        Row: {
          created_at: string | null
          day_of_week: number | null
          end_hour: number | null
          id: string
          is_active: boolean | null
          start_hour: number | null
          timezone: string | null
          tool_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number | null
          end_hour?: number | null
          id?: string
          is_active?: boolean | null
          start_hour?: number | null
          timezone?: string | null
          tool_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number | null
          end_hour?: number | null
          id?: string
          is_active?: boolean | null
          start_hour?: number | null
          timezone?: string | null
          tool_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_windows_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_windows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_access: {
        Row: {
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          schedule: Json | null
          status: Database["public"]["Enums"]["access_status"]
          tool_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          schedule?: Json | null
          status?: Database["public"]["Enums"]["access_status"]
          tool_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          schedule?: Json | null
          status?: Database["public"]["Enums"]["access_status"]
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_access_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          category: Database["public"]["Enums"]["tool_category"]
          color: string | null
          created_at: string | null
          description: string | null
          embed_url: string | null
          glyph: string | null
          id: string
          is_active: boolean | null
          name: string
          uses_credits: boolean | null
          vendor: string
        }
        Insert: {
          category: Database["public"]["Enums"]["tool_category"]
          color?: string | null
          created_at?: string | null
          description?: string | null
          embed_url?: string | null
          glyph?: string | null
          id: string
          is_active?: boolean | null
          name: string
          uses_credits?: boolean | null
          vendor: string
        }
        Update: {
          category?: Database["public"]["Enums"]["tool_category"]
          color?: string | null
          created_at?: string | null
          description?: string | null
          embed_url?: string | null
          glyph?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          uses_credits?: boolean | null
          vendor?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action: string
          created_at: string | null
          credits_consumed: number | null
          id: string
          ip_address: unknown
          metadata: Json | null
          tokens_consumed: number | null
          tool_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          credits_consumed?: number | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          tokens_consumed?: number | null
          tool_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          credits_consumed?: number | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          tokens_consumed?: number | null
          tool_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          dept: string | null
          email: string
          id: string
          initials: string
          is_active: boolean | null
          job_title: string | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          theme_preference: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          dept?: string | null
          email: string
          id?: string
          initials: string
          is_active?: boolean | null
          job_title?: string | null
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          theme_preference?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          dept?: string | null
          email?: string
          id?: string
          initials?: string
          is_active?: boolean | null
          job_title?: string | null
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          theme_preference?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      user_credits_view: {
        Row: {
          credits_assigned: number | null
          credits_available: number | null
          credits_used: number | null
          tool_id: string | null
          user_id: string | null
        }
        Insert: {
          credits_assigned?: number | null
          credits_available?: never
          credits_used?: number | null
          tool_id?: string | null
          user_id?: string | null
        }
        Update: {
          credits_assigned?: number | null
          credits_available?: never
          credits_used?: number | null
          tool_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_allocations_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_allocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      consume_credit_atomic: {
        Args: {
          p_amount: number
          p_reason: string
          p_tool_id: string
          p_user_id: string
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      access_status: "active" | "pending" | "locked" | "expired"
      credit_tx_type: "allocation" | "consumption" | "refund" | "adjustment"
      message_role: "user" | "assistant"
      request_status: "pending" | "approved" | "rejected" | "expired"
      security_severity: "low" | "med" | "high"
      snap_verdict: "ok" | "review" | "flag"
      tool_category: "text" | "visual" | "video" | "audio" | "assets"
      user_role: "admin" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_status: ["active", "pending", "locked", "expired"],
      credit_tx_type: ["allocation", "consumption", "refund", "adjustment"],
      message_role: ["user", "assistant"],
      request_status: ["pending", "approved", "rejected", "expired"],
      security_severity: ["low", "med", "high"],
      snap_verdict: ["ok", "review", "flag"],
      tool_category: ["text", "visual", "video", "audio", "assets"],
      user_role: ["admin", "employee"],
    },
  },
} as const
