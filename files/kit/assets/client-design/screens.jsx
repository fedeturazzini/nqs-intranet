/* global React, TOOLS, USERS, ME, initialAccess, PENDING_REQUESTS, ACTIVITY, TOKEN_SERIES, FLAGGED_PROMPTS, SCREENSHOTS, NqsLogo, StatusPill, ToolCard, ToolRow, StatTile, BarChart, Modal, Toast, Marquee */

// ========================== LOGIN ==========================
function LoginScreen({ onLogin, tickerVariant = "cube" }) {
  const [role, setRole] = React.useState("user"); // "user" | "admin"
  const [u, setU] = React.useState("sofia.romero");
  const [p, setP] = React.useState("••••••••••");
  const [shake, setShake] = React.useState(false);

  // auto-rellenar cuando cambia el rol
  React.useEffect(() => {
    if (role === "admin") {setU("tomas.ferrari");} else
    {setU("sofia.romero");}
  }, [role]);

  const submit = (e) => {
    e?.preventDefault?.();
    if (!u || !p) {setShake(true);setTimeout(() => setShake(false), 400);return;}
    onLogin(role === "admin" ? "admin" : null);
  };
  return (
    <div className="login-page">
      <div className="login-left">
        <div className="bracket tl"></div>
        <div className="bracket tr"></div>
        <div className="bracket bl"></div>
        <div className="bracket br"></div>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="brand brand-lg">
            <NqsLogo size={48} variant="wide" />
            <span style={{ display: "none" }}>NQS · INTRANET</span>
          </div>
          <div className="t-meta">v 2.04 · NEXT LAYER</div>
        </div>

        <div style={{ marginTop: "auto", marginBottom: "auto", margin: "157.324px 0px 155.364px", height: "440px" }}>
          <div className="t-eyebrow" style={{ marginBottom: 24, letterSpacing: "-0.2px", padding: "0px", margin: "0px 0px 60.879px" }}>↳ Bienvenidos al estudio</div>
          <div className="login-hero" style={{ borderRadius: "0px", borderStyle: "solid", borderWidth: "0px", padding: "20.375px", letterSpacing: "2.8px", lineHeight: "0.75", margin: "-18.332px" }}>
            Todo lo que <em>somos</em>,<br />
            en un solo lugar.
          </div>
          <div className="login-sub">
            Tu base de operaciones diaria. Herramientas, playbooks, organigrama, workflows y todo lo que necesitás para crear con NQS — listo y a un click.
          </div>
        </div>

        <LoginTicker variant={tickerVariant} />
      </div>

      <div className="login-right">
        <div className="login-card" style={{ transform: shake ? "translateX(-4px)" : "" }}>
          <div className="login-eyebrow">
            <div className="t-eyebrow">↳ INGRESO</div>
            <div className="t-meta">26.04.2026</div>
          </div>
          <h1 className="login-title">Hola de nuevo.</h1>
          <p className="t-meta" style={{ lineHeight: 1.6, color: "var(--fg-mute)", margin: 0 }}>
            Ingresá con tu usuario de NQS para acceder a tu workspace.
          </p>

          <form className="login-fields" onSubmit={submit}>
            <div>
              <div className="field-label">¿CÓMO INGRESÁS?</div>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn sm" style={{ background: role === "user" ? "var(--accent)" : "transparent", color: role === "user" ? "var(--accent-fg)" : "var(--fg-mute)", border: role === "user" ? "0" : "1px solid var(--line-strong)" }} onClick={() => setRole("user")}>como usuario</button>
                <button type="button" className="btn sm" style={{ background: role === "admin" ? "var(--accent)" : "transparent", color: role === "admin" ? "var(--accent-fg)" : "var(--fg-mute)", border: role === "admin" ? "0" : "1px solid var(--line-strong)" }} onClick={() => setRole("admin")}>como admin</button>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="field-label">USUARIO</div>
              <input className="field" value={u} onChange={(e) => setU(e.target.value)} placeholder="nombre.apellido" autoFocus />
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="field-label">CONTRASEÑA</div>
              <input className="field" type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••••" />
            </div>

            <div className="login-actions">
              <button type="submit" className="btn" style={{ width: "100%" }}>Ingresar {role === "admin" ? "como admin" : ""} →</button>
            </div>
          </form>
        </div>

        <div className="login-foot">
          <div>NQS CREATIVE © 2026</div>
          <div className="row" style={{ gap: 18 }}>
            <span className="btn-link">¿olvidaste tu pass?</span>
            <span>SUPPORT · #ai-hub</span>
          </div>
        </div>
      </div>
    </div>);

}

// ========================== HUB ==========================
function HubScreen({ access, onOpenTool, onRequestTool, layout, setLayout }) {
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [order, setOrder] = React.useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("nqs-tool-order") || "null");
      if (Array.isArray(stored) && stored.length === TOOLS.length) return stored;
    } catch (e) {}
    return TOOLS.map((t) => t.id);
  });
  const [dragId, setDragId] = React.useState(null);
  const [dragOverId, setDragOverId] = React.useState(null);

  React.useEffect(() => {
    localStorage.setItem("nqs-tool-order", JSON.stringify(order));
  }, [order]);

  const orderedTools = order.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean);
  // si suman tools nuevas no presentes en el order guardado:
  TOOLS.forEach((t) => {if (!order.includes(t.id)) orderedTools.push(t);});

  const onDragStart = (id) => (e) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try {e.dataTransfer.setData("text/plain", id);} catch (err) {}
  };
  const onDragOver = (id) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  };
  const onDrop = (id) => (e) => {
    e.preventDefault();
    if (!dragId || dragId === id) {setDragId(null);setDragOverId(null);return;}
    setOrder((prev) => {
      const next = prev.filter((x) => x !== dragId);
      const idx = next.indexOf(id);
      next.splice(idx, 0, dragId);
      return next;
    });
    setDragId(null);
    setDragOverId(null);
  };

  const filtered = orderedTools.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "all") return true;
    if (filter === "active") return access[t.id]?.status === "active";
    if (filter === "pending") return access[t.id]?.status === "pending";
    if (filter === "locked") return access[t.id]?.status === "locked" || access[t.id]?.status === "expired";
    return true;
  });

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>↳ TU WORKSPACE</div>
          <h1 className="page-title">Buenos días, <em>Sofía.</em></h1>
          <div className="page-sub">Tu suite del día. Arrastrá las cards para reordenarlas a tu gusto.</div>
        </div>
        <div className="page-meta">
          <div>HOY</div>
          <strong>26 abril, 2026</strong>
          <div>EQUIPO ONLINE</div>
          <strong>9 personas</strong>
        </div>
      </div>

      <div className="hub-toolbar">
        <div className="hub-filters">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas · {TOOLS.length}</button>
          <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Activas · {Object.values(access).filter((a) => a.status === "active").length}</button>
          <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Pendientes · {Object.values(access).filter((a) => a.status === "pending").length}</button>
          <button className={filter === "locked" ? "active" : ""} onClick={() => setFilter("locked")}>Bloqueadas · {Object.values(access).filter((a) => a.status === "locked" || a.status === "expired").length}</button>
        </div>
        <div className="hub-search">
          <span className="t-meta">⌕</span>
          <input placeholder="buscar herramienta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="kbd">⌘K</span>
        </div>
        <div className="hub-filters">
          <button className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")}>Grid</button>
          <button className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")}>Lista</button>
        </div>
      </div>

      {layout === "grid" ?
      <div className="hub-grid">
          {filtered.map((t, i) =>
        <ToolCard key={t.id} tool={t} idx={orderedTools.indexOf(t)} access={access[t.id]}
        onOpen={onOpenTool} onRequest={onRequestTool}
        draggable
        onDragStart={onDragStart(t.id)}
        onDragOver={onDragOver(t.id)}
        onDrop={onDrop(t.id)}
        dragging={dragId === t.id}
        dragOver={dragOverId === t.id && dragId !== t.id} />
        )}
        </div> :

      <div className="hub-list">
          {filtered.map((t) =>
        <ToolRow key={t.id} tool={t} idx={orderedTools.indexOf(t)} access={access[t.id]}
        onOpen={onOpenTool} onRequest={onRequestTool} />
        )}
        </div>
      }
    </div>);

}

