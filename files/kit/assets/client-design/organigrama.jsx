// =============================================================
// ORGANIGRAMA SCREEN — pantalla con 3 sub-tabs
// Organigrama · Filtros de calidad · Etiquetado
// =============================================================

function OrganigramaScreen() {
  const [tab, setTab] = React.useState("org"); // org | filtros | etiq

  return (
    <div className="page org-page">
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>↳ ESTRUCTURA · TOWN HALL Q2 · 2026</div>
          <h1 className="page-title">Cómo nos organizamos, <em>en concreto.</em></h1>
          <div className="page-sub">Quién depende de quién, cuándo escalar y a quién arrobar. La nueva estructura del estudio en una sola página.</div>
        </div>
        <div className="page-meta">
          <div>PERSONAS</div>
          <strong>{countPeople()}</strong>
          <div>ÁREAS</div>
          <strong>10</strong>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="org-subnav">
        <button className={`org-subnav-btn ${tab === "org" ? "is-active" : ""}`} onClick={() => setTab("org")}>
          <span className="t-num">01</span> · Organigrama
        </button>
        <button className={`org-subnav-btn ${tab === "filtros" ? "is-active" : ""}`} onClick={() => setTab("filtros")}>
          <span className="t-num">02</span> · Filtros de calidad
        </button>
        <button className={`org-subnav-btn ${tab === "etiq" ? "is-active" : ""}`} onClick={() => setTab("etiq")}>
          <span className="t-num">03</span> · Etiquetado
        </button>
      </div>

      {tab === "org" && <OrgChart />}
      {tab === "filtros" && <OrgFiltros />}
      {tab === "etiq" && <OrgEtiquetado />}
    </div>
  );
}

function countPeople() {
  const names = new Set();
  ORG_NODES.forEach((n) => {
    if (n.type === "person") names.add(n.name);
    if (n.members) n.members.forEach((m) => names.add(m));
  });
  return names.size;
}

