/**
 * Queries de tools y permisos.
 *
 * Server-only.
 */
import { createServerClient } from "@/lib/db/supabase";
import type { ToolAccessRow, ToolId, ToolRow } from "@/types/db";

export async function getToolById(id: ToolId): Promise<ToolRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("tools")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listTools(): Promise<ToolRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("tools")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getToolAccess(
  userId: string,
  toolId: ToolId,
): Promise<ToolAccessRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("tool_access")
    .select("*")
    .eq("user_id", userId)
    .eq("tool_id", toolId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
