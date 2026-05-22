/* global React */

// ========= LOGO NQS (gif animado oficial) =========
function NqsLogo({ size = 28, animated = true, variant = "icon" }) {
  // variant "icon" -> cuadrado chico (topbar / nav)
  // variant "wide" -> aspect ratio original (login hero)
  if (variant === "wide") {
    return (
      <span className="nqs-logo nqs-logo-wide" aria-label="NQS" style={{ display: "inline-block", height: size }}>
        <img src="assets/nqs-logo.gif" alt="NQS" style={{ height: size, width: "auto", display: "block" }} />
      </span>
    );
  }
  return (
    <span className="nqs-logo" style={{ width: size * 1.9, height: size, display: "inline-block", overflow: "visible" }} aria-label="NQS">
      <img src="assets/nqs-logo.gif" alt="NQS" style={{ height: size, width: "auto", display: "block" }} />
    </span>
  );
}

// ========= STATUS PILL =========
function StatusPill({ status, expiresInMin, requestedAt, expiredAt, credits, creditsTotal }) {
  if (status === "active") {
    if (credits != null) {
      return <span className="tag ok"><span className="dot" /> {credits} / {creditsTotal} créditos</span>;
    }
    const h = Math.floor(expiresInMin / 60);
    const m = expiresInMin % 60;
    const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return <span className="tag ok"><span className="dot" /> activa · {label}</span>;
  }
  if (status === "pending") return <span className="tag warn"><span className="dot pulse" /> pendiente · {requestedAt}</span>;
  if (status === "expired") return <span className="tag danger"><span className="dot" /> expirada · {expiredAt}</span>;
  return <span className="tag"><span className="dot" /> sin acceso</span>;
}

// ========= TOOL CARD (drag-and-drop ready) =========
function ToolCard({ tool, access, onOpen, onRequest, idx, draggable, onDragStart, onDragOver, onDrop, dragging, dragOver }) {
  const isActive = access?.status === "active";
  const isPending = access?.status === "pending";
  const isLocked = access?.status === "locked" || access?.status === "expired";
  const usedPct = Math.round((access?.used || 0) * 100);
  const hasCredits = access?.credits != null;

  return (
    <div
      className={`tool-card ${dragging ? "is-dragging" : ""} ${dragOver ? "is-drag-over" : ""}`}
      data-status={access?.status}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => isActive ? onOpen(tool) : null}
    >
      <div className="tool-card-top">
        <div className="tool-card-num t-eyebrow">{String(idx + 1).padStart(2, "0")}</div>
        <div className="tool-card-handle" title="Arrastrar para reordenar">⋮⋮</div>
        <div className="tool-card-glyph" style={{ color: tool.color }}>{tool.glyph}</div>
      </div>
      <div className="tool-card-body">
        <div className="t-eyebrow">{tool.category}</div>
        <h3 className="tool-card-name">{tool.name}</h3>
        <p className="tool-card-desc">{tool.desc}</p>
      </div>
      <div className="tool-card-foot">
        <StatusPill {...access} />
        {isActive && hasCredits && (
          <div className="tool-card-meter">
            <div className="meter">
              <div className="meter-fill" style={{ width: `${(access.credits / access.creditsTotal) * 100}%`, background: tool.color }} />
            </div>
            <span className="t-meta">{access.credits} disponibles</span>
          </div>
        )}
        {isActive && !hasCredits && (
          <div className="tool-card-meter">
            <div className="meter">
              <div className="meter-fill" style={{ width: `${usedPct}%`, background: tool.color }} />
            </div>
            <span className="t-meta">{usedPct}% del cupo</span>
          </div>
        )}
        {isPending && <span className="t-meta">esperando confirmación</span>}
        {isLocked && (
          <button className="btn sm secondary" onClick={(e) => { e.stopPropagation(); onRequest(tool); }}>solicitar acceso</button>
        )}
        {isActive && (
          <button className="btn sm" onClick={(e) => { e.stopPropagation(); onOpen(tool); }}>abrir →</button>
        )}
      </div>
    </div>
  );
}

// ========= TOOL ROW =========
function ToolRow({ tool, access, onOpen, onRequest, idx }) {
  const isActive = access?.status === "active";
  const isPending = access?.status === "pending";
  const isLocked = access?.status === "locked" || access?.status === "expired";
  return (
    <div className="tool-row" data-status={access?.status}>
      <div className="t-eyebrow tool-row-num">{String(idx + 1).padStart(2, "0")}</div>
      <div className="tool-row-glyph" style={{ color: tool.color }}>{tool.glyph}</div>
      <div className="tool-row-name">
        <div className="tool-row-name-t">{tool.name}</div>
        <div className="t-meta">{tool.vendor}</div>
      </div>
      <div className="tool-row-cat t-meta">{tool.category}</div>
      <div className="tool-row-status"><StatusPill {...access} /></div>
      <div className="tool-row-cta">
        {isActive && <button className="btn sm" onClick={() => onOpen(tool)}>abrir →</button>}
        {isPending && <span className="t-meta dim">esperando</span>}
        {isLocked && <button className="btn sm secondary" onClick={() => onRequest(tool)}>solicitar</button>}
      </div>
    </div>
  );
}

// ========= STAT TILE =========
function StatTile({ label, value, unit, delta, accent }) {
  return (
    <div className="stat-tile">
      <div className="t-eyebrow">{label}</div>
      <div className="stat-tile-v">
        <span className="t-num" style={{ color: accent }}>{value}</span>
        {unit && <span className="stat-tile-u t-meta">{unit}</span>}
      </div>
      {delta != null && (
        <div className="t-meta" style={{ color: delta >= 0 ? "var(--ok)" : "var(--danger)" }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs sem. anterior
        </div>
      )}
    </div>
  );
}

// ========= BAR CHART =========
function BarChart({ data, accent = "var(--accent)" }) {
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div className="bar-col" key={i}>
          <div className="bar-track">
            <div className="bar-fill" style={{ height: `${d.v * 100}%`, background: accent }} />
          </div>
          <div className="t-meta">{d.d}</div>
        </div>
      ))}
    </div>
  );
}

// ========= MODAL =========
function Modal({ open, onClose, children, title, wide }) {
  if (!open) return null;
  return (
    <div className="modal-bd" onClick={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="t-eyebrow">{title}</div>
          <button className="btn ghost" onClick={onClose}>esc ✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ========= TOAST =========
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="toast fade-in">
      <span className="toast-glyph" style={{ color: toast.color || "var(--accent)" }}>✦</span>
      <div className="grow">
        <div className="t-eyebrow">{toast.title}</div>
        <div className="toast-msg">{toast.msg}</div>
      </div>
    </div>
  );
}

// ========= MARQUEE =========
function Marquee({ items }) {
  const doubled = [...items, ...items];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {doubled.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  );
}

Object.assign(window, {
  NqsLogo, StatusPill, ToolCard, ToolRow, StatTile, BarChart, Modal, Toast, Marquee,
});
