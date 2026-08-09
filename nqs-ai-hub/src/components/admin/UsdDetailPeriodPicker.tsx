"use client";

/**
 * Selector de período para /admin/logs/[userId].
 * Misma UX que UsdLogsView: presets + Personalizado (desde/hasta + aplicar).
 * Navega con query params; la página server re-fetcha el detalle.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/costs/period";

const PERIOD_ORDER: PeriodKey[] = [
  "today",
  "this-month",
  "last-month",
  "7days",
  "custom",
];

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

type UsdDetailPeriodPickerProps = Readonly<{
  userId: string;
  period: PeriodKey;
  /** YYYY-MM-DD si venís de custom; vacío si no. */
  initialFrom?: string;
  initialTo?: string;
}>;

export function UsdDetailPeriodPicker({
  userId,
  period,
  initialFrom = "",
  initialTo = "",
}: UsdDetailPeriodPickerProps) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(initialFrom);
  const [customTo, setCustomTo] = useState(initialTo);
  // Abrir panel custom sin navegar hasta "aplicar" (como UsdLogsView).
  const [pickingCustom, setPickingCustom] = useState(period === "custom");

  const activePeriod: PeriodKey = pickingCustom ? "custom" : period;

  function go(p: PeriodKey, from?: string, to?: string) {
    const qs = new URLSearchParams({ period: p });
    if (p === "custom" && from && to) {
      qs.set("from", from);
      qs.set("to", to);
    }
    router.push(`/admin/logs/${userId}?${qs.toString()}`);
  }

  function selectPeriod(p: PeriodKey) {
    if (p === "custom") {
      setPickingCustom(true);
      return;
    }
    setPickingCustom(false);
    go(p);
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {PERIOD_ORDER.map((p) => {
          const active = p === activePeriod;
          return (
            <button
              key={p}
              type="button"
              onClick={() => selectPeriod(p)}
              className="t-meta"
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: active ? "var(--accent)" : "var(--line)",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent-fg)" : "var(--fg-mute)",
                cursor: "pointer",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          );
        })}
      </div>

      {pickingCustom && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 12,
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
            onClick={() => go("custom", customFrom, customTo)}
          >
            aplicar →
          </button>
        </div>
      )}
    </div>
  );
}
