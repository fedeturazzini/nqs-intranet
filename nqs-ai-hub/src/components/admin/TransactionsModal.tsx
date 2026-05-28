"use client";

/**
 * Modal "historial de transacciones" — lista de credit_transactions
 * con filtros + paginación client-side + export a CSV.
 *
 * Trae todas las transacciones de la tool (default 200, limite del
 * endpoint), filtramos en cliente para no spamear queries por cada
 * filtro change.
 */
import { useEffect, useMemo, useState } from "react";

type TxRow = {
  id: string;
  user_id: string;
  tool_id: string;
  type: "allocation" | "consumption" | "refund" | "adjustment";
  amount: number;
  reason: string | null;
  performed_by: string | null;
  created_at: string | null;
  users: { name: string; initials: string } | null;
};

type TransactionsModalProps = Readonly<{
  toolId: string;
  onClose: () => void;
}>;

const PAGE_SIZE = 20;

const DT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
function dt(iso: string | null): string {
  if (!iso) return "—";
  return DT.format(new Date(iso));
}

export function TransactionsModal({ toolId, onClose }: TransactionsModalProps) {
  const [rows, setRows] = useState<TxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [typeFilter, setTypeFilter] = useState<TxRow["type"] | "all">("all");
  const [userFilter, setUserFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/credit-transactions?toolId=${encodeURIComponent(toolId)}&limit=500`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as
          | { transactions: TxRow[] }
          | { error: string; message?: string };
        if (!res.ok || "error" in data) {
          setError(
            "message" in data && data.message
              ? data.message
              : "no se pudieron cargar las transacciones",
          );
          return;
        }
        setRows(data.transactions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "network_error");
      }
    })();
  }, [toolId]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let arr = rows;
    if (typeFilter !== "all") arr = arr.filter((r) => r.type === typeFilter);
    if (userFilter.trim()) {
      const q = userFilter.trim().toLowerCase();
      arr = arr.filter((r) =>
        (r.users?.name ?? "").toLowerCase().includes(q),
      );
    }
    if (fromDate) {
      const from = new Date(fromDate);
      arr = arr.filter(
        (r) => r.created_at && new Date(r.created_at) >= from,
      );
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      arr = arr.filter(
        (r) => r.created_at && new Date(r.created_at) <= to,
      );
    }
    return arr;
  }, [rows, typeFilter, userFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  function exportCsv() {
    const header = [
      "id",
      "fecha",
      "user_id",
      "user_name",
      "tool_id",
      "type",
      "amount",
      "reason",
      "performed_by",
    ];
    const lines = [
      header.join(","),
      ...filtered.map((r) =>
        [
          r.id,
          r.created_at ?? "",
          r.user_id,
          (r.users?.name ?? "").replace(/[",\n]/g, " "),
          r.tool_id,
          r.type,
          r.amount.toString(),
          (r.reason ?? "").replace(/[",\n]/g, " "),
          r.performed_by ?? "",
        ]
          .map((v) => `"${v}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credit-transactions-${toolId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
      onClick={onClose}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={hdStyle}>
          <div className="t-eyebrow">↳ HISTORIAL · {toolId.toUpperCase()}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>
        <h2 id="tx-modal-title" style={titleStyle}>
          Movimientos de créditos
        </h2>

        {/* Filtros */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
            gap: 10,
            alignItems: "end",
            marginTop: 6,
            marginBottom: 14,
          }}
        >
          <Field label="TIPO">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as typeof typeFilter);
                setPage(0);
              }}
              style={selectStyle}
            >
              <option value="all">todos</option>
              <option value="allocation">allocation (+)</option>
              <option value="consumption">consumption (−)</option>
              <option value="refund">refund</option>
              <option value="adjustment">adjustment</option>
            </select>
          </Field>
          <Field label="USUARIO">
            <input
              type="text"
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setPage(0);
              }}
              placeholder="nombre…"
              style={inputStyle}
            />
          </Field>
          <Field label="DESDE">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              style={inputStyle}
            />
          </Field>
          <Field label="HASTA">
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              style={inputStyle}
            />
          </Field>
          <button
            type="button"
            className="btn sm secondary"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="exportar el filtrado a CSV"
          >
            CSV ↓
          </button>
        </div>

        {error && (
          <div className="t-meta" style={{ color: "var(--danger)" }}>
            ↳ {error}
          </div>
        )}

        {rows === null && !error && (
          <div
            className="t-meta dim"
            style={{ padding: "40px 0", textAlign: "center" }}
          >
            cargando…
          </div>
        )}

        {rows !== null && filtered.length === 0 && (
          <div
            className="t-meta dim"
            style={{ padding: "40px 0", textAlign: "center" }}
          >
            ↳ no hay movimientos que coincidan con los filtros
          </div>
        )}

        {rows !== null && filtered.length > 0 && (
          <>
            <div style={tableContainerStyle}>
              <Row head>
                <span>FECHA</span>
                <span>USUARIO</span>
                <span>TIPO</span>
                <span style={{ textAlign: "right" }}>MONTO</span>
                <span>RAZÓN</span>
              </Row>
              {pageRows.map((r) => (
                <Row key={r.id}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                    {dt(r.created_at)}
                  </span>
                  <span>{r.users?.name ?? r.user_id.slice(0, 8) + "…"}</span>
                  <span
                    className="tag"
                    style={{
                      padding: "1px 6px",
                      fontSize: 9,
                      color:
                        r.type === "consumption"
                          ? "var(--danger)"
                          : r.type === "allocation"
                            ? "var(--ok)"
                            : "var(--fg-mute)",
                    }}
                  >
                    {r.type}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color:
                        r.amount > 0 ? "var(--ok)" : "var(--danger)",
                    }}
                  >
                    {r.amount > 0 ? `+${r.amount}` : r.amount}
                  </span>
                  <span
                    className="t-meta dim"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.reason ?? ""}
                  >
                    {r.reason ?? "—"}
                  </span>
                </Row>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
                gap: 10,
              }}
            >
              <div className="t-meta dim">
                {filtered.length} movimientos · página {page + 1}/{totalPages}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn sm secondary"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  ← anterior
                </button>
                <button
                  type="button"
                  className="btn sm secondary"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                >
                  siguiente →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const ROW_COLS = "150px 1.4fr 100px 80px 1.6fr";

