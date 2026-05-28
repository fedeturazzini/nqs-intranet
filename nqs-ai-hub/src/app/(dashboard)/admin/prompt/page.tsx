/**
 * /admin/prompt — Editor del prompt padre + selector de modelo.
 *
 * Server Component pre-carga las versiones (sin contenido — el contenido
 * es el plaintext desencriptado y se levanta on-demand cuando el admin
 * selecciona una version).
 */
import { PromptManager } from "@/components/admin/PromptManager";
import { createServerClient } from "@/lib/db/supabase";
import { decrypt } from "@/lib/utils/crypto";

export const dynamic = "force-dynamic";

async function loadInitialState() {
  const db = createServerClient();
  const { data: versions } = await db
    .from("system_prompts")
    .select(
      "id, tool_id, name, model, is_active, version, created_by, created_at, users!system_prompts_created_by_fkey(name)",
    )
    .eq("tool_id", "claude")
    .order("version", { ascending: false })
    .limit(50);

  // Pre-cargamos el contenido del ACTIVO para que el editor abra sin
  // wait visible. Los demás se cargan al click.
  const active = versions?.find((v) => v.is_active);
  let activeContent: string | null = null;
  if (active) {
    const { data: full } = await db
      .from("system_prompts")
      .select("content_encrypted")
      .eq("id", active.id)
      .maybeSingle();
    if (full?.content_encrypted) {
      activeContent = decrypt(full.content_encrypted);
    }
  }

  return {
    versions: versions ?? [],
    activeId: active?.id ?? null,
    activeContent,
    activeModel: active?.model ?? "claude-sonnet-4-6",
  };
}

export default async function AdminPromptPage() {
  const state = await loadInitialState();
  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <div className="t-eyebrow" style={{ marginBottom: 14 }}>
        ↳ ADMIN · PROMPT PADRE
      </div>
      <h1
        className="page-title"
        style={{ fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}
      >
        Cerebro de <em style={{ fontFamily: "var(--serif)" }}>Claude</em>
      </h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 22 }}>
        Texto que se manda como <code>system</code> en cada llamada. NUNCA
        se devuelve al cliente.
      </p>
      <PromptManager
        versions={state.versions}
        activeId={state.activeId}
        activeContent={state.activeContent}
        activeModel={state.activeModel}
      />
    </div>
  );
}
