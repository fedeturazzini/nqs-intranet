/**
 * /admin/logs — Gasto en Claude (USD) por usuario.
 *
 * Rediseño prompt 17: la vista por defecto es el gasto en USD por usuario
 * con filtros de período + detalle. El log técnico de auditoría
 * (LogsBoard) queda como componente disponible para debugging, pero no es
 * la vista principal.
 *
 * Pre-carga el resumen de "hoy" para evitar el flash inicial.
 */
import { UsdLogsView } from "@/components/admin/UsdLogsView";
import { getUsdSummary } from "@/lib/db/queries/usage-costs";
import { resolvePeriod } from "@/lib/costs/period";

export const dynamic = "force-dynamic";

export default async function AdminLogsPage() {
  const { fromIso, toIso } = resolvePeriod("today");
  const summary = await getUsdSummary(fromIso, toIso);
  const totalUsd = summary.reduce((a, u) => a + u.totalUsd, 0);
  const totalMessages = summary.reduce((a, u) => a + u.messageCount, 0);

  return (
    <UsdLogsView
      initial={{ users: summary, totalUsd, totalMessages }}
    />
  );
}
