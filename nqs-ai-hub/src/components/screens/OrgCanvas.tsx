"use client";

/**
 * Canvas del organigrama híbrido. Etapa 2: render + zoom/paneo/buscador/leyenda
 * (read-only). Etapa 3: modo edición admin — arrastrar nodos para FIJAR su
 * posición (override org_x/org_y), resetear al automático, y reacomodar todo.
 *
 * El componente tiene los datos crudos (personas + cajas) y calcula el layout
 * en el cliente con el MISMO motor que el server (`computeOrgLayout`). Así una
 * edición (fijar/resetear posición) se ve al instante: se muta org_x/org_y en
 * el estado local y el layout se recalcula (posición = override ?? auto). El
 * guardado es optimista contra el endpoint admin; si falla, revierte y avisa.
 *
 * CLAVE del híbrido: el override es la EXCEPCIÓN. Por default todo es
 * automático (org_x/org_y = null); mover un nodo fija SOLO ese; siempre se
 * puede volver al automático. Por eso agregar gente nueva no es trabajo manual.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { computeOrgLayout, type OrgLayoutNode } from "@/lib/org/layout";
import type { OrgPerson, OrgDeptNode } from "@/lib/db/queries/org";
import { showToast } from "@/lib/store/toast";

const VIEW_H = 600; // alto visible del viewport pan/zoom
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const SNAP = 5; // grilla de snap al fijar posición (px del canvas)

type NodeType = "person" | "dept";

type OrgCanvasProps = Readonly<{
  persons: OrgPerson[];
  deptNodes: OrgDeptNode[];
  isAdmin: boolean;
}>;

/** Estilo con la custom property --accent (para barra/tinte por dato). */
function accentStyle(base: CSSProperties, accent: string): CSSProperties {
  return { ...base, ["--accent" as string]: accent } as CSSProperties;
}

