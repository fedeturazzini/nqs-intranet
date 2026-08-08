/**
 * /admin/logs — Gasto en Claude (USD) por usuario.
 *
 * Protegido por gate de contraseña (migration 0021): sin cookie válida
 * solo se muestra el password gate; no se precarga data de gasto.
 */
import { GastosPasswordGate } from "@/components/admin/GastosPasswordGate";
import { UsdLogsView } from "@/components/admin/UsdLogsView";
import { hasGastosGate } from "@/lib/auth/gastos-gate";
import { getUsdSummary } from "@/lib/db/queries/usage-costs";
import { resolvePeriod } from "@/lib/costs/period";

export const dynamic = "force-dynamic";

export default async function AdminLogsPage() {
  if (!(await hasGastosGate())) {
    return <GastosPasswordGate />;
  }

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
