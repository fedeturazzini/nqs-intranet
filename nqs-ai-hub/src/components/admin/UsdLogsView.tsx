"use client";

/**
 * Vista de gasto en Claude (USD) por usuario.
 *
 * Selector de período (hoy / este mes / mes anterior / 7 días / custom) +
 * búsqueda por nombre + total del período + tabla con "Detalle".
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatUSD } from "@/lib/costs/claude-pricing";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/costs/period";

type UsdUser = {
  userId: string;
  userName: string;
  dept: string | null;
  totalUsd: number;
  messageCount: number;
};

type UsdLogsViewProps = Readonly<{
  initial: { users: UsdUser[]; totalUsd: number; totalMessages: number };
}>;

const PERIOD_ORDER: PeriodKey[] = [
  "today",
  "this-month",
  "last-month",
  "7days",
  "custom",
];

export function UsdLogsView({ initial }: UsdLogsViewProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function load(p: PeriodKey, from?: string, to?: string) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period: p });
      if (p === "custom" && from && to) {
        qs.set("from", from);
        qs.set("to", to);
      }
      const res = await fetch(`/api/admin/logs/usd?${qs.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const d = (await res.json()) as {
          users: UsdUser[];
          totalUsd: number;
          totalMessages: number;
        };
        setData({
          users: d.users,
          totalUsd: d.totalUsd,
          totalMessages: d.totalMessages,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function selectPeriod(p: PeriodKey) {
    setPeriod(p);
    if (p !== "custom") void load(p);
  }

  function detailHref(userId: string): string {
    const qs = new URLSearchParams({ period });
    if (period === "custom" && customFrom && customTo) {
      qs.set("from", customFrom);
      qs.set("to", customTo);
    }
    return `/admin/logs/${userId}?${qs.toString()}`;
  }

  const filtered = data.users.filter((u) =>
    u.userName.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="page" style={{ padding: 32 }}>
      <div className="t-eyebrow" style={{ marginBottom: 14 }}>
        ↳ ADMIN · GASTO
      </div>
      <h1
        className="page-title"
        style={{ fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}
      >
        Gasto en <em style={{ fontFamily: "var(--serif)" }}>Claude</em>
      </h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 18 }}>
        Cuánto gastó cada usuario en USD, según los tokens consumidos por
        modelo.
      </p>

      {/* Controles */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PERIOD_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => selectPeriod(p)}
              className="t-meta"
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: period === p ? "var(--accent)" : "var(--line)",
                background: period === p ? "var(--accent)" : "transparent",
                color: period === p ? "var(--accent-fg)" : "var(--fg-mute)",
                cursor: "pointer",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="hub-search" style={{ maxWidth: 240 }}>
          <span className="t-meta">⌕</span>
          <input
            placeholder="buscar usuario…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="buscar usuario"
          />
        </div>
      </div>

      {period === "custom" && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <span className="t-eyebrow">↳ DESDE</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={dateInputStyle}
          />
          <span className="t-eyebrow">HASTA</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            style={dateInputStyle}
          />
          <button
            type="button"
            className="btn sm"
            disabled={!customFrom || !customTo}
            onClick={() => void load("custom", customFrom, customTo)}
          >
            aplicar →
          </button>
        </div>
      )}

      {/* Total */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 18,
          padding: "16px 0",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          marginBottom: 16,
        }}
      >
        <div>
          <div className="t-eyebrow" style={{ fontSize: 10 }}>
            TOTAL DEL PERÍODO
          </div>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: 32,
              fontStyle: "italic",
            }}
          >
            {formatUSD(data.totalUsd)} <span style={{ fontSize: 14 }}>USD</span>
          </div>
        </div>
        <div className="t-meta dim">{data.totalMessages} mensajes</div>
        {loading && <div className="t-meta dim">cargando…</div>}
      </div>

      {/* Tabla */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.length === 0 && (
          <div
            className="t-meta dim"
            style={{ padding: "40px 0", textAlign: "center" }}
          >
            ↳ sin gasto en este período
          </div>
        )}
        {filtered.map((u) => (
          <div
            key={u.userId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--bg-elev)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}>{u.userName}</div>
              <div className="t-meta dim" style={{ fontSize: 10 }}>
                {u.dept ?? "—"}
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 15,
                minWidth: 90,
                textAlign: "right",
              }}
            >
              {formatUSD(u.totalUsd)}
            </div>
            <div
              className="t-meta dim"
              style={{ minWidth: 90, textAlign: "right", fontSize: 11 }}
            >
              {u.messageCount} msg
            </div>
            <button
              type="button"
              className="btn sm secondary"
              onClick={() => router.push(detailHref(u.userId))}
            >
              detalle →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--mono)",
  fontSize: 12,
  padding: "6px 8px",
  outline: "none",
};
