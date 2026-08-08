/**
 * /admin/logs/[userId] — detalle de gasto de un usuario.
 *
 * Protegido por gate de Gastos. Incluye link a ver conversaciones (V1).
 */
import Link from "next/link";
import { GastosPasswordGate } from "@/components/admin/GastosPasswordGate";
import { hasGastosGate } from "@/lib/auth/gastos-gate";
import { getUsdDetailForUser } from "@/lib/db/queries/usage-costs";
import { formatUSD } from "@/lib/costs/claude-pricing";
import {
  PERIOD_LABELS,
  isPeriodKey,
  resolvePeriod,
  type PeriodKey,
} from "@/lib/costs/period";

export const dynamic = "force-dynamic";

const DT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

const PRESET_PERIODS: PeriodKey[] = [
  "today",
  "this-month",
  "last-month",
  "7days",
];

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
};

export default async function AdminLogsDetailPage({
  params,
  searchParams,
}: PageProps) {
  if (!(await hasGastosGate())) {
    return <GastosPasswordGate />;
  }

  const { userId } = await params;
  const sp = await searchParams;
  const period: PeriodKey =
    sp.period && isPeriodKey(sp.period) ? sp.period : "today";
  const { fromIso, toIso } = resolvePeriod(period, sp.from, sp.to);

  const detail = await getUsdDetailForUser(userId, fromIso, toIso);

  return (
    <div className="page" style={{ padding: 32 }}>
      <Link
        href="/admin/logs"
        className="t-meta"
        style={{ color: "var(--accent)" }}
      >
        ← volver a gasto
      </Link>

      <div style={{ marginTop: 14 }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>
          ↳ ADMIN · GASTO · DETALLE
        </div>
        <h1 className="page-title" style={{ fontSize: 26, margin: 0 }}>
          <em style={{ fontFamily: "var(--serif)" }}>{detail.userName}</em>
        </h1>
        <p className="t-meta dim" style={{ marginTop: 4 }}>
          {detail.dept ?? "—"}
        </p>
      </div>

      {/* Selector de período (links) */}
      <div style={{ display: "flex", gap: 4, marginTop: 14, flexWrap: "wrap" }}>
        {PRESET_PERIODS.map((p) => {
          const active = p === period;
          return (
            <Link
              key={p}
              href={`/admin/logs/${userId}?period=${p}`}
              className="t-meta"
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: active ? "var(--accent)" : "var(--line)",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent-fg)" : "var(--fg-mute)",
                textTransform: "uppercase",
                fontSize: 11,
                letterSpacing: "0.06em",
                textDecoration: "none",
              }}
            >
              {PERIOD_LABELS[p]}
            </Link>
          );
        })}
        {period === "custom" && (
          <span className="t-meta dim" style={{ alignSelf: "center" }}>
            (período personalizado)
          </span>
        )}
      </div>

      {/* Total + CTA conversaciones (junto al resumen, donde se mira primero) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
          padding: "16px 0",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          margin: "16px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: 30,
              fontStyle: "italic",
            }}
          >
            {formatUSD(detail.totalUsd)}{" "}
            <span style={{ fontSize: 13 }}>USD</span>
          </div>
          <div className="t-meta dim">{detail.messageCount} mensajes</div>
        </div>
        <Link
          href={`/admin/logs/${userId}/conversations`}
          className="btn"
          style={{ textDecoration: "none", flexShrink: 0 }}
        >
          ver conversaciones →
        </Link>
      </div>

      {/* Llamadas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          className="t-eyebrow"
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1fr 120px 90px",
            gap: 12,
            padding: "0 12px 8px",
            fontSize: 9,
          }}
        >
          <span>FECHA</span>
          <span>MODELO</span>
          <span style={{ textAlign: "right" }}>TOKENS (IN/OUT)</span>
          <span style={{ textAlign: "right" }}>USD</span>
        </div>
        {detail.calls.length === 0 && (
          <div
            className="t-meta dim"
            style={{ padding: "30px 0", textAlign: "center" }}
          >
            ↳ sin llamadas en este período
          </div>
        )}
        {detail.calls.map((c, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 120px 90px",
              gap: 12,
              padding: "10px 12px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--bg-elev)",
              fontSize: 12,
              alignItems: "center",
            }}
          >
            <span className="t-meta dim">
              {c.createdAt ? DT.format(new Date(c.createdAt)) : "—"}
            </span>
            <span style={{ fontFamily: "var(--mono)" }}>
              {c.model.replace("claude-", "")}
            </span>
            <span
              className="t-meta dim"
              style={{ textAlign: "right", fontFamily: "var(--mono)" }}
            >
              {c.tokensIn.toLocaleString("es-AR")} /{" "}
              {c.tokensOut.toLocaleString("es-AR")}
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)" }}>
              {formatUSD(c.usd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
