"use client";

/**
 * Tablero de logs con 3 pestañas + filtros sincronizados con URL.
 *
 * Filtros (compartidos entre tabs):
 *   - dateRange (since / until)
 *   - userId
 *   - toolId
 *   - action prefix (solo en tab "usage")
 *   - txType (solo en tab "transactions")
 *
 * URL state: `?tab=usage&userId=...&since=2026-05-01T00:00:00Z` etc.
 * Refrescar mantiene los filtros + se puede compartir el link.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LogsFilters,
  type FilterTool,
  type FilterUser,
  type LogFilters,
} from "./LogsFilters";

type Tab = "usage" | "sessions" | "transactions";

type UsageRow = {
  id: string;
  user_id: string;
  tool_id: string | null;
  action: string;
  metadata: unknown;
  tokens_consumed: number | null;
  credits_consumed: number | null;
  created_at: string | null;
  users: { name: string; initials: string } | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  tool_id: string;
  entered_at: string;
  exited_at: string | null;
  declared_consumption: number | null;
  ip_address: string | null;
  users: { name: string; email: string } | null;
};

type TxRow = {
  id: string;
  user_id: string;
  tool_id: string;
  type: "allocation" | "consumption" | "refund" | "adjustment";
  amount: number;
  reason: string | null;
  created_at: string | null;
  users: { name: string; initials: string } | null;
};

const DT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
function dt(iso: string | null): string {
  if (!iso) return "—";
  return DT.format(new Date(iso));
}

type LogsBoardProps = Readonly<{
  users: FilterUser[];
  tools: FilterTool[];
}>;

export function LogsBoard({ users, tools }: LogsBoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── State derivado de la URL ───
  const tab = useMemo<Tab>(() => {
    const t = searchParams.get("tab");
    if (t === "sessions" || t === "transactions") return t;
    return "usage";
  }, [searchParams]);

  const filters = useMemo<LogFilters>(
    () => ({
      since: searchParams.get("since") ?? undefined,
      until: searchParams.get("until") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
      toolId: searchParams.get("toolId") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      txType:
        (searchParams.get("txType") as LogFilters["txType"]) ?? undefined,
    }),
    [searchParams],
  );

  // ─── Data cache por tab (resetea al cambiar filtros) ───
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [txs, setTxs] = useState<TxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza tab + filtros con la URL (`replace`, no `push`, para no
  // saturar la pila de history).
  const updateUrl = useCallback(
    (next: { tab?: Tab; filters?: LogFilters }) => {
      const p = new URLSearchParams();
      const t = next.tab ?? tab;
      if (t !== "usage") p.set("tab", t);
      const f = next.filters ?? filters;
      if (f.since) p.set("since", f.since);
      if (f.until) p.set("until", f.until);
      if (f.userId) p.set("userId", f.userId);
      if (f.toolId) p.set("toolId", f.toolId);
      if (f.action) p.set("action", f.action);
      if (f.txType) p.set("txType", f.txType);
      const qs = p.toString();
      router.replace(qs ? `/admin/logs?${qs}` : "/admin/logs", {
        scroll: false,
      });
    },
    [filters, tab, router],
  );

  const setTab = useCallback(
    (t: Tab) => updateUrl({ tab: t }),
    [updateUrl],
  );
  const setFilters = useCallback(
    (next: LogFilters) => updateUrl({ filters: next }),
    [updateUrl],
  );

  // Si los filtros cambian, invalidamos cualquier cache previo.
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  const fetchUsage = useCallback(async () => {
    const p = new URLSearchParams({ limit: "100" });
    if (filters.userId) p.set("userId", filters.userId);
    if (filters.toolId) p.set("toolId", filters.toolId);
    if (filters.action) p.set("action", filters.action);
    if (filters.since) p.set("since", filters.since);
    if (filters.until) p.set("until", filters.until);
    try {
      const res = await fetch(`/api/admin/logs?${p.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { logs?: UsageRow[]; error?: string };
      if (data.logs) setUsage(data.logs);
      else setError(data.error ?? "fetch_failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    }
  }, [filters]);

  const fetchSessions = useCallback(async () => {
    const p = new URLSearchParams({ limit: "100" });
    if (filters.userId) p.set("userId", filters.userId);
    if (filters.toolId) p.set("toolId", filters.toolId);
    // El endpoint module-sessions usa `from`/`to` en vez de `since`/`until`.
    if (filters.since) p.set("from", filters.since);
    if (filters.until) p.set("to", filters.until);
    try {
      const res = await fetch(`/api/admin/module-sessions?${p.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        sessions?: SessionRow[];
        error?: string;
      };
      if (data.sessions) setSessions(data.sessions);
      else setError(data.error ?? "fetch_failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    }
  }, [filters]);

  const fetchTxs = useCallback(async () => {
    const p = new URLSearchParams({ limit: "100" });
    if (filters.userId) p.set("userId", filters.userId);
    if (filters.toolId) p.set("toolId", filters.toolId);
    if (filters.txType) p.set("type", filters.txType);
    try {
      const res = await fetch(
        `/api/admin/credit-transactions?${p.toString()}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        transactions?: TxRow[];
        error?: string;
      };
      if (data.transactions) setTxs(data.transactions);
      else setError(data.error ?? "fetch_failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    }
  }, [filters]);

  // Invalidate cache cuando cambian filtros.
  useEffect(() => {
    setUsage(null);
    setSessions(null);
    setTxs(null);
    setError(null);
  }, [filtersKey]);

  // Fetch on demand: solo el tab actual.
  useEffect(() => {
    if (tab === "usage" && usage === null) void fetchUsage();
    if (tab === "sessions" && sessions === null) void fetchSessions();
    if (tab === "transactions" && txs === null) void fetchTxs();
  }, [tab, usage, sessions, txs, fetchUsage, fetchSessions, fetchTxs]);

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <TabBtn
          label="usage logs"
          active={tab === "usage"}
          onClick={() => setTab("usage")}
        />
        <TabBtn
          label="module sessions"
          active={tab === "sessions"}
          onClick={() => setTab("sessions")}
        />
        <TabBtn
          label="credit transactions"
          active={tab === "transactions"}
          onClick={() => setTab("transactions")}
        />
      </div>

      <LogsFilters
        filters={filters}
        onChange={setFilters}
        users={users}
        tools={tools}
        showAction={tab === "usage"}
        showTxType={tab === "transactions"}
      />

      {error && (
        <div
          className="t-meta"
          style={{ color: "var(--danger)", marginTop: 16 }}
        >
          ↳ error: {error}
        </div>
      )}

      {tab === "usage" && (
        <Table
          loading={usage === null}
          rows={usage ?? []}
          columns={[
            { label: "TIMESTAMP", get: (r) => dt(r.created_at), width: "130px" },
            {
              label: "USER",
              get: (r) => r.users?.name ?? r.user_id.slice(0, 8) + "…",
            },
            { label: "TOOL", get: (r) => r.tool_id ?? "—", width: "100px" },
            { label: "ACTION", get: (r) => r.action },
            {
              label: "TOKENS",
              get: (r) => r.tokens_consumed?.toString() ?? "—",
              width: "70px",
              align: "right",
            },
            {
              label: "CRED",
              get: (r) => r.credits_consumed?.toString() ?? "—",
              width: "60px",
              align: "right",
            },
          ]}
          emptyMsg="↳ no hay usage logs"
        />
      )}

      {tab === "sessions" && (
        <Table
          loading={sessions === null}
          rows={sessions ?? []}
          columns={[
            { label: "ENTRÓ", get: (r) => dt(r.entered_at), width: "130px" },
            { label: "SALIÓ", get: (r) => dt(r.exited_at), width: "130px" },
            {
              label: "USER",
              get: (r) => r.users?.name ?? r.user_id.slice(0, 8) + "…",
            },
            { label: "TOOL", get: (r) => r.tool_id, width: "80px" },
            {
              label: "DECLARÓ",
              get: (r) => `${r.declared_consumption ?? 0}`,
              width: "80px",
              align: "right",
            },
            {
              label: "IP",
              get: (r) => r.ip_address ?? "—",
              width: "120px",
            },
          ]}
          emptyMsg="↳ no hay sesiones registradas"
        />
      )}

      {tab === "transactions" && (
        <Table
          loading={txs === null}
          rows={txs ?? []}
          columns={[
            { label: "TIMESTAMP", get: (r) => dt(r.created_at), width: "130px" },
            {
              label: "USER",
              get: (r) => r.users?.name ?? r.user_id.slice(0, 8) + "…",
            },
            { label: "TOOL", get: (r) => r.tool_id, width: "80px" },
            { label: "TIPO", get: (r) => r.type, width: "110px" },
            {
              label: "MONTO",
              get: (r) => (r.amount > 0 ? `+${r.amount}` : `${r.amount}`),
              width: "80px",
              align: "right",
            },
            { label: "RAZÓN", get: (r) => r.reason ?? "—" },
          ]}
          emptyMsg="↳ no hay transactions"
        />
      )}
    </>
  );
}

type Column<T> = {
  label: string;
  get: (row: T) => string;
  width?: string;
  align?: "left" | "right" | "center";
};

function Table<T>({
  loading,
  rows,
  columns,
  emptyMsg,
}: Readonly<{
  loading: boolean;
  rows: T[];
  columns: Column<T>[];
  emptyMsg: string;
}>) {
  const gridTemplate = columns.map((c) => c.width ?? "1fr").join(" ");

  if (loading) {
    return (
      <div
        className="t-meta dim"
        style={{ padding: "40px 0", textAlign: "center" }}
      >
        cargando…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        className="t-meta dim"
        style={{ padding: "40px 0", textAlign: "center" }}
      >
        {emptyMsg}
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid var(--line)",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--bg-elev)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridTemplate,
          gap: 12,
          padding: "10px 14px",
          borderBottom: "1px solid var(--line)",
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fg-mute)",
        }}
      >
        {columns.map((c) => (
          <div key={c.label} style={{ textAlign: c.align ?? "left" }}>
            {c.label}
          </div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            gap: 12,
            padding: "10px 14px",
            borderTop: "1px solid var(--line)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            alignItems: "center",
          }}
        >
          {columns.map((c) => (
            <div
              key={c.label}
              style={{
                textAlign: c.align ?? "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.get(r)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: Readonly<{ label: string; active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        background: "transparent",
        border: 0,
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: active ? "var(--fg)" : "var(--fg-mute)",
        cursor: "pointer",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}
