"use client";

/**
 * Canvas del organigrama híbrido (etapa 2). Porta el LOOK y las INTERACCIONES
 * del diseño NQS (organigrama.jsx/.css) a nuestro stack, pero se alimenta 100%
 * de los datos calculados por el motor (`computeOrgLayout`): nada de x/y, edges
 * ni teamCount hardcodeados. Todavía sin edición (drag/CRUD = etapa 3).
 *
 * Interacciones portadas:
 *  - zoom con rueda SOLO con ctrl/cmd (Figma/Miro), hacia el cursor, límites 0.3–2.5;
 *  - paneo arrastrando el fondo (no los nodos);
 *  - botones − / % / + (el % resetea la vista); fit-to-width como zoom inicial;
 *  - click en nodo → panel de detalle; buscador de persona; leyenda por área.
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
import type { OrgLayout, OrgLayoutNode, OrgEdge } from "@/lib/org/layout";

const VIEW_H = 600; // alto visible del viewport pan/zoom
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

type OrgCanvasProps = Readonly<{ layout: OrgLayout }>;

/** Estilo con la custom property --accent (para barra/tinte por dato). */
function accentStyle(base: CSSProperties, accent: string): CSSProperties {
  return { ...base, ["--accent" as string]: accent } as CSSProperties;
}

export function OrgCanvas({ layout }: OrgCanvasProps) {
  const CANVAS_W = Math.max(layout.width, 1);
  const CANVAS_H = Math.max(layout.height, 1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  // Refs con el último scale/pan para leerlos desde listeners nativos sin re-attach.
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
    // Centrado horizontal; top-alineado (raíz arriba) con un margen chico. Más
    // predecible que centrar en vertical: árboles cortos no quedan flotando.
    setPan({ x: Math.max(0, (cw - CANVAS_W * s) / 2), y: 20 });
  }, [fitScale, CANVAS_W]);

  // Init + fit-to-width al montar y al resize.
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

  // Centra un nodo en el viewport (para el resultado del buscador).
  const centerOn = useCallback((node: OrgLayoutNode) => {
    const el = wrapRef.current;
    if (!el) return;
    const s = scaleRef.current;
    setPan({
      x: el.clientWidth / 2 - s * (node.x + node.w / 2),
      y: VIEW_H / 2 - s * (node.y + node.h / 2),
    });
  }, []);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  // Buscador: personas por nombre o rol, máx 8.
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

  // Leyenda: áreas presentes (cajas por su nombre, personas por su dept) con el
  // color que viene del dato. Siempre poblada desde la gente real.
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
        <span>⌕</span> Click en cualquier nodo para ver detalle · Arrastrá el
        fondo para moverte · <span className="org-hint-kbd">⌃</span> + Rueda para
        zoom
      </div>

      <div
        ref={wrapRef}
        className={`org-canvas-scale ${isDragging ? "is-dragging" : ""}`}
        style={{ height: VIEW_H }}
        onMouseDown={onMouseDown}
      >
        <div className="org-pan-bg" />
        <div
          className="org-canvas"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <OrgLines
            nodes={layout.nodes}
            childrenMap={childrenMap}
            byId={byId}
            width={CANVAS_W}
            height={CANVAS_H}
          />
          {layout.nodes.map((n) => (
            <OrgNode
              key={n.id}
              n={n}
              isSelected={selectedId === n.id}
              onClick={() => setSelectedId(n.id)}
            />
          ))}
        </div>
      </div>

      {/* Leyenda de áreas (colores desde el dato) */}
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
          onClose={() => setSelectedId(null)}
          onPick={(id) => setSelectedId(id)}
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
  onClick,
}: Readonly<{ n: OrgLayoutNode; isSelected: boolean; onClick: () => void }>) {
  const isPerson = n.type === "person";
  const small = isPerson && n.h <= 34;
  const cls = [
    "org-node",
    isPerson ? "org-node-person" : "org-node-dept",
    small ? "org-node-sm" : "",
    isSelected ? "is-selected" : "",
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
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
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
// Cada padre: si sus hijos están alineados debajo → línea recta; si es uno →
// codo en L; si son varios → tronco + barra horizontal + bajadas a cada hijo.
// =============================================================
function OrgLines({
  nodes,
  childrenMap,
  byId,
  width,
  height,
}: Readonly<{
  nodes: OrgLayoutNode[];
  childrenMap: Map<string, string[]>;
  byId: Map<string, OrgLayoutNode>;
  width: number;
  height: number;
}>) {
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

    // Varios hijos: tronco + barra + bajada por hijo.
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
  onClose,
  onPick,
}: Readonly<{
  n: OrgLayoutNode;
  childIds: string[];
  byId: Map<string, OrgLayoutNode>;
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
        <div
          className="t-eyebrow"
          style={{ color: n.accent, marginBottom: 12 }}
        >
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
                  <span
                    className="org-panel-dot"
                    style={{ background: c.accent }}
                  />
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
