/**
 * /tool/3dsky — Server Component dispatcher.
 *
 * Route estática gana sobre `/tool/[toolId]/page.tsx`, así que esta
 * URL nunca cae en el dispatcher genérico. El dispatcher quedó solo
 * para Claude (y redirige todo lo demás a /hub).
 *
 * Flujo:
 *   1. requireAuth.
 *   2. canUseTool → si rebota, mostramos la pantalla de gate apropiada
 *      (outside_hours / no_credits / no_access / pending / expired).
 *   3. Si pasa: cargamos schedule + URL del adapter + créditos iniciales
 *      y rendereamos `ThreeDSkyView`.
 *
 * La schedule se carga incluso cuando estamos fuera de horario, porque
 * `OutsideHoursScreen` la usa para mostrar la próxima ventana al user.
 */
import { redirect } from "next/navigation";
import { ThreeDSkyView } from "@/components/screens/ThreeDSkyView";
import { OutsideHoursScreen } from "@/components/screens/OutsideHoursScreen";
import { NoCreditsScreen } from "@/components/screens/NoCreditsScreen";
import { NoAccessScreen } from "@/components/screens/NoAccessScreen";
import { requireAuth } from "@/lib/auth/server";
import { getAdapter } from "@/lib/adapters";
import { canUseTool } from "@/lib/middleware/permissions";
import { createServerClient } from "@/lib/db/supabase";
import type { ToolSchedule } from "@/types/db-aliases";

export const dynamic = "force-dynamic";

export default async function ThreeDSkyPage() {
  const session = await requireAuth();
  const db = createServerClient();

  // Si la tool está en "Próximamente" (is_active=false), no es usable por NADIE
  // (ni admin ni quien ya tenga acceso). La mandamos al hub, donde se ve la card
  // como las demás. Esto cierra el acceso por URL directa cuando se la pausa.
  const { data: toolRow } = await db
    .from("tools")
    .select("is_active")
    .eq("id", "3dsky")
    .maybeSingle();
  if (!toolRow?.is_active) {
    redirect("/hub");
  }

  // Schedule actual (la levantamos siempre — la usan los gates outside_hours).
  const { data: access } = await db
    .from("tool_access")
    .select("schedule")
    .eq("user_id", session.userId)
    .eq("tool_id", "3dsky")
    .maybeSingle();
  const schedule = (access?.schedule ?? null) as ToolSchedule | null;

  const perm = await canUseTool(session.userId, "3dsky");
  if (!perm.allowed) {
    if (perm.reason === "outside_hours") {
      // `canUseTool` solo devuelve outside_hours si había schedule, así
      // que `schedule` siempre va a estar acá. Por las dudas, fallback
      // a no_access si lo encontramos null (estado inconsistente).
      if (schedule) return <OutsideHoursScreen schedule={schedule} />;
      return <NoAccessScreen reason="no_access" />;
    }
    if (perm.reason === "no_credits") {
      return <NoCreditsScreen />;
    }
    // FEEDBACK NQS v2.0: el acceso expirado se maneja desde el hub (card
    // con status + modal de renovación), no con la pantalla full del
    // módulo. Mandamos al hub para que el user vea la card expirada.
    if (perm.reason === "expired") {
      redirect("/hub");
    }
    if (
      perm.reason === "no_access" ||
      perm.reason === "pending_approval"
      // "expired" se maneja arriba con redirect a /hub (FEEDBACK NQS v2.0)
    ) {
      return (
        <NoAccessScreen reason={perm.reason} message={perm.message ?? null} />
      );
    }
    // not_authenticated u otros — el proxy ya tendría que haber redirigido.
    return <NoAccessScreen reason="no_access" />;
  }

  // OK — cargamos créditos iniciales para evitar flash 0/0 antes del fetch.
  const { data: alloc } = await db
    .from("credit_allocations")
    .select("credits_assigned, credits_used")
    .eq("user_id", session.userId)
    .eq("tool_id", "3dsky")
    .maybeSingle();
  const creditsTotal = alloc?.credits_assigned ?? 0;
  const used = alloc?.credits_used ?? 0;
  const credits = creditsTotal - used;

  const adapter = getAdapter("3dsky");
  const embedUrl = adapter.getEmbedUrl
    ? await adapter.getEmbedUrl(session.userId)
    : "https://3dsky.org/es/";

  return (
    <ThreeDSkyView
      embedUrl={embedUrl}
      initialCredits={{ credits, creditsTotal, used }}
      schedule={schedule}
    />
  );
}
