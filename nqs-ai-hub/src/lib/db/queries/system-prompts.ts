/**
 * Queries de system_prompts (el "cerebro" de cada tool).
 *
 * Server-only — el contenido desencriptado NUNCA sale al cliente. Solo se
 * usa para mandárselo a Anthropic en el endpoint de Claude, y para el
 * editor del panel admin (que también es server-side).
 */
import { createServerClient } from "@/lib/db/supabase";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import type { SystemPromptRow, ToolId } from "@/types/db-aliases";

export type ActiveSystemPrompt = {
  id: string;
  toolId: ToolId;
  name: string;
  version: number;
  content: string; // plaintext, ya desencriptado
};

/**
 * Devuelve el prompt activo de una tool con el contenido en plaintext.
 * Si no hay ninguno activo, devuelve null.
 */
export async function getActiveSystemPrompt(
  toolId: ToolId,
): Promise<ActiveSystemPrompt | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .select("*")
    .eq("tool_id", toolId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    // El autogen tipa `tool_id` como `string` (la columna es TEXT FK a
    // tools.id sin CHECK constraint). Es una FK válida a tools, así que
    // siempre cae en el catálogo de ToolId.
    toolId: data.tool_id as ToolId,
    name: data.name,
    // `version` tiene DEFAULT 1 pero el autogen lo marca nullable. Si
    // viniera null caemos a 1 — semánticamente equivalente al default.
    version: data.version ?? 1,
    content: decrypt(data.content_encrypted),
  };
}

/**
 * Actualiza el contenido (plaintext) de un prompt. Se encripta antes de
 * persistir. No toca `is_active`, `tool_id` ni `version` — para versionar
 * usar `createSystemPromptVersion`.
 */
export async function updateSystemPrompt(
  id: string,
  content: string,
): Promise<SystemPromptRow> {
  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .update({ content_encrypted: encrypt(content) })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
