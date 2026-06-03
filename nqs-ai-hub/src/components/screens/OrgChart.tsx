"use client";

/**
 * Organigrama dinámico (S18). Arma el árbol desde `reports_to_id` y lo
 * renderiza centrado con conectores (CSS `.org-tree`). Click en un nodo →
 * panel lateral read-only con su detalle. Estética alineada al diseño del
 * cliente (card con barra de accent + nombre + rol + dept).
 */
import { useMemo, useState } from "react";
import type { OrgNode } from "@/lib/db/queries/org";

type OrgChartProps = Readonly<{ nodes: OrgNode[] }>;

// Paleta de accents por departamento (inspirada en la leyenda del cliente).
const PALETTE = [
  "#E8873C",
  "#1D9E75",
  "#D4537E",
  "#7F77DD",
  "#5BB8D4",
  "#378ADD",
  "#3B94E0",
  "#0D3D78",
  "#888780",
  "#D85A30",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function OrgChart({ nodes }: OrgChartProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  // Color por dept (estable). Sin dept → gris.
  const accentOf = useMemo(() => {
    const cache = new Map<string, string>();
    return (n: OrgNode) => {
      const key = n.dept ?? "—";
      if (!cache.has(key)) {
        cache.set(key, PALETTE[hashStr(key) % PALETTE.length]);
      }
      return cache.get(key)!;
    };
  }, []);

  const childrenMap = useMemo(() => {
    const m = new Map<string, OrgNode[]>();
    for (const n of nodes) {
      // Un nodo es raíz si no reporta a nadie, o reporta a alguien que no
      // está en el org (defensivo).
      const parentId =
        n.reportsToId && byId.has(n.reportsToId) ? n.reportsToId : null;
      if (parentId) {
        const arr = m.get(parentId) ?? [];
        arr.push(n);
        m.set(parentId, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const pa = a.orgPosition ?? 9999;
        const pb = b.orgPosition ?? 9999;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name, "es");
      });
    }
    return m;
  }, [nodes, byId]);

  const roots = useMemo(() => {
    return nodes
      .filter((n) => !(n.reportsToId && byId.has(n.reportsToId)))
      .sort((a, b) => {
        const pa = a.orgPosition ?? 9999;
        const pb = b.orgPosition ?? 9999;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name, "es");
      });
  }, [nodes, byId]);

  const depts = useMemo(() => {
    const set = new Map<string, string>();
    for (const n of nodes) {
      const key = n.dept ?? "—";
      if (!set.has(key)) set.set(key, accentOf(n));
    }
    return [...set.entries()];
  }, [nodes, accentOf]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selChildren = selected ? childrenMap.get(selected.id) ?? [] : [];
  const selBoss =
    selected?.reportsToId ? byId.get(selected.reportsToId) ?? null : null;

  function renderNode(n: OrgNode) {
    const kids = childrenMap.get(n.id) ?? [];
    const accent = accentOf(n);
    return (
      <li key={n.id}>
        <div
          className="org-card"
          onClick={() => setSelectedId(n.id)}
          role="button"
          tabIndex={0}
        >
          <div className="org-card-bar" style={{ background: accent }} />
          <div className="org-card-body">
            <div className="org-card-name">{n.name}</div>
            {n.orgRole && <div className="org-card-role">{n.orgRole}</div>}
            {n.dept && <div className="org-card-dept">{n.dept}</div>}
          </div>
        </div>
        {kids.length > 0 && <ul>{kids.map(renderNode)}</ul>}
      </li>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="t-meta dim" style={{ padding: "60px 0", textAlign: "center" }}>
        ↳ el organigrama todavía está vacío. El admin lo arma desde{" "}
        <em>/admin/organigrama</em>.
      </div>
    );
  }

  return (
    <>
      <div className="org-tree-scroll">
        <div className="org-tree">
          <ul>{roots.map(renderNode)}</ul>
        </div>
      </div>

      {/* Leyenda de departamentos */}
      {depts.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
          }}
        >
          {depts.map(([dept, color]) => (
            <div
              key={dept}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span
                style={{ width: 10, height: 10, borderRadius: 2, background: color }}
              />
              <span className="t-meta dim" style={{ fontSize: 11 }}>
                {dept}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Panel detalle */}
      {selected && (
        <div
          onClick={() => setSelectedId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 460,
              maxWidth: "95vw",
              height: "100%",
              background: "var(--bg)",
              borderLeft: "1px solid var(--line-strong)",
              padding: "32px 36px",
              overflowY: "auto",
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="cerrar"
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                background: "transparent",
                border: 0,
                color: "var(--fg-mute)",
                fontSize: 26,
                cursor: "pointer",
              }}
            >
              ×
            </button>
            <div
              className="t-eyebrow"
              style={{ color: accentOf(selected), marginBottom: 12 }}
            >
              ↳ PERSONA
            </div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 40,
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {selected.name}
            </div>
            {selected.orgRole && (
              <div style={{ fontSize: 14, color: "var(--fg-mute)" }}>
                {selected.orgRole}
              </div>
            )}
            <div
              style={{
                height: 3,
                width: 60,
                background: accentOf(selected),
                margin: "14px 0",
              }}
            />

            <DetailRow label="DEPARTAMENTO" value={selected.dept ?? "—"} />
            <DetailRow
              label="REPORTA A"
              value={selBoss ? selBoss.name : "— (raíz)"}
            />

            {selChildren.length > 0 && (
              <>
                <div className="t-eyebrow" style={{ marginTop: 22, marginBottom: 10 }}>
                  ↳ REPORTES DIRECTOS ({selChildren.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selChildren.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "transparent",
                        border: 0,
                        padding: "6px 4px",
                        cursor: "pointer",
                        color: "var(--fg)",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: accentOf(c),
                        }}
                      />
                      <span style={{ fontSize: 13 }}>{c.name}</span>
                      {c.orgRole && (
                        <span className="t-meta dim" style={{ fontSize: 11 }}>
                          · {c.orgRole}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}