function Row({
  head = false,
  children,
}: Readonly<{ head?: boolean; children: React.ReactNode }>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: ROW_COLS,
        gap: 10,
        padding: "10px 12px",
        borderBottom: "1px solid var(--line)",
        fontFamily: head ? "var(--mono)" : "var(--sans)",
        fontSize: head ? 10 : 12,
        letterSpacing: head ? "0.1em" : undefined,
        textTransform: head ? "uppercase" : undefined,
        color: head ? "var(--fg-mute)" : "var(--fg)",
        alignItems: "center",
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label style={{ display: "block" }}>
      <span
        className="t-eyebrow"
        style={{ display: "block", marginBottom: 4, fontSize: 9 }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "grid",
  placeItems: "center",
  zIndex: 1000,
  padding: 16,
};
const cardStyle: React.CSSProperties = {
  background: "var(--bg-elev)",
  border: "1px solid var(--line-strong)",
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 920,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 16px 60px rgba(0,0,0,0.5)",
};
const hdStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--serif)",
  fontStyle: "italic",
  fontSize: 22,
  margin: "8px 0 14px",
  letterSpacing: "-0.01em",
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--fg-mute)",
  cursor: "pointer",
  fontSize: 16,
  padding: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--sans)",
  fontSize: 12,
  padding: "6px 10px",
  outline: "none",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};
const tableContainerStyle: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--bg)",
};