// ========================== TOOL VIEW ==========================
/*
 * DEV NOTE — Control de créditos para tools tipo 3DSky
 * -----------------------------------------------------------------------------
 * En PRODUCCIÓN el flow real es:
 *   1. El proxy NQS (3dsky.nqs.com) intercepta cualquier request HTTP a
 *      endpoints de compra de 3dsky.org (típicamente POST /buy, /checkout, etc.).
 *   2. Antes de pasarlo al upstream, consulta a la API de NQS:
 *        GET /api/credits/:userId/:tool  →  { credits, creditsTotal }
 *   3. Si credits > 0 → resta 1 (POST /api/credits/:userId/:tool/decrement),
 *      registra evento de auditoría, y pasa el request a 3dsky.org.
 *      Si credits === 0 → responde 402 Payment Required al iframe, y el front
 *      muestra el overlay de "sin créditos".
 *   4. Las descargas FREE y las re-descargas de items ya comprados (que pasan
 *      por endpoints distintos, ej. /download/:purchasedId) NO se interceptan
 *      ni descuentan créditos.
 *
 * En este prototipo:
 *   - El botón "simular compra (-1)" hace lo que haría la lógica server-side.
 *   - El estado de créditos vive en React local; en prod vive en la DB de NQS.
 *   - El overlay de bloqueo aparece sobre el iframe cuando credits === 0.
 *   - El modal "pedir más créditos" dispara una solicitud al admin (mismo
 *     flow que ya existe para tools en general).
 * -----------------------------------------------------------------------------
 */
function ToolView({ tool, access: initialAccess, onBack, onCreditRequest }) {
  const [tick, setTick] = React.useState(0);
  const [access, setLocalAccess] = React.useState(initialAccess);
  const [showRequestModal, setShowRequestModal] = React.useState(false);
  const [showOutOfCreditsOverlay, setShowOutOfCreditsOverlay] = React.useState(false);
  const isImmersive = !!tool.url;
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const totalMin = 240;
  const remaining = Math.max(0, (access?.expiresInMin || 60) - Math.floor(tick / 60));
  const pct = remaining / totalMin;
  const C = 2 * Math.PI * 11;
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  const hasCredits = access?.credits != null;
  const creditsLeft = access?.credits ?? 0;
  const isOutOfCredits = hasCredits && creditsLeft <= 0;

  // Simula una "compra" desde el iframe — en prod lo dispara el proxy al
  // detectar un POST /buy de 3dsky.org.
  const simulatePurchase = () => {
    if (creditsLeft <= 0) {
      setShowOutOfCreditsOverlay(true);
      return;
    }
    setLocalAccess((a) => ({ ...a, credits: Math.max(0, (a.credits || 0) - 1) }));
    if (creditsLeft - 1 <= 0) {
      // Cuando justo llegue a 0, mostramos overlay un momento después
      setTimeout(() => setShowOutOfCreditsOverlay(true), 600);
    }
  };

  return (
    <div className={`page tool-view ${isImmersive ? "is-immersive" : ""}`}>
      <div className="tool-view-bar">
        <div className="tool-view-bar-l">
          <button className="btn ghost sm" onClick={onBack}>← intranet</button>
          <span className="t-meta">↳ /</span>
          <span style={{ color: tool.color, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18 }}>{tool.glyph}</span>
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 22, letterSpacing: "-0.01em" }}>{tool.name}</span>
          <span className="t-meta dim">· {tool.vendor}</span>
        </div>
        <div className="tool-view-bar-r">
          {hasCredits ?
          <span className={`tag ${isOutOfCredits ? "warn" : "accent"}`}>
              <span className="dot" style={isOutOfCredits ? { background: "var(--danger)" } : undefined}></span>
              {creditsLeft} créditos · de {access.creditsTotal}
            </span> :

          <span className="tag"><span className="dot" style={{ background: "var(--ok)" }}></span>cuenta NQS · workspace activo</span>
          }
          {hasCredits &&
          <>
              <button
              className="btn sm secondary"
              onClick={simulatePurchase}
              title={`DEV: simula que el usuario consume 1 crédito dentro de ${tool.name}`}>
              
                · {tool.id === "threedsky" ? "simular compra" : "simular generación"} (-1)
              </button>
              <button className="btn sm" onClick={() => setShowRequestModal(true)}>
                pedir más créditos
              </button>
            </>
          }
          {!hasCredits &&
          <div className="session-clock" title="Tu sesión queda activa hoy">
              <div className="ring">
                <svg width="28" height="28" viewBox="0 0 28 28">
                  <circle className="bg" cx="14" cy="14" r="11" />
                  <circle className="fg" cx="14" cy="14" r="11"
                strokeDasharray={C} strokeDashoffset={C * (1 - pct)} strokeLinecap="round" />
                </svg>
              </div>
              <span>{h}h {String(m).padStart(2, "0")}m</span>
            </div>
          }
        </div>
      </div>

      <div className="tool-view-body">
        {tool.id === "claude" ? <ClaudeMock /> : <GenericMock tool={tool} immersive={isImmersive} onBack={onBack} />}

        {/* Overlay de "sin créditos" — sólo bloquea compras, no la navegación */}
        {showOutOfCreditsOverlay &&
        <CreditsBlockOverlay
          tool={tool}
          onClose={() => setShowOutOfCreditsOverlay(false)}
          onRequestMore={() => {setShowOutOfCreditsOverlay(false);setShowRequestModal(true);}} />

        }
      </div>

      {showRequestModal &&
      <CreditRequestModal
        tool={tool}
        currentCredits={creditsLeft}
        onClose={() => setShowRequestModal(false)}
        onSubmit={(payload) => {
          setShowRequestModal(false);
          if (onCreditRequest) onCreditRequest(payload);
        }} />

      }
    </div>);

}

// Overlay de bloqueo — aparece sobre el iframe cuando llega a 0 créditos.
// El usuario sigue pudiendo navegar y descargar gratis cerrando el overlay.
function CreditsBlockOverlay({ tool, onClose, onRequestMore }) {
  const isAssets = tool.id === "threedsky";
  const verb = isAssets ? "comprar nuevos modelos" : "generar contenido nuevo";
  const blockedLabel = isAssets ? "COMPRA BLOQUEADA" : "GENERACIÓN BLOQUEADA";
  return (
    <div className="credits-block-overlay" onClick={onClose}>
      <div className="credits-block-card" onClick={(e) => e.stopPropagation()}>
        <div className="t-eyebrow" style={{ color: "var(--danger)" }}>↳ {blockedLabel}</div>
        <div className="credits-block-title">Te quedaste sin créditos NQS.</div>
        <div className="credits-block-desc">
          Podés <strong>seguir navegando {tool.name}</strong>, {isAssets ?
          <>descargar items gratuitos y re-descargar modelos que ya hayas comprado antes</> :
          <>revisar tus generaciones anteriores y descargar lo que ya hayas creado</>}.
          Pero {verb} está pausado hasta que el admin habilite más créditos.
        </div>
        <div className="row" style={{ gap: 10, marginTop: 22, justifyContent: "center" }}>
          <button className="btn" onClick={onRequestMore}>pedir más créditos</button>
          <button className="btn secondary" onClick={onClose}>seguir navegando</button>
        </div>
        <div className="credits-block-meta t-meta dim">
          ↳ workspace nqs-creative · admin será notificado al pedir
        </div>
      </div>
    </div>);

}

