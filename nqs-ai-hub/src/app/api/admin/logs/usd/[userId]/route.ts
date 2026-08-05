/**
 * GET /api/admin/logs/usd/[userId]
 *
 * Detalle de gasto de un usuario para un período (lista de llamadas).
 * Query: ?period=today|this-month|last-month|7days|custom [&from=&to=]
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { getUsdDetailForUser } from "@/lib/db/queries/usage-costs";
import { isPeriodKey, resolvePeriod } from "@/lib/costs/period";

type RouteContext = { params: Promise<{ userId: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { userId } = await context.params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "today";
  const period = isPeriodKey(periodParam) ? periodParam : "today";
  const { fromIso, toIso } = resolvePeriod(
    period,
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  const detail = await getUsdDetailForUser(userId, fromIso, toIso);
  return NextResponse.json({ from: fromIso, to: toIso, ...detail });
}
