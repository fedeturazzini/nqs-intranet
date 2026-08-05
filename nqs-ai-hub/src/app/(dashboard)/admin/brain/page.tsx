/**
 * /admin/brain — System Brain (ex "Prompt Padre"), protegido por password.
 *
 * 1. Si no hay cookie `brain_session` válida → render del gate de password.
 * 2. Con cookie válida → editor del cerebro + memoria DEL PROYECTO
 *    seleccionado (?project=<id>, default = primer proyecto activo), con
 *    selector de proyecto y botón "cambiar contraseña".
 */
import { cookies } from "next/headers";
import { BrainPasswordGate } from "@/components/admin/BrainPasswordGate";
import { BrainContent } from "@/components/admin/BrainContent";
import { createServerClient } from "@/lib/db/supabase";
import { decrypt } from "@/lib/utils/crypto";
import { listActiveProjects } from "@/lib/db/queries/projects";
import { BRAIN_COOKIE, isValidBrainToken } from "@/lib/auth/brain";

export const dynamic = "force-dynamic";

type PromptType = "system" | "memory";

async function loadStateForType(type: PromptType, projectId: string) {
  const db = createServerClient();
  const { data: versions } = await db
    .from("system_prompts")
    .select(
      "id, tool_id, type, name, model, thinking_mode, is_active, version, created_by, created_at, users!system_prompts_created_by_fkey(name)",
    )
    .eq("tool_id", "claude")
    .eq("type", type)
    .eq("project_id", projectId)
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
    activeContent = full?.content_encrypted ? decrypt(full.content_encrypted) : "";
  }

  return {
    versions: versions ?? [],
    activeId: active?.id ?? null,
    activeContent,
    activeModel: active?.model ?? "claude-sonnet-4-6",
    activeThinkingMode: active?.thinking_mode ?? "auto",
  };
}

type PageProps = {
  searchParams: Promise<{ project?: string }>;
};

export default async function AdminBrainPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const unlocked = isValidBrainToken(cookieStore.get(BRAIN_COOKIE)?.value);
  if (!unlocked) {
    return <BrainPasswordGate />;
  }

  const projects = await listActiveProjects();
  const { project: projectParam } = await searchParams;
  const selected =
    projects.find((p) => p.id === projectParam) ?? projects[0] ?? null;

  if (!selected) {
    return (
      <div style={{ padding: 32 }}>
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>
          ↳ ADMIN · SYSTEM BRAIN
        </div>
        <p className="t-meta dim">
          No hay proyectos activos. Creá uno en{" "}
          <a href="/admin/projects" style={{ color: "var(--accent)" }}>
            /admin/projects
          </a>
          .
        </p>
      </div>
    );
  }

  const [systemState, memoryState] = await Promise.all([
    loadStateForType("system", selected.id),
    loadStateForType("memory", selected.id),
  ]);

  return (
    <BrainContent
      projects={projects.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
      selectedProjectId={selected.id}
      systemState={systemState}
      memoryState={memoryState}
    />
  );
}
