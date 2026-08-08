/**
 * GET /api/admin/logs/usd
 *
 * Resumen de gasto en Claude (USD) por usuario para un período.
 * Query: ?period=today|this-month|last-month|7days|custom [&from=&to=]
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { requireGastosGateApi } from "@/lib/auth/gastos-gate";
import { getUsdSummary } from "@/lib/db/queries/usage-costs";
import { isPeriodKey, resolvePeriod } from "@/lib/costs/period";

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const gate = await requireGastosGateApi();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "today";
  const period = isPeriodKey(periodParam) ? periodParam : "today";
  const { fromIso, toIso } = resolvePeriod(
    period,
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  const summary = await getUsdSummary(fromIso, toIso);
  const totalUsd = summary.reduce((acc, u) => acc + u.totalUsd, 0);
  const totalMessages = summary.reduce((acc, u) => acc + u.messageCount, 0);

  return NextResponse.json({
    from: fromIso,
    to: toIso,
    totalUsd,
    totalMessages,
    users: summary,
  });
}