export function OrgCanvas({
  persons: initialPersons,
  deptNodes: initialDeptNodes,
  isAdmin,
}: OrgCanvasProps) {
  // Datos locales (para edición optimista). El layout se recalcula de acá. Se
  // siembran de los props una vez; cada navegación re-monta con datos frescos.
  const [persons, setPersons] = useState(initialPersons);
  const [deptNodes, setDeptNodes] = useState(initialDeptNodes);

  const layout = useMemo(
    () => computeOrgLayout(persons, deptNodes),
    [persons, deptNodes],
  );

  const CANVAS_W = Math.max(layout.width, 1);
  const CANVAS_H = Math.max(layout.height, 1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Nodo que se está arrastrando (preview mientras sigue al cursor).
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const panRef = useRef(pan);
  panRef.current = pan;

  const byId = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout.nodes],
  );

  // parent → [hijos] (para el panel de detalle). Derivado de los edges.
  const childrenMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of layout.edges) {
      const arr = m.get(e.from) ?? [];
      arr.push(e.to);
      m.set(e.from, arr);
    }
    return m;
  }, [layout.edges]);

  const fitScale = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return 1;
    return Math.min(1, el.clientWidth / CANVAS_W);
  }, [CANVAS_W]);

  const resetView = useCallback(() => {
    const el = wrapRef.current;
    const s = fitScale();
    const cw = el?.clientWidth ?? CANVAS_W;
    setScale(s);
    setPan({ x: Math.max(0, (cw - CANVAS_W * s) / 2), y: 20 });
  }, [fitScale, CANVAS_W]);

  useEffect(() => {
    resetView();
    const onResize = () => setScale(fitScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resetView, fitScale]);

  // Zoom con rueda — listener NATIVO (passive:false) para poder preventDefault.
  // Sin ctrl/cmd no tocamos nada → la página scrollea normal.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const s = scaleRef.current;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor));
      const k = newScale / s;
      const p = panRef.current;
      setPan({ x: mx - k * (mx - p.x), y: my - k * (my - p.y) });
      setScale(newScale);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Paneo: sólo arrastrando el fondo (o botón del medio), nunca los nodos.
  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isMiddle = e.button === 1;
    const isBackground =
      target === e.currentTarget ||
      target.classList.contains("org-canvas") ||
      target.classList.contains("org-pan-bg");
    if (!isMiddle && !isBackground) return;
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPan({
        x: dragRef.current.panX + (e.clientX - dragRef.current.x),
        y: dragRef.current.panY + (e.clientY - dragRef.current.y),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s * 1.2));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s / 1.2));

  const centerOn = useCallback((node: OrgLayoutNode) => {
    const el = wrapRef.current;
    if (!el) return;
    const s = scaleRef.current;
    setPan({
      x: el.clientWidth / 2 - s * (node.x + node.w / 2),
      y: VIEW_H / 2 - s * (node.y + node.h / 2),
    });
  }, []);

  // ── Edición de posición (admin) ──────────────────────────────────────────

  /** Muta el override local (recalcula el layout al instante). */
  const applyPos = useCallback(
    (type: NodeType, id: string, x: number | null, y: number | null) => {
      if (type === "person") {
        setPersons((ps) =>
          ps.map((p) => (p.id === id ? { ...p, orgX: x, orgY: y } : p)),
        );
      } else {
        setDeptNodes((ds) =>
          ds.map((d) => (d.id === id ? { ...d, orgX: x, orgY: y } : d)),
        );
      }
    },
    [],
  );

  const currentOverride = useCallback(
    (type: NodeType, id: string): { x: number | null; y: number | null } => {
      if (type === "person") {
        const p = persons.find((p) => p.id === id);
        return { x: p?.orgX ?? null, y: p?.orgY ?? null };
      }
      const d = deptNodes.find((d) => d.id === id);
      return { x: d?.orgX ?? null, y: d?.orgY ?? null };
    },
    [persons, deptNodes],
  );

  /** Persiste la posición; si falla, revierte al valor previo y avisa. */
  const persistPos = useCallback(
    async (
      type: NodeType,
      id: string,
      x: number | null,
      y: number | null,
      prevX: number | null,
      prevY: number | null,
    ) => {
      try {
        const res = await fetch("/api/admin/organigrama/position", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, id, x, y }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        applyPos(type, id, prevX, prevY); // revert
        showToast({
          title: "NO SE GUARDÓ",
          msg: "No se pudo guardar la posición. Se revirtió.",
          color: "var(--danger)",
        });
      }
    },
    [applyPos],
  );

  /** Fija la posición de un nodo (optimista) y persiste. */
  const fixPosition = useCallback(
    (type: NodeType, id: string, x: number, y: number) => {
      const prev = currentOverride(type, id);
      applyPos(type, id, x, y);
      void persistPos(type, id, x, y, prev.x, prev.y);
    },
    [applyPos, persistPos, currentOverride],
  );

  /** Resetea un nodo al automático (org_x/org_y = null). */
  const resetPosition = useCallback(
    (type: NodeType, id: string) => {
      const prev = currentOverride(type, id);
      applyPos(type, id, null, null);
      void persistPos(type, id, null, null, prev.x, prev.y);
    },
    [applyPos, persistPos, currentOverride],
  );

  /** Reacomodar todo: borra TODOS los overrides. Con confirmación. */
  const reacomodarTodo = useCallback(async () => {
    setConfirmReset(false);
    const snapPersons = persons;
    const snapDept = deptNodes;
    setPersons((ps) => ps.map((p) => ({ ...p, orgX: null, orgY: null })));
    setDeptNodes((ds) => ds.map((d) => ({ ...d, orgX: null, orgY: null })));
    try {
      const res = await fetch("/api/admin/organigrama/reset-all", {
        method: "POST",
      });
      if (!res.ok) throw new Error(String(res.status));
      showToast({
        title: "ORGANIGRAMA REACOMODADO",
        msg: "Todas las posiciones volvieron al automático.",
        color: "var(--ok)",
      });
    } catch {
      setPersons(snapPersons);
      setDeptNodes(snapDept);
      showToast({
        title: "NO SE PUDO REACOMODAR",
        msg: "Se revirtió el cambio.",
        color: "var(--danger)",
      });
    }
  }, [persons, deptNodes]);

  // Arranca el drag de un NODO en modo edición. Distingue click (sin mover →
  // selecciona) de arrastre (fija posición). El delta se divide por scale para
  // que el nodo siga al cursor con cualquier zoom.
  const startNodeDrag = useCallback(
    (e: React.MouseEvent, node: OrgLayoutNode) => {
      if (!editMode) return;
      e.stopPropagation(); // no disparar el paneo del fondo
      e.preventDefault();
      const startMX = e.clientX;
      const startMY = e.clientY;
      const startX = node.x;
      const startY = node.y;
      let moved = false;

      const onMove = (ev: MouseEvent) => {
        const s = scaleRef.current;
        const dx = (ev.clientX - startMX) / s;
        const dy = (ev.clientY - startMY) / s;
        if (Math.abs(ev.clientX - startMX) > 3 || Math.abs(ev.clientY - startMY) > 3) {
          moved = true;
        }
        setDragPreview({ id: node.id, x: startX + dx, y: startY + dy });
      };
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setDragPreview(null);
        if (moved) {
          const s = scaleRef.current;
          const nx = Math.round((startX + (ev.clientX - startMX) / s) / SNAP) * SNAP;
          const ny = Math.round((startY + (ev.clientY - startMY) / s) / SNAP) * SNAP;
          fixPosition(node.type, node.id, nx, ny);
        } else {
          setSelectedId(node.id); // fue un click
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [editMode, fixPosition],
  );

  // ── Derivados de render ──────────────────────────────────────────────────

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  // Nodos a dibujar: aplica el preview del drag al nodo que se está moviendo.
  const displayNodes = useMemo(() => {
    if (!dragPreview) return layout.nodes;
    return layout.nodes.map((n) =>
      n.id === dragPreview.id ? { ...n, x: dragPreview.x, y: dragPreview.y } : n,
    );
  }, [layout.nodes, dragPreview]);

  const searchIndex = useMemo(
    () =>
      layout.nodes
        .filter((n) => n.type === "person")
        .map((n) => ({ id: n.id, name: n.name, role: n.role ?? "", accent: n.accent })),
    [layout.nodes],
  );
  const matches = search.trim()
    ? searchIndex
        .filter((p) => {
          const q = search.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  function pickResult(id: string) {
    const node = byId.get(id);
    setSelectedId(id);
    setSearch("");
    setShowSearch(false);
    if (node) centerOn(node);
  }

  const legend = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of layout.nodes) {
      const label = n.type === "dept" ? n.name : n.dept;
      if (!label) continue;
      if (!m.has(label)) m.set(label, n.accent);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [layout.nodes]);

  if (layout.nodes.length === 0) {
    return (
      <div
        className="t-meta dim"
        style={{ padding: "60px 0", textAlign: "center" }}
      >
        ↳ el organigrama todavía está vacío. El admin lo arma desde{" "}
        <em>/admin/organigrama</em>.
      </div>
    );
  }

  return (
    <>
      <div className="org-controls-bar">
        <div className="org-search-wrap">
          <button
            type="button"
            className={`org-search-trigger ${showSearch ? "is-active" : ""}`}
            onClick={() => setShowSearch((v) => !v)}
          >
            <span>⌕</span> Buscar persona
          </button>
          {showSearch && (
            <div className="org-search-popover">
              <input
                autoFocus
                type="text"
                placeholder="Nombre o rol…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="org-search-input"
              />
              {matches.length > 0 && (
                <div className="org-search-results">
                  {matches.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="org-search-result"
                      onClick={() => pickResult(p.id)}
                    >
                      <span
                        className="org-search-dot"
                        style={{ background: p.accent }}
                      />
                      <span className="org-search-name">{p.name}</span>
                      <span className="org-search-role">{p.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="org-controls-right">
          {isAdmin && editMode && (
            <button
              type="button"
              className="org-edit-danger"
              onClick={() => setConfirmReset(true)}
              title="Borra todas las posiciones fijadas a mano"
            >
              Reacomodar todo
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className={`org-edit-toggle ${editMode ? "is-on" : ""}`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "✓ Editando posiciones" : "Editar posiciones"}
            </button>
          )}
          <div className="org-zoom-group">
            <button
              type="button"
              className="org-zoom-btn"
              onClick={zoomOut}
              title="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="org-zoom-pct"
              onClick={resetView}
              title="Reset vista"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              className="org-zoom-btn"
              onClick={zoomIn}
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="org-hint">
        <span>⌕</span>{" "}
        {editMode
          ? "Arrastrá un nodo para fijar su posición · click para ver detalle y resetear · arrastrá el fondo para moverte"
          : "Click en cualquier nodo para ver detalle · Arrastrá el fondo para moverte · "}
        {!editMode && (
          <>
            <span className="org-hint-kbd">⌃</span> + Rueda para zoom
          </>
        )}
      </div>

      <div
        ref={wrapRef}
        className={`org-canvas-scale ${isDragging ? "is-dragging" : ""} ${
          editMode ? "is-editing" : ""
        }`}
        style={{ height: VIEW_H }}
        onMouseDown={onMouseDown}
      >
        {editMode && <div className="org-edit-ribbon">MODO EDICIÓN</div>}
        <div className="org-pan-bg" />
        <div
          className={`org-canvas ${editMode ? "is-editing" : ""}`}
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <OrgLines nodes={displayNodes} childrenMap={childrenMap} width={CANVAS_W} height={CANVAS_H} />
          {displayNodes.map((n) => (
            <OrgNode
              key={n.id}
              n={n}
              isSelected={selectedId === n.id}
              editMode={editMode}
              isDraggingThis={dragPreview?.id === n.id}
              onSelect={() => setSelectedId(n.id)}
              onMouseDown={(e) => startNodeDrag(e, n)}
            />
          ))}
        </div>
      </div>

      {legend.length > 0 && (
        <div className="org-legend">
          {legend.map(([label, color]) => (
            <div key={label} className="org-legend-item">
              <span className="org-legend-dot" style={{ background: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <PersonPanel
          n={selected}
          childIds={childrenMap.get(selected.id) ?? []}
          byId={byId}
          editMode={editMode}
          onResetPosition={() => resetPosition(selected.type, selected.id)}
          onClose={() => setSelectedId(null)}
          onPick={(id) => setSelectedId(id)}
        />
      )}

      {confirmReset && (
        <ConfirmModal
          title="Reacomodar todo"
          body="Se borran TODAS las posiciones fijadas a mano y el organigrama vuelve al layout automático. No se puede deshacer."
          confirmLabel="Sí, reacomodar"
          onCancel={() => setConfirmReset(false)}
          onConfirm={reacomodarTodo}
        />
      )}
    </>
  );
}

// =============================================================
// Nodo
// =============================================================
function OrgNode({
  n,
  isSelected,
  editMode,
  isDraggingThis,
  onSelect,
  onMouseDown,
}: Readonly<{
  n: OrgLayoutNode;
  isSelected: boolean;
  editMode: boolean;
  isDraggingThis: boolean;
  onSelect: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}>) {
  const isPerson = n.type === "person";
  const small = isPerson && n.h <= 34;
  const cls = [
    "org-node",
    isPerson ? "org-node-person" : "org-node-dept",
    small ? "org-node-sm" : "",
    isSelected ? "is-selected" : "",
    editMode && n.overridden ? "is-fixed" : "",
    isDraggingThis ? "is-dragging-node" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style = accentStyle(
    { left: n.x, top: n.y, width: n.w, height: n.h },
    n.accent,
  );

  return (
    <div
      className={cls}
      style={style}
      onClick={editMode ? undefined : onSelect}
      onMouseDown={onMouseDown}
      onKeyDown={(e) => {
        if (!editMode && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {editMode && n.overridden && (
        <span className="org-node-pin" title="Posición fijada a mano" aria-hidden />
      )}
      {isPerson && (
        <div className="org-node-bar" style={{ background: n.accent }} />
      )}
      <div className="org-node-body">
        <div className="org-node-name">{n.name}</div>
        {n.role && <div className="org-node-role">{n.role}</div>}
      </div>
      {n.teamCount > 0 && (
        <div
          className="org-node-badge"
          style={{ background: n.accent }}
          title={`${n.teamCount} en el equipo`}
        >
          {n.teamCount}
        </div>
      )}
    </div>
  );
}

// =============================================================
// Líneas (edges) — ruteo ortogonal, portado del algoritmo NQS (caso general).
// =============================================================
function OrgLines({
  nodes,
  childrenMap,
  width,
  height,
}: Readonly<{
  nodes: OrgLayoutNode[];
  childrenMap: Map<string, string[]>;
  width: number;
  height: number;
}>) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const stroke = "var(--line-strong)";
  const sw = "1";
  const cx = (n: OrgLayoutNode) => n.x + n.w / 2;
  const top = (n: OrgLayoutNode) => n.y;
  const bot = (n: OrgLayoutNode) => n.y + n.h;

  const paths: ReactElement[] = [];
  const line = (key: string, x1: number, y1: number, x2: number, y2: number) => (
    <line
      key={key}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={sw}
      fill="none"
      vectorEffect="non-scaling-stroke"
      shapeRendering="crispEdges"
    />
  );

  for (const f of nodes) {
    const kids = (childrenMap.get(f.id) ?? [])
      .map((id) => byId.get(id))
      .filter((x): x is OrgLayoutNode => Boolean(x));
    if (kids.length === 0) continue;

    const fxc = cx(f);
    const fyb = bot(f);
    const allAligned = kids.every((t) => Math.abs(cx(t) - fxc) < 2);

    if (allAligned) {
      for (const t of kids) paths.push(line(`${f.id}-${t.id}-v`, fxc, fyb, fxc, top(t)));
      continue;
    }

    if (kids.length === 1) {
      const t = kids[0];
      const txc = cx(t);
      const tyt = top(t);
      const midY = fyb + (tyt - fyb) / 2;
      paths.push(
        <path
          key={`${f.id}-${t.id}-L`}
          d={`M${fxc},${fyb} L${fxc},${midY} L${txc},${midY} L${txc},${tyt}`}
          stroke={stroke}
          strokeWidth={sw}
          fill="none"
          vectorEffect="non-scaling-stroke"
          shapeRendering="crispEdges"
        />,
      );
      continue;
    }

    const minChildTop = Math.min(...kids.map(top));
    const stemY = minChildTop - 14;
    const xs = kids.map(cx);
    const minX = Math.min(fxc, ...xs);
    const maxX = Math.max(fxc, ...xs);
    paths.push(line(`${f.id}-stem`, fxc, fyb, fxc, stemY));
    paths.push(line(`${f.id}-bar`, minX, stemY, maxX, stemY));
    for (const t of kids) paths.push(line(`${f.id}-drop-${t.id}`, cx(t), stemY, cx(t), top(t)));
  }

  return (
    <svg className="org-lines" viewBox={`0 0 ${width} ${height}`} fill="none">
      {paths}
    </svg>
  );
}

// =============================================================
// Panel de detalle (modal lateral)
// =============================================================
function PersonPanel({
  n,
  childIds,
  byId,
  editMode,
  onResetPosition,
  onClose,
  onPick,
}: Readonly<{
  n: OrgLayoutNode;
  childIds: string[];
  byId: Map<string, OrgLayoutNode>;
  editMode: boolean;
  onResetPosition: () => void;
  onClose: () => void;
  onPick: (id: string) => void;
}>) {
  const kids = childIds
    .map((id) => byId.get(id))
    .filter((x): x is OrgLayoutNode => Boolean(x));

  return (
    <div className="org-panel-overlay" onClick={onClose}>
      <div className="org-panel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="org-panel-close"
          onClick={onClose}
          aria-label="cerrar"
        >
          ×
        </button>
        <div className="t-eyebrow" style={{ color: n.accent, marginBottom: 12 }}>
          ↳ {n.type === "person" ? "PERSONA" : "ÁREA"}
        </div>
        <div className="org-panel-name">{n.name}</div>
        {n.role && <div className="org-panel-role">{n.role}</div>}
        <div className="org-panel-bar" style={{ background: n.accent }} />

        {n.dept && n.type === "person" && (
          <div className="org-panel-meta">
            <span className="t-eyebrow">Departamento</span>
            <span>{n.dept}</span>
          </div>
        )}

        {editMode && (
          <div className="org-panel-fixed">
            <div className="t-eyebrow org-panel-section">↳ Posición</div>
            {n.overridden ? (
              <>
                <p className="t-meta dim" style={{ margin: "0 0 10px", fontSize: 12 }}>
                  Fijada a mano. No responde al orden automático.
                </p>
                <button
                  type="button"
                  className="org-panel-reset"
                  onClick={onResetPosition}
                >
                  ↺ Resetear al automático
                </button>
              </>
            ) : (
              <p className="t-meta dim" style={{ margin: 0, fontSize: 12 }}>
                Automática. Arrastrá el nodo para fijarla.
              </p>
            )}
          </div>
        )}

        {kids.length > 0 && (
          <>
            <div className="t-eyebrow org-panel-section">
              ↳ Reportes directos ({kids.length})
            </div>
            <div className="org-panel-list">
              {kids.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className="org-panel-member"
                  onClick={() => onPick(c.id)}
                >
                  <span className="org-panel-dot" style={{ background: c.accent }} />
                  <span className="org-panel-mname">{c.name}</span>
                  {c.role && <span className="org-panel-mrole">· {c.role}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================
// Modal de confirmación (para acciones destructivas)
// =============================================================
function ConfirmModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: Readonly<{
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  return (
    <div className="org-confirm-overlay" onClick={onCancel}>
      <div className="org-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="org-confirm-title">{title}</div>
        <p className="org-confirm-body">{body}</p>
        <div className="org-confirm-actions">
          <button type="button" className="org-confirm-cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="org-confirm-ok" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