// Modal para pedir créditos al admin
function CreditRequestModal({ tool, currentCredits, onClose, onSubmit }) {
  const [amount, setAmount] = React.useState(5);
  const [reason, setReason] = React.useState("");
  const canSubmit = amount > 0 && reason.trim().length >= 5;

  return (
    <div className="credit-modal-backdrop" onClick={onClose}>
      <div className="credit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="credit-modal-hd">
          <div className="t-eyebrow">↳ SOLICITUD DE CRÉDITOS · {tool.name}</div>
          <button className="credit-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="credit-modal-title">¿Cuántos créditos necesitás?</div>
        <div className="credit-modal-sub">
          Tenés <strong>{currentCredits}</strong> ahora. El admin recibirá tu pedido y lo aprueba o ajusta.
        </div>

        <label className="credit-modal-field">
          <span className="t-eyebrow">Cantidad</span>
          <div className="credit-modal-amount">
            <button onClick={() => setAmount((a) => Math.max(1, a - 1))}>−</button>
            <input
              type="number"
              value={amount}
              min={1}
              max={50}
              onChange={(e) => setAmount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))} />
            
            <button onClick={() => setAmount((a) => Math.min(50, a + 1))}>+</button>
            <span className="t-meta dim">créditos</span>
          </div>
        </label>

        <label className="credit-modal-field">
          <span className="t-eyebrow">Para qué</span>
          <textarea
            className="credit-modal-textarea"
            placeholder="Ej: Pitch Manhattan One — necesito 3 modelos de iluminación + 2 sofás sectional para los renders del lunes."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3} />
          
        </label>

        <div className="row" style={{ gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn secondary" onClick={onClose}>cancelar</button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => onSubmit({ tool: tool.id, amount, reason })}>
            
            enviar al admin →
          </button>
        </div>
      </div>
    </div>);

}

function ClaudeMock() {
  const [input, setInput] = React.useState("");
  const [msgs, setMsgs] = React.useState([
  { who: "ai", txt: "Bienvenida, Sofía. ¿Sobre qué proyecto trabajamos hoy?" },
  { who: "user", txt: "Necesito 8 variantes de copy para el pitch de Manhattan One — tono editorial, secas." },
  { who: "ai", txt: "Listo. Te propongo arrancar con 4 ángulos: vista, materialidad, ritmo de día, y vacío. ¿Querés que arme primero?" }]
  );
  return (
    <div className="claude-mock">
      <div className="t-eyebrow">↳ /projects/manhattan-one/copy-pitch</div>
      {msgs.map((m, i) =>
      <div key={i} className={`chat-msg ${m.who}`}>
          <div className={`av ${m.who === "ai" ? "ai" : ""}`}>{m.who === "ai" ? "C" : "SR"}</div>
          <div className="body">
            <div className="who">{m.who === "ai" ? "CLAUDE" : "SOFÍA"}</div>
            {m.txt}
          </div>
        </div>
      )}
      <div className="chat-input">
        <span className="t-meta">→</span>
        <input placeholder="Escribí tu mensaje…" value={input} onChange={(e) => setInput(e.target.value)} />
        <span className="kbd">↵</span>
      </div>
    </div>);

}

function ThreeDSkyMock({ access }) {
  const credits = access?.credits ?? 12;
  const total = access?.creditsTotal ?? 20;
  const used = total - credits;
  return (
    <div className="threedsky-mock">
      <div className="threedsky-hero">
        <div>
          <div className="t-eyebrow">↳ TUS CRÉDITOS · ESTE MES</div>
          <div className="threedsky-credits">
            <span className="threedsky-credits-n">{credits}</span>
            <span className="threedsky-credits-of">de {total}</span>
          </div>
          <div className="meter" style={{ width: 320, height: 4, marginTop: 8 }}>
            <div className="meter-fill" style={{ width: `${used / total * 100}%`, background: "#4FD1C5" }} />
          </div>
          <div className="t-meta" style={{ marginTop: 8 }}>{used} usados este mes · refresh el 1ro de mayo</div>
        </div>
        <div className="threedsky-cta">
          <button className="btn secondary">solicitar más créditos</button>
          <div className="t-meta dim" style={{ marginTop: 6, textAlign: "center" }}>el admin recibirá tu pedido</div>
        </div>
      </div>

      <div className="t-eyebrow" style={{ marginTop: 24, marginBottom: 12 }}>↳ EXPLORAR · MÁS DESCARGADOS</div>
      <div className="threedsky-grid">
        {[
        { n: "Eames Lounge", c: 1, k: "Furniture", h: 200 },
        { n: "Knoll Saarinen", c: 1, k: "Furniture", h: 220 },
        { n: "Oversized Floor Lamp", c: 1, k: "Lighting", h: 280 },
        { n: "Marble Coffee Table", c: 1, k: "Furniture", h: 180 },
        { n: "Vitra DSW Chair", c: 1, k: "Furniture", h: 240 },
        { n: "Linear Pendant Set", c: 2, k: "Lighting", h: 300 },
        { n: "Sectional Sofa · 3PL", c: 2, k: "Furniture", h: 260 },
        { n: "Brass Sconce Pair", c: 1, k: "Lighting", h: 200 }].
        map((it, i) =>
        <div key={i} className="threedsky-item">
            <div className="threedsky-item-img" style={{ height: it.h, background: `linear-gradient(${135 + i * 7}deg, oklch(0.${20 + i} 0.0${4 + i % 5} ${180 + i * 30}), var(--bg-elev-2))` }}>
              <span className="threedsky-item-tag">{it.c} crédito{it.c > 1 ? "s" : ""}</span>
            </div>
            <div className="threedsky-item-meta">
              <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, letterSpacing: "-0.01em" }}>{it.n}</div>
              <div className="t-meta">{it.k}</div>
            </div>
            <button className="btn sm" style={{ width: "100%", justifyContent: "center" }}>descargar</button>
          </div>
        )}
      </div>
    </div>);

}

function GenericMock({ tool, immersive, onBack }) {
  const host = tool.url ? new URL(tool.url).host : `${tool.vendor.toLowerCase()}.com`;
  return (
    <div className={`generic-mock ${immersive ? "is-immersive" : ""}`}>
      <div className="generic-mock-frame" style={{ background: tool.url ? "var(--bg-elev-2)" : `radial-gradient(circle at 30% 20%, ${tool.color}18, transparent 50%), var(--bg-elev-2)` }}>
        <div className="generic-mock-chrome">
          <span className="generic-mock-dot" style={{ background: "#ff5f56" }}></span>
          <span className="generic-mock-dot" style={{ background: "#ffbd2e" }}></span>
          <span className="generic-mock-dot" style={{ background: "#27c93f" }}></span>
          <span className="t-meta" style={{ marginLeft: 14 }}>{host} / nqs-creative</span>
        </div>
        <div className="generic-mock-content" style={{ padding: tool.url ? 0 : undefined }}>
          {tool.url ?
          <EmbeddedSite tool={tool} /> :

          <>
              <div style={{ fontSize: 88, color: tool.color, fontFamily: "var(--serif)", fontStyle: "italic", lineHeight: 1 }}>{tool.glyph}</div>
              <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 56, marginTop: 14, letterSpacing: "-0.025em", lineHeight: 1 }}>{tool.name}</div>
              <div className="t-meta" style={{ marginTop: 12, maxWidth: 420, textAlign: "center", lineHeight: 1.6 }}>{tool.desc}</div>
              <div className="row" style={{ gap: 8, marginTop: 22 }}>
                <button className="btn">empezar a crear →</button>
                <button className="btn secondary">ver tutoriales</button>
              </div>
            </>
          }
        </div>
      </div>
      {!immersive && <div className="t-meta dim" style={{ textAlign: "center", marginTop: 10 }}>workspace: nqs-creative · seat: sofia.romero</div>}
    </div>);

}

