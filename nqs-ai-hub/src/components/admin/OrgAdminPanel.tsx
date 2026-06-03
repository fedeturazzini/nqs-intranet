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
            {rows.map((r) => (
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
                  <input
                    type="number"
                    value={r.orgPosition ?? ""}
                    disabled={!r.isInOrg}
                    onChange={(e) =>
                      update(r.id, {
                        orgPosition: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    style={{ ...inputStyle, width: 64 }}
                  />
                </Td>
              </tr>
            ))}
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
