/**
 * /admin/prompt — Editor del prompt padre + memoria del workspace.
 *
 * Server Component pre-carga versiones de los 2 types (system + memory)
 * y el contenido del activo de cada uno para que el editor abra sin
 * wait visible. Las versiones inactivas se cargan al click.
 */
import { PromptTabs } from "@/components/admin/PromptTabs";
import { createServerClient } from "@/lib/db/supabase";
import { decrypt } from "@/lib/utils/crypto";

export const dynamic = "force-dynamic";

type PromptType = "system" | "memory";

async function loadInitialStateForType(type: PromptType) {
  const db = createServerClient();
  const { data: versions } = await db
    .from("system_prompts")
    .select(
      "id, tool_id, type, name, model, is_active, version, created_by, created_at, users!system_prompts_created_by_fkey(name)",
    )
    .eq("tool_id", "claude")
    .eq("type", type)
    .order("version", { ascending: false })
    .limit(50);

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
    } else {
      // Memoria recién creada puede tener content_encrypted = ''.
      activeContent = "";
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
  const [systemState, memoryState] = await Promise.all([
    loadInitialStateForType("system"),
    loadInitialStateForType("memory"),
  ]);

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
        Lo que se manda como <code>system</code> en cada llamada. El system
        prompt (instrucciones) y la memoria (contexto del workspace) se
        editan por separado y se concatenan automáticamente al
        ejecutar.
      </p>
      <PromptTabs
        systemState={systemState}
        memoryState={memoryState}
      />
    </div>
  );
}