/*
 * DEV NOTE — EmbeddedSite
 * -----------------------------------------------------------------------------
 * En producción este componente renderiza un iframe a un SUBDOMINIO PROXY
 * controlado por NQS (ej: 3dsky.nqs.com) que actúa como reverse proxy hacia
 * el sitio externo (3dsky.org). El backend de NQS:
 *   1. Verifica que el usuario tenga permiso activo para esta tool.
 *   2. Inyecta la cookie/token de sesión del workspace (vault server-side).
 *   3. Reescribe headers (CSP/X-Frame-Options) y assets para que el iframe
 *      cargue sin bloqueos del navegador.
 * El usuario NUNCA ve credenciales ni un login; entra ya autenticado.
 *
 * La secuencia "verificando permiso → autenticando → cargando catálogo" de
 * abajo refleja los 3 pasos que el proxy hace server-side. En este prototipo
 * los animamos client-side a modo de placeholder visual.
 *
 * Tools sin proxy (ej: Claude) no usan este componente — ver ClaudeMock,
 * que asume acceso vía API key del workspace.
 * -----------------------------------------------------------------------------
 */
function EmbeddedSite({ tool }) {
  // step 0..3 controla el progreso visible del preloader.
  // El iframe se monta DESDE EL PRIMER RENDER y queda atrás como overlay,
  // así no se recarga cuando cambia el step y nunca lo desmontamos.
  const [step, setStep] = React.useState(0); // 0=verificando, 1=autenticando, 2=cargando, 3=listo
  const [iframeLoaded, setIframeLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);

  // Animación del preloader: 3 pasos × ~750ms cada uno
  React.useEffect(() => {
    const timers = [
    setTimeout(() => setStep(1), 750),
    setTimeout(() => setStep(2), 1500),
    setTimeout(() => setStep(3), 2300)];

    return () => timers.forEach(clearTimeout);
  }, []);

  // Hard timeout: si pasaron 9s y el iframe nunca cargó → error real
  React.useEffect(() => {
    if (iframeLoaded) return;
    const t = setTimeout(() => {if (!iframeLoaded) setError(true);}, 9000);
    return () => clearTimeout(t);
  }, [iframeLoaded]);

  const onIframeLoad = () => setIframeLoaded(true);

  const retry = () => {
    setStep(0);
    setIframeLoaded(false);
    setError(false);
    // re-trigger preloader animation
    [
    setTimeout(() => setStep(1), 750),
    setTimeout(() => setStep(2), 1500),
    setTimeout(() => setStep(3), 2300)];

  };

  // El preloader se muestra hasta que step===3 Y el iframe haya cargado
  const showPreloader = !error && (step < 3 || !iframeLoaded);

  const steps = [
  "verificando permiso",
  "autenticando con sesión compartida",
  "cargando catálogo"];


  return (
    <div className="embed-wrap">
      {/* Iframe SIEMPRE montado, en el fondo. Nunca se desmonta para evitar recargas. */}
      <iframe
        src={tool.url}
        title={tool.name}
        onLoad={onIframeLoad}
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#fff" }}
        allow="autoplay; fullscreen; clipboard-read; clipboard-write"
        referrerPolicy="no-referrer" />
      

      {/* Overlay de preloader. Se quita cuando todo cargó. */}
      {showPreloader &&
      <div className="embed-overlay">
          {error ?
        <div className="embed-fallback">
              <div className="embed-fallback-glyph" style={{ color: tool.color }}>{tool.glyph}</div>
              <div className="embed-fallback-title">No pudimos abrir {tool.name}</div>
              <div className="embed-fallback-desc">
                El proxy de sesión compartida no respondió a tiempo. Esto suele resolverse en segundos —
                probá reintentar.
              </div>
              <div className="row" style={{ gap: 10, marginTop: 22, justifyContent: "center" }}>
                <button className="btn" onClick={retry}>↻ reintentar</button>
              </div>
              <div className="embed-fallback-meta t-meta dim">
                ↳ proxy: {tool.id}.nqs.com · workspace nqs-creative
              </div>
            </div> :

        <div className="embed-auth">
              <div className="embed-auth-glyph" style={{ color: tool.color }}>{tool.glyph}</div>
              <div className="embed-auth-title">{tool.name}</div>
              <div className="embed-auth-sub t-meta">↳ acceso compartido · workspace nqs-creative</div>
              <div className="embed-auth-steps">
                {steps.map((s, i) =>
            <div key={i} className={`embed-auth-step ${step > i ? "done" : step === i ? "active" : "pending"}`}>
                    <span className="embed-auth-step-mark">
                      {step > i ? "✓" : step === i ? <span className="embed-auth-spinner" /> : "·"}
                    </span>
                    <span className="embed-auth-step-label">{s}</span>
                  </div>
            )}
              </div>
              {step >= 3 && !iframeLoaded &&
          <div className="embed-auth-finalwait t-meta dim">esperando respuesta del catálogo…</div>
          }
            </div>
        }
        </div>
      }
    </div>);

}

// ========================== ADMIN ==========================
function AdminScreen({ onApprove, onReject, pending }) {
  const [tab, setTab] = React.useState("overview");

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>↳ PANEL DE ADMINISTRACIÓN</div>
          <h1 className="page-title">Quién hace <em>qué</em>, ahora.</h1>
          <div className="page-sub">Permisos, consumo, alertas y auditoría en una sola vista.</div>
        </div>
        <div className="page-meta">
          <div>EQUIPO ACTIVO</div>
          <strong>9 de 45</strong>
          <div>ALERTAS HOY</div>
          <strong style={{ color: "var(--danger)" }}>2 críticas</strong>
        </div>
      </div>

      <div className="hub-toolbar" style={{ marginBottom: 20 }}>
        <div className="hub-filters">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
          <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Aprobaciones · {pending.length}</button>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Usuarios · permisos</button>
          <button className={tab === "credits" ? "active" : ""} onClick={() => setTab("credits")}>3DSky · créditos</button>
          <button className={tab === "shield" ? "active" : ""} onClick={() => setTab("shield")}>Shield · prompts</button>
          <button className={tab === "snaps" ? "active" : ""} onClick={() => setTab("snaps")}>Capturas</button>
        </div>
        <div className="spacer" />
        <span className="tag"><span className="dot pulse" style={{ background: "var(--ok)" }}></span>SLACK · #nqs-ai conectado</span>
        <span className="tag"><span className="dot" style={{ background: "var(--ok)" }}></span>WHATSAPP +54 11 …</span>
      </div>

      {tab === "overview" && <AdminOverview pending={pending} />}
      {tab === "requests" && <AdminRequests pending={pending} onApprove={onApprove} onReject={onReject} />}
      {tab === "credits" && <AdminCredits />}
      {tab === "users" && <AdminUsers />}
      {tab === "shield" && <AdminShield />}
      {tab === "snaps" && <AdminSnaps />}
    </div>);

}