// =============================================================
// 01 · ORGANIGRAMA — canvas con cortafuegos toggle
// =============================================================
function OrgChart() {
  const [cfOn, setCfOn] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const wrapRef = React.useRef(null);
  const dragRef = React.useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const CANVAS_W = 1456;
  const CANVAS_H = 680;
  const VIEW_H = 600; // alto visible del viewport pan/zoom

  // Fit-to-width como zoom inicial
  const computeFitScale = React.useCallback(() => {
    const el = wrapRef.current;
    if (!el) return 1;
    return Math.min(1, el.clientWidth / CANVAS_W);
  }, []);

  React.useEffect(() => {
    const init = () => {
      const s = computeFitScale();
      setScale(s);
      // centrar verticalmente
      setPan({ x: 0, y: (VIEW_H - CANVAS_H * s) / 2 });
    };
    init();
    const onResize = () => {
      const s = computeFitScale();
      setScale(s);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [computeFitScale]);

  // Wheel zoom — sólo con ctrl/cmd (como Figma/Miro). Sin modificador, deja al scroll de la página pasar.
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; // no hacemos preventDefault → la página scrollea normal
    e.preventDefault();
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.max(0.3, Math.min(2.5, scale * factor));
    const k = newScale / scale;
    setPan({
      x: mx - k * (mx - pan.x),
      y: my - k * (my - pan.y)
    });
    setScale(newScale);
  };

  const onMouseDown = (e) => {
    // Solo arrastra con botón medio (ruedita) o cuando se hace click en el fondo
    const isMiddle = e.button === 1;
    const isBackground = e.target === e.currentTarget || e.target.classList.contains("org-canvas") || e.target.classList.contains("org-pan-bg");
    if (!isMiddle && !isBackground) return;
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  React.useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      setPan({
        x: dragRef.current.panX + (e.clientX - dragRef.current.x),
        y: dragRef.current.panY + (e.clientY - dragRef.current.y)
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

  const resetView = () => {
    const s = computeFitScale();
    setScale(s);
    setPan({ x: 0, y: (VIEW_H - CANVAS_H * s) / 2 });
  };
  const zoomIn = () => setScale((s) => Math.min(2.5, s * 1.2));
  const zoomOut = () => setScale((s) => Math.max(0.3, s / 1.2));

  const nodeMap = React.useMemo(() => {
    const m = {};
    ORG_NODES.forEach((n) => (m[n.id] = n));
    return m;
  }, []);

  const childrenMap = React.useMemo(() => {
    const m = {};
    ORG_EDGES.forEach(([f, t]) => {
      if (!m[f]) m[f] = [];
      m[f].push(t);
    });
    return m;
  }, []);

  const selected = selectedId ? nodeMap[selectedId] : null;

  const searchAll = React.useMemo(() => {
    const arr = [];
    ORG_NODES.forEach((n) => {
      if (n.name && n.type === "person") arr.push({ name: n.name, role: n.role || "", id: n.id, accent: n.accent });
      if (n.members) n.members.forEach((m) => arr.push({ name: m, role: n.role || "", id: n.id, accent: n.accent }));
    });
    return arr;
  }, []);

  const matches = search.trim() ?
    searchAll.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.role.toLowerCase().includes(search.toLowerCase())).slice(0, 8) :
    [];

  return (
    <>
      <div className="org-controls-bar">
        <div className="org-search-wrap">
          <button
            className={`org-search-trigger ${showSearch ? "is-active" : ""}`}
            onClick={() => setShowSearch(!showSearch)}>
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
                className="org-search-input" />
              {matches.length > 0 && (
                <div className="org-search-results">
                  {matches.map((p, i) => (
                    <button
                      key={i}
                      className="org-search-result"
                      onClick={() => {
                        setSelectedId(p.id);
                        setSearch("");
                        setShowSearch(false);
                      }}>
                      <span className="org-search-dot" style={{ background: p.accent }}></span>
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
            <button className="org-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
            <button className="org-zoom-pct" onClick={resetView} title="Reset">{Math.round(scale * 100)}%</button>
            <button className="org-zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
          </div>
          <button className={`org-cf-toggle ${cfOn ? "is-on" : ""}`} onClick={() => setCfOn(!cfOn)}>
            <span className="org-cf-toggle-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 13 L8 3 L13 13 Z" />
                <line x1="6" y1="9" x2="10" y2="9" />
              </svg>
            </span>
            Cortafuegos
          </button>
        </div>
      </div>

      <div className="org-hint">
        <span>⌕</span> Click en cualquier nodo para ver detalle · Arrastrá el fondo para moverte · <span className="org-hint-kbd">⌃</span> + Rueda para zoom
      </div>

      <div
        ref={wrapRef}
        className={`org-canvas-scale ${isDragging ? "is-dragging" : ""}`}
        style={{ height: VIEW_H }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}>
        <div className="org-pan-bg"></div>
        <div
          className={`org-canvas ${cfOn ? "cf-on" : ""}`}
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "top left"
          }}>
          {/* Discipline labels (sin caja, etiqueta arriba de cada columna) */}
          {cfOn && DISC_GROUPS.map((g) => {
            const ns = g.ids.map((i) => nodeMap[i]).filter(Boolean);
            if (!ns.length) return null;
            const x0 = Math.min(...ns.map((n) => n.x));
            const x1 = Math.max(...ns.map((n) => n.x + n.w));
            const y0 = Math.min(...ns.map((n) => n.y));
            return (
              <div
                key={g.id}
                className="org-disc-label"
                style={{ left: x0, top: y0 - 22, width: x1 - x0 }}>
                <span>{g.label}</span>
              </div>
            );
          })}

          {/* Cortafuegos rail */}
          {cfOn && <CortafuegosRail />}

          {/* SVG con líneas */}
          <OrgLines nodeMap={nodeMap} childrenMap={childrenMap} />

          {/* Nodos */}
          {ORG_NODES.map((n) => (
            <OrgNode
              key={n.id}
              n={n}
              isSelected={selectedId === n.id}
              onClick={() => setSelectedId(n.id)} />
          ))}
        </div>
      </div>

      {/* Leyenda departamentos */}
      <div className="org-legend">
        {[
        { name: "Partners", c: "#E8873C" },
        { name: "Sales", c: "#1D9E75" },
        { name: "People", c: "#D4537E" },
        { name: "Admin", c: "#D85A30" },
        { name: "Production / R&D", c: "#7F77DD" },
        { name: "HOP · PM Lead", c: "#5BB8D4" },
        { name: "PM", c: "#4AADCA" },
        { name: "HOS", c: "#378ADD" },
        { name: "Interactive", c: "#7AC4F0" },
        { name: "Modeling", c: "#3B94E0" },
        { name: "3D", c: "#1B5FB5" },
        { name: "PP", c: "#0D3D78" },
        { name: "IT", c: "#888780" }].
        map((l) => (
          <div key={l.name} className="org-legend-item">
            <span className="org-legend-dot" style={{ background: l.c }}></span>
            <span>{l.name}</span>
          </div>
        ))}
      </div>

      {/* Cortafuegos legend (visible solo cuando está on) */}
      {cfOn && (
        <div className="org-cf-legend">
          <div className="t-eyebrow" style={{ marginBottom: 14 }}>↳ SISTEMA DE CORTAFUEGOS · CUATRO PUNTOS DE CONTROL</div>
          {CF_TIERS.map((t) => (
            <div key={t.code} className="org-cf-row">
              <div className="org-cf-haz"></div>
              <div className="org-cf-code" style={{ color: t.color }}>
                {t.code}<em>{t.label}</em>
              </div>
              <div className="org-cf-desc">{t.desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* Panel persona */}
      {selected && (
        <PersonPanel
          n={selected}
          children={childrenMap[selected.id] || []}
          nodeMap={nodeMap}
          onClose={() => setSelectedId(null)}
          onPick={(id) => setSelectedId(id)} />

      )}
    </>);

}

// =============================================================
// Nodo
// =============================================================
function OrgNode({ n, isSelected, onClick }) {
  const lv = n.lv || 0;
  const isPerson = n.type === "person";
  const cls = isPerson ? `org-node org-node-person org-node-lv${lv} ${isSelected ? "is-selected" : ""}` : `org-node org-node-dept ${isSelected ? "is-selected" : ""}`;

  const style = {
    left: n.x,
    top: n.y,
    width: n.w,
    height: n.h,
    "--accent": n.accent
  };

  const badgeNum = n.teamCount || n.members && n.members.length;
  const badgeTip = n.members && n.members.length ? `${badgeNum} reportes directos` : `${badgeNum} reporte${badgeNum > 1 ? "s" : ""} directo${badgeNum > 1 ? "s" : ""}`;

  return (
    <div className={cls} style={style} onClick={onClick}>
      {isPerson && <div className="org-node-bar" style={{ background: n.accent }}></div>}
      <div className="org-node-body">
        <div className="org-node-name">{n.name}</div>
        {n.role && <div className="org-node-role">{n.role}</div>}
      </div>
      {badgeNum &&
      <div className="org-node-badge" style={{ background: n.accent }} title={badgeTip}>
          {badgeNum}
        </div>
      }
    </div>);

}

// =============================================================
// SVG con líneas — re-implementación del algoritmo del archivo NQS
// =============================================================
function OrgLines({ nodeMap, childrenMap }) {
  const cx = (n) => n.x + n.w / 2;
  const top_ = (n) => n.y;
  const bot = (n) => n.y + n.h;
  const stroke = "var(--line-strong)";
  const sw = "1";

  const paths = [];

  Object.entries(childrenMap).forEach(([fId, children]) => {
    const f = nodeMap[fId];
    if (!f) return;
    const fxc = cx(f);
    const fyb = bot(f);
    const childNodes = children.map((cId) => nodeMap[cId]).filter(Boolean);
    if (!childNodes.length) return;

    const allAligned = childNodes.every((t) => Math.abs(cx(t) - fxc) < 2);

    if (allAligned) {
      childNodes.forEach((t) => {
        paths.push(<line key={`${fId}-${t.id}-v`} x1={fxc} y1={fyb} x2={fxc} y2={top_(t)} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
      });
      return;
    }

    if (childNodes.length === 1) {
      const t = childNodes[0];
      const txc = cx(t);
      const tyt = top_(t);
      const midY = fyb + (tyt - fyb) / 2;
      paths.push(<path key={`${fId}-${t.id}-L`} d={`M${fxc},${fyb} L${fxc},${midY} L${txc},${midY} L${txc},${tyt}`} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
      return;
    }

    const minChildTop = Math.min(...childNodes.map((t) => top_(t)));
    const stemY = minChildTop - 14;

    const columns = {};
    childNodes.forEach((t) => {
      const key = Math.round(cx(t) / 2) * 2;
      if (!columns[key]) columns[key] = [];
      columns[key].push(t);
    });
    const columnKeys = Object.keys(columns).map(Number).sort((a, b) => a - b);

    // Caso especial: PM
    if (fId === "pm") {
      columnKeys.forEach((colX) => {
        const group = columns[colX];
        if (group.length === 1) {
          const t = group[0];
          const txc = cx(t);
          const tyt = top_(t);
          const midY = fyb + (tyt - fyb) / 2;
          paths.push(<path key={`pm-${t.id}`} d={`M${fxc},${fyb} L${fxc},${midY} L${txc},${midY} L${txc},${tyt}`} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
        } else {
          const sorted = [...group].sort((a, b) => top_(a) - top_(b));
          const entryX = sorted[0].x - 10;
          const lastMidY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].h / 2;
          const firstMidY = sorted[0].y + sorted[0].h / 2;
          const midY = fyb + (firstMidY - fyb) / 2;
          paths.push(<path key={`pm-stem-${colX}`} d={`M${fxc},${fyb} L${fxc},${midY} L${entryX},${midY} L${entryX},${lastMidY}`} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
          sorted.forEach((t) => {
            const midY2 = t.y + t.h / 2;
            paths.push(<line key={`pm-pig-${t.id}`} x1={entryX} y1={midY2} x2={t.x} y2={midY2} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
          });
        }
      });
      return;
    }

    // Caso especial: Gasti (3D, dos columnas alrededor de centro)
    if (fId === "gasti" && columnKeys.length === 2) {
      const leftCol = columns[columnKeys[0]];
      const rightCol = columns[columnKeys[1]];
      const leftRight = Math.max(...leftCol.map((t) => t.x + t.w));
      const rightLeft = Math.min(...rightCol.map((t) => t.x));
      const centerX = (leftRight + rightLeft) / 2;
      const allRows = [...leftCol, ...rightCol].sort((a, b) => top_(a) - top_(b));
      const firstTop = top_(allRows[0]);
      const lastMidY = allRows[allRows.length - 1].y + allRows[allRows.length - 1].h / 2;
      const topY = firstTop - 8;
      paths.push(<path key="gasti-stem" d={`M${fxc},${fyb} L${fxc},${topY} L${centerX},${topY} L${centerX},${lastMidY}`} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
      [...leftCol, ...rightCol].forEach((t) => {
        const midY = t.y + t.h / 2;
        const targetX = t.x + t.w / 2 < centerX ? t.x + t.w : t.x;
        paths.push(<line key={`gasti-pig-${t.id}`} x1={centerX} y1={midY} x2={targetX} y2={midY} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
      });
      return;
    }

    // Caso general
    paths.push(<line key={`${fId}-stem`} x1={fxc} y1={fyb} x2={fxc} y2={stemY} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
    const minX = Math.min(fxc, ...columnKeys);
    const maxX = Math.max(fxc, ...columnKeys);
    paths.push(<line key={`${fId}-bar`} x1={minX} y1={stemY} x2={maxX} y2={stemY} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
    columnKeys.forEach((colX) => {
      const group = columns[colX];
      if (group.length === 1) {
        const t = group[0];
        const txc = cx(t);
        const tyt = top_(t);
        paths.push(<line key={`${fId}-drop-${t.id}`} x1={txc} y1={stemY} x2={txc} y2={tyt} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
      } else {
        const sorted = [...group].sort((a, b) => top_(a) - top_(b));
        const entryX = sorted[0].x - 10;
        const lastMidY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].h / 2;
        const childCenterX = sorted[0].x + sorted[0].w / 2;
        paths.push(<path key={`${fId}-col-${colX}`} d={`M${childCenterX},${stemY} L${entryX},${stemY} L${entryX},${lastMidY}`} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
        sorted.forEach((t) => {
          const midY = t.y + t.h / 2;
          paths.push(<line key={`${fId}-pig-${t.id}`} x1={entryX} y1={midY} x2={t.x} y2={midY} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
        });
      }
    });
  });

  // Conectores horizontales especiales
  // Tincho ↔ Fran ↔ Chule
  const tincho = nodeMap.tincho,fran = nodeMap.fran,chule = nodeMap.chule;
  if (tincho && fran && chule) {
    const y1 = tincho.y + tincho.h / 2;
    const y2 = chule.y + chule.h / 2;
    paths.push(<line key="t-f" x1={tincho.x + tincho.w} y1={y1} x2={fran.x} y2={y1} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
    paths.push(<line key="f-c" x1={fran.x + fran.w} y1={y1} x2={chule.x} y2={y2} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
  }
  // Chule ↔ R&D
  const ia = nodeMap.ia;
  if (chule && ia) {
    const yc = chule.y + chule.h / 2;
    const yia = ia.y + ia.h / 2;
    paths.push(<line key="c-rd" x1={chule.x + chule.w} y1={yc} x2={ia.x} y2={yia} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
  }
  // Guille ↔ IT
  const guille = nodeMap.guille,it = nodeMap.it;
  if (guille && it) {
    const gMidY = guille.y + guille.h / 2;
    const itMidY = it.y + it.h / 2;
    paths.push(<line key="g-it" x1={guille.x + guille.w} y1={gMidY} x2={it.x} y2={itMidY} stroke={stroke} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />);
  }

  return (
    <svg className="org-lines" viewBox="0 0 1456 680" fill="none">
      {paths}
    </svg>);

}

// =============================================================
// Cortafuegos rail
// =============================================================
function CortafuegosRail() {
  const breakpoints = { 4: [0, 156], 3: [156, 312], 2: [312, 410], 1: [410, 680] };
  const segs = [
  { code: "04", label: "Dirección", color: "#BA7517", range: breakpoints[4] },
  { code: "03", label: "Criterio", color: "#7F77DD", range: breakpoints[3] },
  { code: "02", label: "Técnica", color: "#378ADD", range: breakpoints[2] },
  { code: "01", label: "Autocheck", color: "#1D9E75", range: breakpoints[1] }];

  return (
    <div className="org-cf-rail">
      {segs.map((s) =>
      <div
        key={s.code}
        className="org-cf-seg"
        style={{
          top: s.range[0],
          height: s.range[1] - s.range[0],
          "--cf-c": s.color
        }}>
          <div className="org-cf-hazard"></div>
          <div className="org-cf-chip">
            <span className="org-cf-chip-code">{s.code}</span>
            <span className="org-cf-chip-lbl">{s.label}</span>
          </div>
        </div>
      )}
    </div>);
}

// =============================================================
// Panel persona (modal lateral)
// =============================================================
function PersonPanel({ n, children, nodeMap, onClose, onPick }) {
  const desc = ORG_ROLE_DESC[n.id];
  return (
    <div className="org-panel-overlay" onClick={onClose}>
      <div className="org-panel" onClick={(e) => e.stopPropagation()}>
        <button className="org-panel-close" onClick={onClose}>×</button>
        <div className="t-eyebrow" style={{ color: n.accent, marginBottom: 12 }}>↳ {(n.type === "person" ? "PERSONA" : "DEPARTAMENTO")}</div>
        <div className="org-panel-name">{n.name}</div>
        {n.role && <div className="org-panel-role">{n.role}</div>}
        <div className="org-panel-bar" style={{ background: n.accent }}></div>

        {desc &&
        <>
            <div className="t-eyebrow org-panel-section">↳ Sobre el rol</div>
            <ul className="org-panel-bullets">
              {desc.bullets.map((b, i) =>
            <li key={i}>{b}</li>
            )}
            </ul>
          </>
        }

        {children.length > 0 &&
        <>
            <div className="t-eyebrow org-panel-section">↳ Reportes directos</div>
            <div className="org-panel-list">
              {children.map((cid) => {
              const c = nodeMap[cid];
              if (!c) return null;
              return (
                <button key={cid} className="org-panel-member" onClick={() => onPick(cid)}>
                    <span className="org-panel-dot" style={{ background: c.accent }}></span>
                    <span className="org-panel-mname">{c.name}</span>
                    {c.role && <span className="org-panel-mrole">· {c.role}</span>}
                  </button>);

            })}
            </div>
          </>
        }

        {n.members && n.members.length > 0 &&
        <>
            <div className="t-eyebrow org-panel-section">↳ Equipo ({n.members.length})</div>
            <div className="org-panel-list">
              {n.members.map((m) =>
            <div key={m} className="org-panel-member is-static">
                  <span className="org-panel-dot" style={{ background: n.accent }}></span>
                  <span className="org-panel-mname">{m}</span>
                </div>
            )}
            </div>
          </>
        }
      </div>
    </div>);

}

// =============================================================
// 02 · FILTROS DE CALIDAD
// =============================================================
function OrgFiltros() {
  const [open, setOpen] = React.useState({ F1: true, F2: false, F3: false });
  const toggle = (code) => setOpen((o) => ({ ...o, [code]: !o[code] }));

  return (
    <div className="org-filtros">
      <div className="org-callout">
        <strong>El filtro 1 solo es sostenible si se documentan las guías técnicas de entrega.</strong>
        <div className="t-meta dim" style={{ marginTop: 8 }}>↳ ORDEN DE LOS CORTAFUEGOS · DESDE EL ARTISTA HACIA LA DIRECCIÓN</div>
      </div>

      {FILTROS.map((f) =>
      <div key={f.code} className={`org-fc ${open[f.code] ? "is-open" : ""}`}>
          <button className="org-fc-hd" onClick={() => toggle(f.code)}>
            <div className="org-fc-icon" style={{ background: f.color, color: "#fff" }}>{f.code}</div>
            <div className="org-fc-info">
              <div className="org-fc-title">{f.title}</div>
              <div className="org-fc-who">{f.who}</div>
            </div>
            <div className="org-fc-chev">▾</div>
          </button>
          <div className="org-fc-body">
            <div className="org-fc-inner">
              <div className="t-eyebrow org-fc-section">↳ Qué revisa</div>
              <ul className="org-fc-list">
                {f.revisa.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <div className="t-eyebrow org-fc-section">↳ Cuándo escala</div>
              <ul className="org-fc-list">
                {f.escala.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>);

}

// =============================================================
// 03 · ETIQUETADO — escenarios
// =============================================================
function OrgEtiquetado() {
  const [active, setActive] = React.useState("csfd");
  const sc = ETIQ_SCENARIOS.find((s) => s.key === active);

  return (
    <div className="org-etiq">
      <div className="org-rule">
        <strong>Regla base:</strong> una sola voz de AD por proyecto. Si Chule ve algo en un proyecto de Juli, se lo dice a ella, no al artista directamente. Idem Guille.
      </div>

      <div className="org-etiq-tabs">
        {ETIQ_SCENARIOS.map((s) =>
        <button
          key={s.key}
          className={`org-etiq-tab ${active === s.key ? "is-active" : ""}`}
          onClick={() => setActive(s.key)}
          style={{ "--tab-c": s.color }}>

            {s.label}
          </button>
        )}
      </div>

      <div className="org-etiq-card" style={{ "--card-c": sc.color }}>
        <div className="org-etiq-card-hd">
          <div className="org-etiq-dot" style={{ background: sc.color }}></div>
          <div className="t-eyebrow">↳ {sc.title}</div>
        </div>

        {sc.isTransition ?
        <div className="org-etiq-tr">
            {sc.items.map((it, i) =>
          <div key={i} className="org-etiq-tr-item">
                <div className="org-etiq-tr-bul" style={{ background: it.color }}></div>
                <div>
                  <strong>{it.label}.</strong> {it.text}
                </div>
              </div>
          )}
          </div> :

        <div className="org-etiq-steps">
            {sc.steps.map((st, i) =>
          <div key={i} className="org-etiq-step">
                <div className="org-etiq-snum">{i + 1}</div>
                <div>
                  <div className="org-etiq-act" dangerouslySetInnerHTML={{ __html: highlightMentions(st.t) }}></div>
                  {st.d && <div className="org-etiq-det" dangerouslySetInnerHTML={{ __html: highlightMentions(st.d) }}></div>}
                </div>
              </div>
          )}
          </div>
        }
      </div>
    </div>);

}

// helper: convierte @PM, @AD, @TL del área, Guille, Chule en chips
function highlightMentions(text) {
  return text.
  replace(/@AD/g, '<span class="mn mn-ad">@AD</span>').
  replace(/@PM/g, '<span class="mn mn-pm">@PM</span>').
  replace(/@TL del área/g, '<span class="mn mn-tl">@TL del área</span>').
  replace(/\bGuille\b/g, '<span class="mn mn-hos">Guille</span>').
  replace(/\bChule\b/g, '<span class="mn mn-ad">Chule</span>').
  replace(/\bJuli \(AD\)/g, '<span class="mn mn-ad">Juli (AD)</span>').
  replace(/\bJuli\b/g, '<span class="mn mn-ad">Juli</span>').
  replace(/\bTL del área\b/g, '<span class="mn mn-tl">TL del área</span>').
  replace(/\bTL \/ Guille\b/g, '<span class="mn mn-tl">TL</span> / <span class="mn mn-hos">Guille</span>').
  replace(/\bGuille \(HOS\)/g, '<span class="mn mn-hos">Guille (HOS)</span>');
}

Object.assign(window, { OrganigramaScreen });
