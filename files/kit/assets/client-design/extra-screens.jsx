/* global React, USERS, ME */

// ========================== PLAYBOOK ==========================
function PlaybookScreen() {
  const SECTIONS = [
    {
      n: "01",
      title: "Cómo escribimos un brief",
      lead: "Antes de prender una herramienta, dejá el brief escrito. Tres bloques: contexto, restricciones, output esperado.",
      tags: ["proceso", "kickoff"],
      author: "Tomás F.",
      updated: "hace 3 días",
    },
    {
      n: "02",
      title: "Voz NQS · qué SÍ y qué NO",
      lead: "Editorial, seca, con humor. Nunca corporate. Nunca emojis en deliverables. Nunca \"unlock\" ni \"empower\".",
      tags: ["copywriting", "tono"],
      author: "Lucía M.",
      updated: "hace 1 semana",
    },
    {
      n: "03",
      title: "Cadena Claude → Weavy → Kling",
      lead: "Workflow estándar para un pitch visual. Cuándo cortar. Cuándo volver al brief. Qué entregar.",
      tags: ["workflow", "pitch"],
      author: "Pedro O.",
      updated: "hace 4 días",
    },
    {
      n: "04",
      title: "Gestión de créditos 3DSky",
      lead: "Pedí los créditos antes de arrancar el render. Si necesitás más, justificá en el modal. Si te sobran, devolvelos.",
      tags: ["assets", "presupuesto"],
      author: "Tomás F.",
      updated: "hace 2 semanas",
    },
    {
      n: "05",
      title: "Cómo presentamos AI a un cliente",
      lead: "Nunca decimos \"esto lo hizo la IA\". Decimos \"así dirigimos el proceso\". El crédito creativo es nuestro.",
      tags: ["clientes", "pitch"],
      author: "Tomás F.",
      updated: "hace 6 días",
    },
    {
      n: "06",
      title: "Versionado de proyectos",
      lead: "Carpetas: 01_brief, 02_research, 03_explore, 04_select, 05_final. Sin excepciones.",
      tags: ["proceso", "archivo"],
      author: "Lucía M.",
      updated: "hace 3 semanas",
    },
  ];

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>↳ PLAYBOOK NQS</div>
          <h1 className="page-title">Cómo trabajamos, <em>en una página.</em></h1>
          <div className="page-sub">Decisiones, procesos y opiniones que ya tomamos. Si tenés que preguntar dos veces lo mismo, es candidato a entrar acá.</div>
        </div>
        <div className="page-meta">
          <div>ENTRADAS</div>
          <strong>{SECTIONS.length}</strong>
          <div>ÚLTIMA EDICIÓN</div>
          <strong>hace 3 días</strong>
        </div>
      </div>

      <div className="playbook-grid">
        {SECTIONS.map((s) => (
          <article key={s.n} className="playbook-card">
            <div className="playbook-card-num t-eyebrow">↳ {s.n}</div>
            <h3 className="playbook-card-title">{s.title}</h3>
            <p className="playbook-card-lead">{s.lead}</p>
            <div className="playbook-card-foot">
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {s.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
              </div>
              <div className="t-meta dim">{s.author} · {s.updated}</div>
            </div>
            <button className="playbook-card-cta">leer →</button>
          </article>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div>
          <div className="t-eyebrow">↳ ¿FALTA UNA REGLA?</div>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 26, letterSpacing: "-0.02em", marginTop: 4, lineHeight: 1.1 }}>
            Si tomaste una decisión que va a repetirse, anotala acá.
          </div>
        </div>
        <button className="btn">+ nueva entrada</button>
      </div>
    </div>
  );
}

Object.assign(window, { PlaybookScreen });