function AdminOverview({ pending }) {
  return (
    <>
      <div className="admin-grid" style={{ marginBottom: 14 }}>
        <StatTile label="↳ TOKENS · HOY" value="142.8" unit="K" delta={12} />
        <StatTile label="↳ COSTO · HOY" value="$48.20" delta={-4} accent="var(--accent)" />
        <StatTile label="↳ SESIONES" value="34" delta={22} />
      </div>

      <div className="col-2">
        <div className="card">
          <div className="card-hd">
            <div className="t-eyebrow">↳ CONSUMO POR DÍA · ÚLTIMA SEMANA</div>
            <span className="t-meta">tokens · 0–1M</span>
          </div>
          <div className="card-pad">
            <BarChart data={TOKEN_SERIES} />
          </div>
        </div>
        <div className="card">
          <div className="card-hd">
            <div className="t-eyebrow">↳ COLA DE APROBACIONES · {pending.length}</div>
            <span className="tag warn"><span className="dot pulse"></span>esperando</span>
          </div>
          <div className="card-pad" style={{ paddingTop: 4 }}>
            {pending.slice(0, 3).map((r) => {
              const tool = TOOLS.find((t) => t.id === r.tool);
              return (
                <div key={r.id} className="req-row" style={{ gridTemplateColumns: "30px 1fr 0.6fr auto" }}>
                  <div className="av-md">{r.user.initials}</div>
                  <div>
                    <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, letterSpacing: "-0.01em" }}>
                      {r.user.name} <span className="t-meta">→ {tool.name}</span>
                    </div>
                    <div className="t-meta dim" style={{ marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>"{r.reason}"</div>
                  </div>
                  <div className="t-meta">{r.duration}</div>
                  <span className="t-meta">{r.at}</span>
                </div>);

            })}
          </div>
        </div>
      </div>

      <div className="col-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-hd">
            <div className="t-eyebrow">↳ ACTIVIDAD EN VIVO</div>
            <span className="t-meta">últimas 60 min</span>
          </div>
          <div className="card-pad" style={{ paddingTop: 4 }}>
            {ACTIVITY.map((a, i) =>
            <div key={i} className={`activity-row ${a.flag === "danger" ? "danger" : ""}`}>
                <div className="t">{a.t}</div>
                <div>
                  <strong className="what" style={{ fontWeight: 500 }}>{a.u}</strong> <span className="muted">{a.what}</span> <strong style={{ fontWeight: 500 }}>{a.target}</strong> <span className="t-meta dim">· {a.meta}</span>
                </div>
                {a.flag === "danger" && <span className="tag danger"><span className="dot pulse"></span>flag</span>}
              </div>
            )}
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="card-hd">
              <div className="t-eyebrow">↳ TOP TOOLS · SEMANA</div>
            </div>
            <div className="card-pad" style={{ paddingTop: 8 }}>
              {[
              { n: "Weavy", pct: 0.86 },
              { n: "Claude", pct: 0.71 },
              { n: "Runway", pct: 0.52 },
              { n: "Kling", pct: 0.34 },
              { n: "ElevenLabs", pct: 0.18 }].
              map((t, i) =>
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <span className="t-eyebrow" style={{ width: 26 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18, width: 110, letterSpacing: "-0.01em" }}>{t.n}</span>
                  <div className="meter" style={{ flex: 1 }}>
                    <div className="meter-fill" style={{ width: `${t.pct * 100}%`, background: "var(--accent)" }} />
                  </div>
                  <span className="t-meta" style={{ width: 36, textAlign: "right" }}>{Math.round(t.pct * 100)}%</span>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ background: "rgba(255, 92, 92, 0.04)", borderColor: "rgba(255, 92, 92, 0.32)" }}>
            <div className="card-hd" style={{ borderColor: "rgba(255, 92, 92, 0.22)" }}>
              <div className="t-eyebrow" style={{ color: "var(--danger)" }}>↳ ALERTAS CRÍTICAS · 2</div>
              <span className="t-meta">notificadas a Slack + WA</span>
            </div>
            <div className="card-pad" style={{ paddingTop: 8 }}>
              <div style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18, letterSpacing: "-0.01em" }}>Intento de extracción de system prompt</div>
                <div className="t-meta dim" style={{ marginTop: 2 }}>11:15 · Lucía Méndez · Claude · regla SP-PROT-01</div>
              </div>
              <div style={{ padding: "8px 0" }}>
                <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18, letterSpacing: "-0.01em" }}>Solicitud de exportar workflows internos</div>
                <div className="t-meta dim" style={{ marginTop: 2 }}>10:03 · Mateo Lugo · Claude · regla IP-LEAK-04</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>);

}

