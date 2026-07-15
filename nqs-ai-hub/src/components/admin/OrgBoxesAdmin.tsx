"use client";

/**
 * CRUD de las cajas de área del organigrama (org_dept_nodes). Vive en
 * /admin/organigrama. Una caja agrupa a los reportes de una persona por
 * department (ej. PEOPLE cuelga de Tincho y junta a los de AD). Campos: nombre,
 * department (de DEPARTMENTS), de quién cuelga, color y orden. Al borrar una
 * caja, los que colgaban se recalculan solos en el layout.
 */
import { useState } from "react";
import { DEPARTMENTS } from "@/lib/constants/departments";
import { showToast } from "@/lib/store/toast";
import type { OrgDeptNode } from "@/lib/db/queries/org";

type PersonOpt = Readonly<{ id: string; name: string }>;

type Props = Readonly<{
  initialBoxes: OrgDeptNode[];
  persons: PersonOpt[];
}>;

const DEFAULT_ACCENT = "#7F77DD";

const emptyDraft = {
  name: "",
  department: "" as string,
  parentPersonId: "" as string,
  accent: DEFAULT_ACCENT,
  sortOrder: "" as string,
};

export function OrgBoxesAdmin({ initialBoxes, persons }: Props) {
  const [boxes, setBoxes] = useState<OrgDeptNode[]>(initialBoxes);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);

  const personName = (id: string | null) =>
    id ? persons.find((p) => p.id === id)?.name ?? "—" : "—";

  function updateBox(id: string, patch: Partial<OrgDeptNode>) {
    setBoxes((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function createBox() {
    if (!draft.name.trim()) {
      showToast({ title: "FALTA EL NOMBRE", msg: "La caja necesita un nombre.", color: "var(--warn)" });
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/organigrama/dept-nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        department: draft.department || null,
        parent_person_id: draft.parentPersonId || null,
        accent: draft.accent || null,
        sort_order: draft.sortOrder === "" ? null : Number(draft.sortOrder),
      }),
    });
    setBusy(false);
    if (res.ok) {
      const { node } = (await res.json()) as { node: OrgDeptNode };
      setBoxes((bs) => [...bs, node]);
      setDraft(emptyDraft);
      showToast({ title: "CAJA CREADA", msg: node.name, color: "var(--ok)" });
    } else {
      const b = (await res.json().catch(() => ({}))) as { message?: string };
      showToast({ title: "NO SE CREÓ", msg: b.message ?? "error", color: "var(--danger)" });
    }
  }

  async function saveBox(box: OrgDeptNode) {
    setBusy(true);
    const res = await fetch(`/api/admin/organigrama/dept-nodes/${box.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: box.name.trim(),
        department: box.department || null,
        parent_person_id: box.parentPersonId || null,
        accent: box.accent || null,
        sort_order: box.sortOrder,
      }),
    });
    setBusy(false);
    if (res.ok) {
      showToast({ title: "CAJA GUARDADA", msg: box.name, color: "var(--ok)" });
    } else {
      const b = (await res.json().catch(() => ({}))) as { message?: string };
      showToast({ title: "NO SE GUARDÓ", msg: b.message ?? "error", color: "var(--danger)" });
    }
  }

  async function deleteBox(box: OrgDeptNode) {
    if (!window.confirm(`¿Borrar la caja "${box.name}"? Los que colgaban se recalculan solos.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/organigrama/dept-nodes/${box.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) {
      setBoxes((bs) => bs.filter((b) => b.id !== box.id));
      showToast({ title: "CAJA BORRADA", msg: box.name, color: "var(--ok)" });
    } else {
      showToast({ title: "NO SE BORRÓ", msg: "error", color: "var(--danger)" });
    }
  }

  return (
    <div className="org-boxes">
      <div className="t-eyebrow" style={{ marginBottom: 4 }}>
        ↳ CAJAS DE ÁREA
      </div>
      <p className="t-meta dim" style={{ marginBottom: 16, fontSize: 11 }}>
        Las cajas (PEOPLE, PRODUCTION, MODELING…) cuelgan de una persona y agrupan
        sus reportes por departamento. Borrar una no rompe nada: sus reportes
        vuelven a colgar directo.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="org-boxes-table">
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Departamento</Th>
              <Th>Cuelga de</Th>
              <Th>Color</Th>
              <Th>Orden</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((b) => (
              <tr key={b.id}>
                <Td>
                  <input
                    type="text"
                    value={b.name}
                    onChange={(e) => updateBox(b.id, { name: e.target.value })}
                    style={inputStyle}
                  />
                </Td>
                <Td>
                  <select
                    value={b.department ?? ""}
                    onChange={(e) => updateBox(b.id, { department: e.target.value || null })}
                    style={inputStyle}
                  >
                    <option value="">— (ninguno)</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td>
                  <select
                    value={b.parentPersonId ?? ""}
                    onChange={(e) =>
                      updateBox(b.id, { parentPersonId: e.target.value || null })
                    }
                    style={inputStyle}
                  >
                    <option value="">— (ninguno)</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td>
                  <input
                    type="color"
                    value={b.accent ?? DEFAULT_ACCENT}
                    onChange={(e) => updateBox(b.id, { accent: e.target.value })}
                    style={colorStyle}
                    aria-label={`color de ${b.name}`}
                  />
                </Td>
                <Td>
                  <input
                    type="number"
                    value={b.sortOrder ?? ""}
                    onChange={(e) =>
                      updateBox(b.id, {
                        sortOrder: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    style={{ ...inputStyle, width: 64 }}
                  />
                </Td>
                <Td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn-sm"
                      disabled={busy}
                      onClick={() => saveBox(b)}
                    >
                      guardar
                    </button>
                    <button
                      type="button"
                      className="btn-sm btn-sm-danger"
                      disabled={busy}
                      onClick={() => deleteBox(b)}
                    >
                      borrar
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {boxes.length === 0 && (
              <tr>
                <td colSpan={6} className="t-meta dim" style={{ padding: 14, fontSize: 12 }}>
                  Todavía no hay cajas de área. Creá una abajo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Nueva caja */}
      <div className="org-boxes-new">
        <div className="t-eyebrow" style={{ marginBottom: 10, fontSize: 9 }}>
          ↳ NUEVA CAJA
        </div>
        <div className="org-boxes-new-row">
          <input
            type="text"
            placeholder="Nombre (ej. PEOPLE)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            style={{ ...inputStyle, minWidth: 160 }}
          />
          <select
            value={draft.department}
            onChange={(e) => setDraft({ ...draft, department: e.target.value })}
            style={inputStyle}
          >
            <option value="">departamento…</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={draft.parentPersonId}
            onChange={(e) => setDraft({ ...draft, parentPersonId: e.target.value })}
            style={inputStyle}
          >
            <option value="">cuelga de…</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="color"
            value={draft.accent}
            onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
            style={colorStyle}
            aria-label="color de la caja nueva"
          />
          <input
            type="number"
            placeholder="orden"
            value={draft.sortOrder}
            onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
            style={{ ...inputStyle, width: 80 }}
          />
          <button type="button" className="btn" disabled={busy} onClick={createBox}>
            + crear caja
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <th
      className="t-eyebrow"
      style={{ fontSize: 9, padding: "0 10px 8px", color: "var(--fg-mute)", textAlign: "left" }}
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
};
const colorStyle: React.CSSProperties = {
  width: 36,
  height: 30,
  padding: 2,
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  background: "var(--bg)",
  cursor: "pointer",
};
