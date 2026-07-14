"use client";

/**
 * Panel admin del organigrama (S18). Por cada user: toggle is_in_org,
 * "reporta a" (dropdown), rol en org y orden. "Guardar cambios" persiste
 * los users editados (PATCH). Abajo, preview en vivo del árbol.
 */
import { useMemo, useState } from "react";
import { OrgChart } from "@/components/screens/OrgChart";
import { showToast } from "@/lib/store/toast";
import type { OrgNode } from "@/lib/db/queries/org";

type Row = OrgNode & { isInOrg: boolean };

type OrgAdminPanelProps = Readonly<{ initialUsers: Row[] }>;

export function OrgAdminPanel({ initialUsers }: OrgAdminPanelProps) {
  const [rows, setRows] = useState<Row[]>(initialUsers);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    setDirty((prev) => new Set(prev).add(id));
  }

  const inOrgUsers = useMemo(() => rows.filter((r) => r.isInOrg), [rows]);
  const previewNodes: OrgNode[] = inOrgUsers;

  // Orden entre hermanos: agrupamos los in-org por reports_to (null = raíces) y
  // ordenamos con el MISMO criterio que OrgChart (org_position → nombre). De ahí
  // sacamos, por persona, su índice y el tamaño del grupo (para las flechas ↑/↓).
  const orderInfo = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.isInOrg) continue;
      const key = r.reportsToId ?? "__root__";
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    const info = new Map<string, { index: number; size: number }>();
    for (const arr of groups.values()) {
      arr.sort(compareSiblings);
      arr.forEach((r, i) => info.set(r.id, { index: i, size: arr.length }));
    }
    return info;
  }, [rows]);

  // Mueve a `id` un lugar arriba (dir=-1) o abajo (dir=+1) dentro de su grupo de
  // hermanos, normaliza las posiciones del grupo a 1..n y marca dirty los que
  // cambiaron. Recalcula el grupo del estado ACTUAL (no cachea) → si cambió el
  // "reporta a", opera sobre el grupo nuevo.
  function move(id: string, dir: -1 | 1) {
    const me = rows.find((r) => r.id === id);
    if (!me || !me.isInOrg) return;
    const meKey = me.reportsToId ?? null;
    const group = rows
      .filter((r) => r.isInOrg && (r.reportsToId ?? null) === meKey)
      .sort(compareSiblings);
    const idx = group.findIndex((r) => r.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= group.length) return;

    const reordered = [...group];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];

    // Normalizar a 1..n; juntar los que REALMENTE cambian de posición.
    const newPos = new Map<string, number>();
    reordered.forEach((r, i) => {
      const pos = i + 1;
      if (r.orgPosition !== pos) newPos.set(r.id, pos);
    });
    if (newPos.size === 0) return;

    setRows((prev) =>
      prev.map((r) =>
        newPos.has(r.id) ? { ...r, orgPosition: newPos.get(r.id)! } : r,
      ),
    );
    setDirty((prev) => {
      const next = new Set(prev);
      for (const rid of newPos.keys()) next.add(rid);
      return next;
    });
  }

  async function saveAll() {
    if (dirty.size === 0) return;
    setSaving(true);
    let okCount = 0;
    let failMsg: string | null = null;
    for (const id of dirty) {
      const r = rows.find((x) => x.id === id);
      if (!r) continue;
      const res = await fetch(`/api/admin/users/${id}/org`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          is_in_org: r.isInOrg,
          reports_to_id: r.reportsToId,
          org_role: r.orgRole || null,
          org_position: r.orgPosition,
        }),
      });
      if (res.ok) {
        okCount++;
      } else {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        failMsg = b.message ?? "error al guardar";
      }
    }
    setSaving(false);
    if (failMsg) {
      showToast({ title: "ALGUNOS NO SE GUARDARON", msg: failMsg, color: "var(--danger)" });
    } else {
      showToast({
        title: "ORGANIGRAMA GUARDADO",
        msg: `${okCount} cambio(s) aplicados.`,
        color: "var(--ok)",
      });
      setDirty(new Set());
    }
  }

  return (
    <div className="page" style={{ padding: 32 }}>
      <div
        className="page-hd"
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>
            ↳ ADMIN · ORGANIGRAMA
          </div>
          <h1 className="page-title" style={{ fontSize: 28, margin: 0 }}>
            Estructura del <em>estudio</em>
          </h1>
        </div>
        <button
          type="button"
          className="btn"
          onClick={saveAll}
          disabled={saving || dirty.size === 0}
        >
          {saving ? "guardando…" : `guardar cambios${dirty.size ? ` (${dirty.size})` : ""}`}
        </button>
      </div>

      {/* Tabla de edición */}
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <Th>En org</Th>
              <Th>Usuario</Th>
              <Th>Reporta a</Th>
              <Th>Rol en organigrama</Th>
              <Th>Orden</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const oi = orderInfo.get(r.id);
              const isFirst = !oi || oi.index === 0;
              const isLast = !oi || oi.index === oi.size - 1;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={r.isInOrg}
                      onChange={(e) =>
                        update(r.id, {
                          isInOrg: e.target.checked,
                          // si sale del org, limpiamos su jefe
                          reportsToId: e.target.checked ? r.reportsToId : null,
                        })
                      }
                    />
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="t-meta dim" style={{ fontSize: 10 }}>
                      {r.dept ?? "—"}
                    </div>
                  </Td>
                  <Td>
                    <select
                      value={r.reportsToId ?? ""}
                      disabled={!r.isInOrg}
                      onChange={(e) =>
                        update(r.id, { reportsToId: e.target.value || null })
                      }
                      style={selectStyle}
                    >
                      <option value="">— (raíz)</option>
                      {inOrgUsers
                        .filter((u) => u.id !== r.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </Td>
                  <Td>
                    <input
                      type="text"
                      value={r.orgRole ?? ""}
                      disabled={!r.isInOrg}
                      onChange={(e) => update(r.id, { orgRole: e.target.value })}
                      placeholder="Head of Design"
                      style={inputStyle}
                    />
                  </Td>
                  <Td>
                    {/* Orden entre hermanos: flechas ↑/↓ (reemplaza el input
                        número). Deshabilitadas en los bordes del grupo. */}
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <button
                        type="button"
                        onClick={() => move(r.id, -1)}
                        disabled={!r.isInOrg || isFirst}
                        title="Subir"
                        aria-label="Subir"
                        style={arrowBtnStyle(!r.isInOrg || isFirst)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(r.id, 1)}
                        disabled={!r.isInOrg || isLast}
                        title="Bajar"
                        aria-label="Bajar"
                        style={arrowBtnStyle(!r.isInOrg || isLast)}
                      >
                        ↓
                      </button>
                      {r.isInOrg && oi && (
                        <span
                          className="t-meta dim"
                          style={{ fontSize: 10, marginLeft: 2 }}
                        >
                          {oi.index + 1}/{oi.size}
                        </span>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <div className="t-eyebrow" style={{ marginTop: 28, marginBottom: 4 }}>
        ↳ PREVIEW
      </div>
      <p className="t-meta dim" style={{ marginBottom: 12, fontSize: 11 }}>
        Cómo se va a ver (en vivo, antes de guardar).
      </p>
      <OrgChart nodes={previewNodes} />
    </div>
  );
}

function Th({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <th
      className="t-eyebrow"
      style={{ fontSize: 9, padding: "0 10px 8px", color: "var(--fg-mute)" }}
    >
      {children}
    </th>
  );
}
function Td({ children }: Readonly<{ children: React.ReactNode }>) {
  return <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>{children}</td>;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--sans)",
  fontSize: 12,
  padding: "6px 8px",
  outline: "none",
  width: "100%",
};
const selectStyle: React.CSSProperties = { ...inputStyle };

/** Mismo criterio de orden que OrgChart: org_position ?? 9999 → nombre. */
function compareSiblings(a: Row, b: Row): number {
  const pa = a.orgPosition ?? 9999;
  const pb = b.orgPosition ?? 9999;
  if (pa !== pb) return pa - pb;
  return a.name.localeCompare(b.name, "es");
}

function arrowBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "var(--bg)",
    border: "1px solid var(--line-strong)",
    borderRadius: 6,
    color: "var(--fg)",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
    lineHeight: 1,
    padding: "5px 9px",
    opacity: disabled ? 0.35 : 1,
  };
}