function AdminRequests({ pending, onApprove, onReject }) {
  return (
    <div className="card">
      <div className="card-hd">
        <div className="t-eyebrow">↳ COLA DE APROBACIONES — {pending.length} PENDIENTES</div>
        <div className="row">
          <button className="btn ghost sm">filtrar</button>
          <button className="btn sm secondary">aprobar todo</button>
        </div>
      </div>
      <div style={{ padding: "0 18px 8px" }}>
        <div className="req-row" style={{ borderBottom: "1px solid var(--line-strong)", color: "var(--fg-mute)", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase" }}>
          <div></div>
          <div>USUARIO</div>
          <div>HERRAMIENTA</div>
          <div>MOTIVO</div>
          <div>DURACIÓN</div>
          <div style={{ textAlign: "right" }}>ACCIÓN</div>
        </div>
        {pending.map((r) => {
          const tool = TOOLS.find((t) => t.id === r.tool);
          return (
            <div key={r.id} className="req-row">
              <div className="av-md">{r.user.initials}</div>
              <div>
                <div style={{ fontWeight: 500 }}>{r.user.name}</div>
                <div className="t-meta dim">{r.user.role} · {r.at}</div>
              </div>
              <div>
                <span style={{ color: tool.color, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18 }}>{tool.glyph}</span>
                <span style={{ marginLeft: 6, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18, letterSpacing: "-0.01em" }}>{tool.name}</span>
              </div>
              <div className="t-meta" style={{ color: "var(--fg)" }}>"{r.reason}"</div>
              <div><span className="tag">{r.duration}</span></div>
              <div className="req-row-actions">
                <button className="btn sm secondary" onClick={() => onReject(r.id)}>rechazar</button>
                <button className="btn sm" onClick={() => onApprove(r.id)}>aprobar →</button>
              </div>
            </div>);

        })}
      </div>
    </div>);

}

function AdminUsers() {
  // matriz de permisos: por usuario y por tool
  const [grid, setGrid] = React.useState(() => {
    const states = ["active", "scheduled", "off", "off", "off", "pending"];
    return USERS.map((u, i) => TOOLS.map((t, j) => {
      const k = (i * 7 + j * 3) % 11;
      if (k < 3) return "active";
      if (k < 5) return "scheduled";
      if (k < 6) return "pending";
      return "off";
    }));
  });

  const cycle = (i, j) => {
    setGrid((g) => g.map((row, ri) => ri === i ? row.map((c, ci) => {
      if (ci !== j) return c;
      return c === "active" ? "scheduled" : c === "scheduled" ? "off" : c === "off" ? "active" : "active";
    }) : row));
  };

  const labelFor = (s) => s === "active" ? "ON" : s === "scheduled" ? "9–19" : s === "pending" ? "REQ" : "OFF";

  return (
    <div className="card">
      <div className="card-hd">
        <div className="t-eyebrow">↳ MATRIZ DE PERMISOS — {USERS.length} usuarios × {TOOLS.length} tools</div>
        <div className="row">
          <span className="tag ok"><span className="dot"></span>ON · acceso libre</span>
          <span className="tag accent"><span className="dot"></span>9–19 · ventana</span>
          <span className="tag warn"><span className="dot"></span>REQ · pendiente</span>
          <span className="tag"><span className="dot"></span>OFF</span>
        </div>
      </div>
      <div style={{ padding: "0 18px 14px" }}>
        <div className="user-table">
          <div className="user-table-row head">
            <div>USUARIO</div>
            <div>ROL</div>
            {TOOLS.map((t) => <div key={t.id}>{t.name}</div>)}
            <div style={{ textAlign: "right" }}>ACC</div>
          </div>
          {USERS.map((u, i) =>
          <div key={u.id} className="user-table-row">
              <div className="row">
                <div className="av-md">{u.initials}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>{u.name}</div>
                  <div className="t-meta dim">{u.dept}</div>
                </div>
              </div>
              <div className="t-meta">{u.role}</div>
              {TOOLS.map((t, j) =>
            <div key={t.id} className={`access-cell ${grid[i][j]}`} onClick={() => cycle(i, j)}>
                  {labelFor(grid[i][j])}
                </div>
            )}
              <div style={{ textAlign: "right" }}>
                <button className="btn ghost sm">⋯</button>
              </div>
            </div>
          )}
        </div>
        <div className="t-meta dim" style={{ paddingTop: 12 }}>↳ click en una celda para ciclar el estado · ON / 9–19 / OFF</div>
      </div>
    </div>);

}

function AdminShield() {
  return (
    <div className="col">
      <div className="col-3">
        <StatTile label="↳ PROMPTS HOY" value="487" unit="prompts" delta={8} />
        <StatTile label="↳ FLAGS" value="14" unit="bloqueados" delta={-22} accent="var(--warn)" />
        <StatTile label="↳ INTENTOS DE EXTRACCIÓN" value="2" unit="críticos" accent="var(--danger)" />
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="t-eyebrow">↳ PROMPTS BLOQUEADOS / EN REVISIÓN</div>
          <div className="row">
            <span className="tag"><span className="dot" style={{ background: "var(--danger)" }}></span>SP-PROT-01</span>
            <span className="tag"><span className="dot" style={{ background: "var(--danger)" }}></span>IP-LEAK-04</span>
            <span className="tag"><span className="dot" style={{ background: "var(--warn)" }}></span>OFFTOPIC-02</span>
          </div>
        </div>
        <div style={{ padding: "0 18px 14px" }}>
          <div className="flag-row" style={{ borderBottom: "1px solid var(--line-strong)", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
            <div>HORA</div>
            <div>EXTRACTO</div>
            <div>USUARIO</div>
            <div>TOOL</div>
            <div>REGLA</div>
            <div style={{ textAlign: "right" }}>ACCIÓN</div>
          </div>
          {FLAGGED_PROMPTS.map((f) =>
          <div key={f.id} className={`flag-row ${f.severity === "high" ? "" : f.severity === "med" ? "med" : "low"}`}>
              <div className="t-meta">{f.at}{f.at2 ? ` ${f.at2}` : ""}</div>
              <div className="excerpt">"{f.excerpt}"</div>
              <div>{f.user}</div>
              <div className="t-meta">{f.tool}</div>
              <div className="t-meta">{f.rule}</div>
              <div style={{ textAlign: "right" }}>
                <button className="btn ghost sm">ver</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="t-eyebrow">↳ REGLAS ACTIVAS · 7</div>
          <button className="btn sm secondary">+ nueva regla</button>
        </div>
        <div className="card-pad" style={{ paddingTop: 8 }}>
          {[
          { id: "SP-PROT-01", desc: "Bloquear extracción de system prompts y meta-instrucciones", level: "high" },
          { id: "IP-LEAK-04", desc: "Detectar pedido de export de workflows / proyectos NQS", level: "high" },
          { id: "OFFTOPIC-02", desc: "Marcar tareas no relacionadas con proyectos de NQS", level: "med" },
          { id: "TOKENS-CAP-1", desc: "Cap diario de 50k tokens por usuario en Claude", level: "med" },
          { id: "AFTER-HRS-09", desc: "Bloquear acceso fuera de 09:00–19:00 ART (excepto admin)", level: "high" },
          { id: "PII-MASK-03", desc: "Enmascarar emails y teléfonos de clientes en outputs", level: "med" },
          { id: "FILE-SCAN-02", desc: "Escanear adjuntos por contenido sensible antes de subir", level: "low" }].
          map((r) =>
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 60px", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 11 }}>{r.id}</span>
              <span style={{ fontSize: 12 }}>{r.desc}</span>
              <span className={`tag ${r.level === "high" ? "danger" : r.level === "med" ? "warn" : ""}`}>{r.level.toUpperCase()}</span>
              <button className="btn ghost sm">⋯</button>
            </div>
          )}
        </div>
      </div>
    </div>);

}

function AdminSnaps() {
  return (
    <div className="col">
      <div className="card card-pad" style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div className="t-eyebrow">↳ CAPTURAS PROGRAMADAS</div>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 24, letterSpacing: "-0.01em", marginTop: 6 }}>
            Cada <em style={{ color: "var(--accent)" }}>5 minutos</em>, snapshot de la pantalla del usuario activo.
          </div>
          <div className="t-meta" style={{ marginTop: 6, lineHeight: 1.6 }}>Solo durante sesiones autorizadas. Se borran a los 30 días. El usuario sabe que está siendo grabado (banner permanente en cada tool).</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <StatTile label="HOY" value="142" unit="caps" />
          <StatTile label="EN REVISIÓN" value="3" unit="flags" accent="var(--warn)" />
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="t-eyebrow">↳ ÚLTIMAS CAPTURAS · TODOS LOS USUARIOS</div>
          <div className="row">
            <span className="tag ok"><span className="dot"></span>ok · 138</span>
            <span className="tag warn"><span className="dot"></span>review · 3</span>
            <span className="tag danger"><span className="dot"></span>flag · 1</span>
          </div>
        </div>
        <div className="card-pad">
          <div className="shot-grid">
            {SCREENSHOTS.map((s) =>
            <div key={s.id} className="shot">
                <div className="shot-thumb" data-label={`${s.tool.toUpperCase()} · ${s.at}`}></div>
                <div className="shot-meta">
                  <span>{s.user.split(" ")[0]}</span>
                  <span className={`tag ${s.verdict === "ok" ? "ok" : s.verdict === "review" ? "warn" : "danger"}`}>
                    {s.verdict}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>);

}

// ========================== ADMIN CREDITS (3DSky) ==========================
function AdminCredits() {
  const initialPool = 240;
  const [poolTotal, setPoolTotal] = React.useState(initialPool);
  const [allocations, setAllocations] = React.useState(() => {
    return USERS.map((u, i) => ({ user: u, credits: [12, 8, 5, 0, 20, 0][i] || 0, used: [3, 2, 5, 0, 14, 0][i] || 0 }));
  });
  const allocated = allocations.reduce((s, a) => s + a.credits, 0);
  const remaining = poolTotal - allocated;

  const adjust = (i, delta) => {
    setAllocations((a) => a.map((row, ri) => ri === i ? { ...row, credits: Math.max(row.used, row.credits + delta) } : row));
  };

  return (
    <div className="col">
      <div className="card card-pad" style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div className="t-eyebrow">↳ POOL DE CRÉDITOS · 3DSKY</div>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 32, letterSpacing: "-0.02em", marginTop: 4, lineHeight: 1.1 }}>
            Asigná y reasigná créditos a tu equipo. Una vez que un usuario los gasta, no puede gastar más hasta que vos lo habilites.
          </div>
        </div>
      </div>

      <div className="col-3">
        <StatTile label="↳ POOL TOTAL" value={poolTotal} unit="créditos" />
        <StatTile label="↳ ASIGNADOS" value={allocated} unit={`/${poolTotal}`} accent="var(--accent)" />
        <StatTile label="↳ DISPONIBLE" value={remaining} unit="para repartir" accent={remaining < 20 ? "var(--warn)" : "var(--ok)"} />
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="t-eyebrow">↳ ASIGNACIÓN POR USUARIO</div>
          <div className="row">
            <button className="btn ghost sm">comprar más créditos</button>
            <button className="btn sm secondary">historial</button>
          </div>
        </div>
        <div style={{ padding: "0 18px 14px" }}>
          <div className="user-table-row head" style={{ gridTemplateColumns: "1.4fr 0.8fr 1fr 0.8fr 180px 60px" }}>
            <div>USUARIO</div>
            <div>ROL</div>
            <div>USO MENSUAL</div>
            <div>DISPONIBLES</div>
            <div>AJUSTAR</div>
            <div></div>
          </div>
          {allocations.map((row, i) => {
            const free = row.credits - row.used;
            const pct = row.credits === 0 ? 0 : row.used / row.credits * 100;
            return (
              <div key={row.user.id} className="user-table-row" style={{ gridTemplateColumns: "1.4fr 0.8fr 1fr 0.8fr 180px 60px" }}>
                <div className="row">
                  <div className="av-md">{row.user.initials}</div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{row.user.name}</div>
                    <div className="t-meta dim">{row.user.dept}</div>
                  </div>
                </div>
                <div className="t-meta">{row.user.role}</div>
                <div>
                  <div className="meter" style={{ width: "100%" }}>
                    <div className="meter-fill" style={{ width: `${pct}%`, background: pct > 80 ? "var(--warn)" : "#4FD1C5" }} />
                  </div>
                  <div className="t-meta" style={{ marginTop: 4 }}>{row.used} / {row.credits} este mes</div>
                </div>
                <div>
                  <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 26, letterSpacing: "-0.02em", color: free === 0 ? "var(--danger)" : free < 3 ? "var(--warn)" : "var(--fg)" }}>
                    {free}
                  </span>
                  <span className="t-meta" style={{ marginLeft: 4 }}>cr.</span>
                </div>
                <div className="row" style={{ gap: 4, justifyContent: "center" }}>
                  <button className="btn sm secondary" onClick={() => adjust(i, -1)}>−</button>
                  <button className="btn sm secondary" onClick={() => adjust(i, -5)}>−5</button>
                  <button className="btn sm" onClick={() => adjust(i, 1)}>+</button>
                  <button className="btn sm" onClick={() => adjust(i, 5)}>+5</button>
                </div>
                <div style={{ textAlign: "right" }}>
                  <button className="btn ghost sm">⋯</button>
                </div>
              </div>);

          })}
        </div>
      </div>
    </div>);

}


// ========================== LOGIN TICKER (4 variantes) ==========================
const TICKER_PHRASES = [
{ kicker: "MANIFIESTO", text: "No reemplazamos el oficio. Lo aceleramos.", accent: "#D97757" },
{ kicker: "PRINCIPIO", text: "Una llave para todo el stack creativo.", accent: "#9B7EFF" },
{ kicker: "MÉTODO", text: "Dirigido, no generado. Siempre con criterio.", accent: "#5BC0EB" },
{ kicker: "VALOR", text: "Velocidad sin perder el oficio.", accent: "#4FD1C5" },
{ kicker: "ENFOQUE", text: "Dueños de nuestro stack, dueños de nuestra obra.", accent: "#FF6B9D" },
{ kicker: "RITMO", text: "Iterar diez veces antes que pulir una.", accent: "#FFB800" },
{ kicker: "OFICIO", text: "La idea manda. La herramienta acompaña.", accent: "#FF6B6B" },
{ kicker: "DISCIPLINA", text: "Hecho a mano, con la potencia de la máquina.", accent: "#A78BFA" }];


function LoginTicker({ variant = "cube" }) {
  // variant: "cube" (2 cols desfasadas) | "stack" (apila) | "marquee" (scroll horizontal)
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % TICKER_PHRASES.length), 4200);
    return () => clearInterval(id);
  }, []);

  if (variant === "marquee") {
    const items = [...TICKER_PHRASES, ...TICKER_PHRASES];
    return (
      <div className="login-marquee" aria-label="actualidad NQS">
        <div className="login-marquee-track">
          {items.map((p, k) =>
          <span key={k} className="login-marquee-item">
              <em style={{ color: p.accent, fontStyle: "normal", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em", marginRight: 8 }}>↳ {p.kicker}</em>
              <span>{p.text}</span>
              <span className="login-marquee-sep">·</span>
            </span>
          )}
        </div>
      </div>);

  }

  if (variant === "stack") {
    return (
      <div className="login-stack" aria-label="actualidad NQS">
        <div className="login-stack-window">
          {TICKER_PHRASES.map((p, k) =>
          <div key={k} className={"login-stack-row " + (k === i ? "is-active" : "")}>
              <em style={{ color: p.accent, fontStyle: "normal", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em" }}>↳ {p.kicker}</em>
              <div className="login-stack-text">{p.text}</div>
            </div>
          )}
        </div>
        <div className="login-stack-pips">
          {TICKER_PHRASES.map((_, k) => <span key={k} className={k === i ? "is-active" : ""} />)}
        </div>
      </div>);

  }

  // "cube" — DOS columnas con relojes independientes
  return (
    <div className="login-cube" aria-label="actualidad NQS">
      <div className="login-cube-row">
        <TickerCol startAt={0} interval={3800} />
        <div className="login-cube-divider" />
        <TickerCol startAt={3} interval={5200} />
      </div>
    </div>);

}

function TickerCol({ startAt = 0, interval = 4200 }) {
  const [k, setK] = React.useState(startAt);
  React.useEffect(() => {
    const id = setInterval(() => setK((x) => (x + 1) % TICKER_PHRASES.length), interval);
    return () => clearInterval(id);
  }, [interval]);
  return (
    <div className="login-cube-stage">
      {TICKER_PHRASES.map((p, idx) => {
        const offset = (idx - k + TICKER_PHRASES.length) % TICKER_PHRASES.length;
        return (
          <div key={idx} className="login-cube-face" data-offset={offset}>
            <em style={{ color: p.accent, fontStyle: "normal", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em" }}>↳ {p.kicker}</em>
            <div className="login-cube-text">{p.text}</div>
          </div>);

      })}
    </div>);

}

Object.assign(window, { LoginScreen, HubScreen, ToolView, AdminScreen, AdminCredits, LoginTicker });


// ========================== TUTORIALES ==========================
const TUTORIALS = [
{
  id: "weavy",
  name: "Weavy end-to-end",
  file: "tutorials/how-weavy.html",
  lead: "Anatomía de un grafo: del moodboard al render final.",
  tools: ["Weavy"],
  duration: "22 min",
  updated: "hace 2 días",
  color: "#9B7EFF",
  glyph: "◇",
  image: "tutorials/img/weavy.jpg"
},
{
  id: "reframes",
  name: "Reframes",
  file: "tutorials/how-reframes.html",
  lead: "Reencuadrar y extender material existente sin perder la toma.",
  tools: ["Runway", "Weavy"],
  duration: "11 min",
  updated: "hace 5 días",
  color: "#FF6B9D",
  glyph: "⊞",
  image: "tutorials/img/reframes.jpg"
},
{
  id: "in-motion",
  name: "In Motion",
  file: "tutorials/how-in-motion.html",
  lead: "Imagen a video — cómo dirigir movimiento sin que se sienta AI.",
  tools: ["Kling", "Runway", "Highsfield"],
  duration: "14 min",
  updated: "hace 6 días",
  color: "#5BC0EB",
  glyph: "▷",
  image: "tutorials/img/in-motion.jpg"
},
{
  id: "ground-up",
  name: "Ground Up",
  file: "tutorials/how-ground-up.html",
  lead: "Crear un proyecto desde cero — del brief al primer corte.",
  tools: ["Claude", "Weavy", "Kling"],
  duration: "12 min",
  updated: "hace 3 días",
  color: "#D97757",
  glyph: "▤",
  image: "tutorials/img/ground-up.jpg"
},
{
  id: "mock-up",
  name: "Mock Up",
  file: "tutorials/how-mock-up.html",
  lead: "Mocks de producto y packaging fotorrealistas.",
  tools: ["Weavy", "Claude"],
  duration: "9 min",
  updated: "hace 12 días",
  color: "#9B7EFF",
  glyph: "▣",
  image: "tutorials/img/mock-up.jpg"
},
{
  id: "maquette",
  name: "Maquette",
  file: "tutorials/how-maquette.html",
  lead: "Mockups arquitectónicos: del 3D base al render hi-fi.",
  tools: ["3DSky", "Weavy", "Runway"],
  duration: "18 min",
  updated: "hace 9 días",
  color: "#4FD1C5",
  glyph: "◈",
  image: "tutorials/img/maquette.jpg"
}];


function TutorialsScreen({ tutorialAccess, onRequestTutorials }) {
  const [openId, setOpenId] = React.useState(null);

  // sin acceso → gate
  if (tutorialAccess !== "active") {
    const isPending = tutorialAccess === "pending";
    return (
      <div className="page">
        <div className="page-hd">
          <div>
            <div className="t-eyebrow" style={{ marginBottom: 18 }}>↳ TUTORIALES NQS</div>
            <h1 className="page-title">Cómo usamos <em>cada herramienta</em>, acá adentro.</h1>
            <div className="page-sub">Recorridos cortos hechos por el equipo — de brief a render. <em style={{ color: "var(--accent)" }}>Acceso restringido.</em></div>
          </div>
          <div className="page-meta">
            <div>RECORRIDOS</div>
            <strong>{TUTORIALS.length}</strong>
            <div>ESTADO</div>
            <strong style={{ color: isPending ? "var(--warn)" : "var(--muted)" }}>{isPending ? "EN REVISIÓN" : "BLOQUEADO"}</strong>
          </div>
        </div>

        <div style={{
          marginTop: 24,
          padding: "56px 48px",
          border: "1px solid var(--line)",
          borderRadius: 18,
          background: "var(--bg-elev)",
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 48,
          alignItems: "center",
          minHeight: 360
        }}>
          <div>
            <div className="t-eyebrow" style={{ marginBottom: 14, color: isPending ? "var(--warn)" : "var(--muted)" }}>
              {isPending ? "↳ SOLICITUD ENVIADA" : "↳ ACCESO RESTRINGIDO"}
            </div>
            <h2 style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0 }}>
              {isPending ?
              <>Tu pedido está <em style={{ color: "var(--warn)" }}>en revisión.</em></> :
              <>Pedí acceso al <em style={{ color: "var(--accent)" }}>módulo Tutoriales.</em></>}
            </h2>
            <p style={{ marginTop: 18, color: "var(--muted-2)", fontSize: 15, lineHeight: 1.55, maxWidth: 520 }}>
              {isPending ?
              "Te avisamos por mail apenas un admin lo apruebe. Suele tardar menos de un día." :
              "Es un único permiso — con eso accedés a los " + TUTORIALS.length + " recorridos. Los hacen Tomás, Lucía y Pedro a medida que aparecen herramientas nuevas."}
            </p>
            <div className="row" style={{ gap: 10, marginTop: 26 }}>
              <button
                className="btn"
                disabled={isPending}
                onClick={() => onRequestTutorials && onRequestTutorials()}
                style={{ opacity: isPending ? 0.5 : 1 }}>
                
                {isPending ? "solicitud enviada ✓" : "solicitar acceso →"}
              </button>
              {!isPending && <button className="btn secondary">ver el demo (1 min)</button>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {TUTORIALS.slice(0, 6).map((tu) =>
            <div key={tu.id} style={{
              position: "relative",
              aspectRatio: "1.4/1",
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: "linear-gradient(135deg, " + tu.color + "18, transparent 70%), var(--bg-elev-2)",
              padding: 14,
              overflow: "hidden",
              filter: "blur(0.5px)"
            }}>
                <div style={{ fontSize: 26, color: tu.color }}>{tu.glyph}</div>
                <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, marginTop: 10, lineHeight: 1.1 }}>{tu.name}</div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 30%, var(--bg-elev) 100%)", display: "grid", placeItems: "center" }}>
                  <span style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase" }}>🔒 bloqueado</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>);

  }

  // con acceso → tutorial abierto en iframe
  if (openId) {
    const tu = TUTORIALS.find((t) => t.id === openId);
    return (
      <div className="page" style={{ paddingTop: 0 }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "16px 0 18px", borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 14 }}>
            <button className="btn secondary sm" onClick={() => setOpenId(null)}>← volver</button>
            <div>
              <div className="t-eyebrow">↳ TUTORIAL</div>
              <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 22, letterSpacing: "-0.01em" }}>{tu.name}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <span className="t-meta">{tu.duration}</span>
            <span className="t-meta dim">·</span>
            <span className="t-meta">cubre: {tu.tools.join(" · ")}</span>
            <span className="t-meta dim">·</span>
            <span className="t-meta">act. {tu.updated}</span>
          </div>
        </div>
        <div style={{ marginTop: 14, border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", background: "#000", height: "calc(100vh - 220px)", minHeight: 540 }}>
          <iframe
            src={tu.file}
            title={tu.name}
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            allow="autoplay; fullscreen" />
          
        </div>
      </div>);

  }

  // grilla
  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>↳ TUTORIALES NQS</div>
          <h1 className="page-title">Cómo usamos <em>cada herramienta</em>, acá adentro.</h1>
          <div className="page-sub">Recorridos cortos, hechos por el equipo. No "qué es Claude" — es <em style={{ color: "var(--accent)" }}>cómo lo usamos en NQS.</em></div>
        </div>
        <div className="page-meta">
          <div>RECORRIDOS</div>
          <strong>{TUTORIALS.length}</strong>
          <div>ACTUALIZADO</div>
          <strong>hace 2 días</strong>
        </div>
      </div>

      <div className="t-eyebrow" style={{ marginBottom: 14 }}>↳ HOW-TO</div>
      <div className="tut-grid">
        {TUTORIALS.map((tu) =>
        <article
          key={tu.id}
          className="tut-card"
          style={{ "--tut-color": tu.color }}
          onClick={() => setOpenId(tu.id)}>
          
            <div className="tut-card-thumb" style={tu.image ? { backgroundImage: `url(${tu.image})` } : { background: "linear-gradient(135deg, " + tu.color + "30, transparent 60%), var(--bg-elev-2)" }}>
              {tu.image && <div className="tut-card-thumb-veil" />}
              <span className="tut-card-glyph" style={{ color: tu.image ? "#fff" : tu.color, textShadow: tu.image ? "0 2px 14px rgba(0,0,0,0.4)" : "none", position: "relative", zIndex: 2 }}>{tu.glyph}</span>
              <span className="tut-card-dur" style={{ zIndex: 2 }}>{tu.duration}</span>
            </div>
            <div className="tut-card-body">
              <div className="t-eyebrow">↳ HOW-TO</div>
              <div className="tut-card-title">{tu.name}</div>
              <div className="tut-card-lead">{tu.lead}</div>
              <div className="tut-card-foot">
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {tu.tools.map((tool) => <span key={tool} className="tag tut-tool-tag">{tool}</span>)}
                </div>
                <span className="t-meta dim">act. {tu.updated}</span>
              </div>
            </div>
          </article>
        )}
      </div>
    </div>);

}

Object.assign(window, { TutorialsScreen, TUTORIALS });