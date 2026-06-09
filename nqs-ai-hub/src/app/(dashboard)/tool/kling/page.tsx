/**
 * /tool/kling — Server Component dispatcher. Clon de /tool/3dsky.
 *
 * Route estática gana sobre `/tool/[toolId]/page.tsx`, así que esta URL nunca
 * cae en el dispatcher genérico.
 *
 * Flujo:
 *   1. requireAuth.
 *   2. canUseTool → si rebota, pantalla de gate (outside_hours / no_credits /
 *      no_access / pending / expired).
 *   3. Si pasa: schedule + URL del adapter + créditos iniciales → KlingView.
 */
import { redirect } from "next/navigation";
import { KlingView } from "@/components/screens/KlingView";
import { OutsideHoursScreen } from "@/components/screens/OutsideHoursScreen";
import { NoCreditsScreen } from "@/components/screens/NoCreditsScreen";
import { NoAccessScreen } from "@/components/screens/NoAccessScreen";
import { requireAuth } from "@/lib/auth/server";
import { getAdapter } from "@/lib/adapters";
import { canUseTool } from "@/lib/middleware/permissions";
import { createServerClient } from "@/lib/db/supabase";
import type { ToolSchedule } from "@/types/db-aliases";

export const dynamic = "force-dynamic";

export default async function KlingPage() {
  const session = await requireAuth();
  const db = createServerClient();

  // Schedule actual (la usan los gates outside_hours).
  const { data: access } = await db
    .from("tool_access")
    .select("schedule")
    .eq("user_id", session.userId)
    .eq("tool_id", "kling")
    .maybeSingle();
  const schedule = (access?.schedule ?? null) as ToolSchedule | null;

  const perm = await canUseTool(session.userId, "kling");
  if (!perm.allowed) {
    if (perm.reason === "outside_hours") {
      if (schedule)
        return <OutsideHoursScreen schedule={schedule} toolName="Kling" />;
      return <NoAccessScreen reason="no_access" toolName="Kling" />;
    }
    if (perm.reason === "no_credits") {
      return <NoCreditsScreen toolId="kling" toolName="Kling" />;
    }
    // El acceso expirado se maneja desde el hub (card + modal de renovación).
    if (perm.reason === "expired") {
      redirect("/hub");
    }
    if (perm.reason === "no_access" || perm.reason === "pending_approval") {
      return (
        <NoAccessScreen
          reason={perm.reason}
          message={perm.message ?? null}
          toolName="Kling"
        />
      );
    }
    // not_authenticated u otros — el proxy ya tendría que haber redirigido.
    return <NoAccessScreen reason="no_access" toolName="Kling" />;
  }

  // OK — créditos iniciales para evitar flash 0/0 antes del fetch.
  const { data: alloc } = await db
    .from("credit_allocations")
    .select("credits_assigned, credits_used")
    .eq("user_id", session.userId)
    .eq("tool_id", "kling")
    .maybeSingle();
  const creditsTotal = alloc?.credits_assigned ?? 0;
  const used = alloc?.credits_used ?? 0;
  const credits = creditsTotal - used;

  const adapter = getAdapter("kling");
  const embedUrl = adapter.getEmbedUrl
    ? await adapter.getEmbedUrl(session.userId)
    : "https://kling.ai/app/video/new?ac=1";

  return (
    <KlingView
      embedUrl={embedUrl}
      initialCredits={{ credits, creditsTotal, used }}
      schedule={schedule}
    />
  );
}
