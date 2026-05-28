"use client";

/**
 * Barra de filtros para los logs del admin.
 *
 * UX:
 *   - DateRange (since / until)
 *   - User picker (single)
 *   - Tool picker (single)
 *   - Action prefix (solo visible en tab "usage")
 *   - Tipo de tx (solo visible en tab "transactions")
 *
 * Sincroniza con URL search params. El bot "Aplicar" no hace falta —
 * cualquier cambio dispara `onChange` que el `LogsBoard` propaga a
 * fetch + URL.
 *
 * Default si no hay filtros: últimos 7 días.
 */
import { useEffect, useState } from "react";

export type LogFilters = {
  since?: string; // ISO datetime
  until?: string;
  userId?: string;
  toolId?: string;
  action?: string; // prefix
  txType?: "allocation" | "consumption" | "refund" | "adjustment";
};

export type FilterUser = { id: string; name: string; initials: string };
export type FilterTool = { id: string; name: string };

type LogsFiltersProps = Readonly<{
  filters: LogFilters;
  onChange: (next: LogFilters) => void;
  users: FilterUser[];
  tools: FilterTool[];
  /** Qué campos mostrar según la tab actual. */
  showAction?: boolean;
  showTxType?: boolean;
}>;

// Helpers para `<input type="date">` (HTML quiere YYYY-MM-DD).
function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}
function dateInputToIso(d: string, endOfDay = false): string | undefined {
  if (!d) return undefined;
  const t = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return `${d}${t}`;
}

export function LogsFilters({
  filters,
  onChange,
  users,
  tools,
  showAction = false,
  showTxType = false,
}: LogsFiltersProps) {
  // Estado local controlado, así el usuario puede tipear en "action"
  // sin que cada keystroke trigueree un fetch. Se aplica al blur o
  // a los 600ms de inactividad.
  const [actionLocal, setActionLocal] = useState(filters.action ?? "");

  useEffect(() => {
    setActionLocal(filters.action ?? "");
  }, [filters.action]);

  useEffect(() => {
    if (actionLocal === (filters.action ?? "")) return;
    const t = setTimeout(() => {
      onChange({ ...filters, action: actionLocal.trim() || undefined });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionLocal]);

  const hasAny =
    filters.since ||
    filters.until ||
    filters.userId ||
    filters.toolId ||
    filters.action ||
    filters.txType;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          showAction || showTxType
            ? "repeat(auto-fit, minmax(140px, 1fr))"
            : "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 10,
        alignItems: "end",
        marginTop: 14,
        marginBottom: 4,
      }}
    >
      <Field label="DESDE">
        <input
          type="date"
          value={isoToDateInput(filters.since)}
          onChange={(e) =>
            onChange({ ...filters, since: dateInputToIso(e.target.value) })
          }
          style={inputStyle}
        />
      </Field>
      <Field label="HASTA">
        <input
          type="date"
          value={isoToDateInput(filters.until)}
          onChange={(e) =>
            onChange({
              ...filters,
              until: dateInputToIso(e.target.value, true),
            })
          }
          style={inputStyle}
        />
      </Field>
      <Field label="USUARIO">
        <select
          value={filters.userId ?? ""}
          onChange={(e) =>
            onChange({ ...filters, userId: e.target.value || undefined })
          }
          style={selectStyle}
        >
          <option value="">todos</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="TOOL">
        <select
          value={filters.toolId ?? ""}
          onChange={(e) =>
            onChange({ ...filters, toolId: e.target.value || undefined })
          }
          style={selectStyle}
        >
          <option value="">todas</option>
          {tools.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      {showAction && (
        <Field label="ACTION (prefijo)">
          <input
            type="text"
            value={actionLocal}
            onChange={(e) => setActionLocal(e.target.value)}
            placeholder="ej: claude. · admin."
            style={inputStyle}
          />
        </Field>
      )}
      {showTxType && (
        <Field label="TIPO TX">
          <select
            value={filters.txType ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                txType: (e.target.value as LogFilters["txType"]) || undefined,
              })
            }
            style={selectStyle}
          >
            <option value="">todos</option>
            <option value="allocation">allocation</option>
            <option value="consumption">consumption</option>
            <option value="refund">refund</option>
            <option value="adjustment">adjustment</option>
          </select>
        </Field>
      )}

      <div style={{ display: "flex", alignItems: "end", gap: 6 }}>
        <button
          type="button"
          className="btn sm secondary"
          onClick={() => onChange({})}
          disabled={!hasAny}
          title="limpiar filtros"
          style={{ width: "100%" }}
        >
          limpiar
        </button>
      </div>
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--mono)",
  fontSize: 11,
  padding: "6px 10px",
  outline: "none",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};
