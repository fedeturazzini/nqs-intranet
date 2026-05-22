// =============================================================
// ORGANIGRAMA — datos reales NQS
// Fuente: nqs-dashboard.html (Town Hall, abril 2026)
// =============================================================

const ORG_NODES = [
  // Partners
  { id: "tincho", lv: 1, teamCount: 2, x: 156, y: 20, w: 140, h: 48, name: "Tincho", role: "Managing Partner", type: "person", accent: "#E8873C" },
  { id: "fran",   lv: 1, teamCount: 1, x: 456, y: 20, w: 140, h: 48, name: "Fran",   role: "Managing Partner", type: "person", accent: "#E8873C" },
  { id: "chule",  lv: 1, teamCount: 2, x: 764, y: 20, w: 180, h: 52, name: "Chule",  role: "Managing Partner + R&D", type: "person", accent: "#E8873C" },
  // Top depts
  { id: "people", x: 171, y: 110, w: 110, h: 32, name: "People", type: "dept", accent: "#D4537E" },
  { id: "admin",  x: 326, y: 110, w: 100, h: 32, name: "Admin",  type: "dept", accent: "#D85A30" },
  { id: "sales",  x: 471, y: 110, w: 110, h: 32, name: "Sales",  type: "dept", accent: "#1D9E75" },
  { id: "arte",   x: 749, y: 110, w: 210, h: 32, name: "Production", type: "dept", accent: "#7F77DD" },
  { id: "ia",     x: 986, y: 30,  w: 80,  h: 32, name: "R&D",    type: "dept", accent: "#7F77DD" },
  // Heads
  { id: "meme",  lv: 2, x: 166, y: 187, w: 120, h: 44, name: "Meme",   role: "Head of People", type: "person", accent: "#D4537E" },
  { id: "berni", lv: 2, teamCount: 1, x: 316, y: 187, w: 120, h: 44, name: "Berni",  role: "Head of F&A", type: "person", accent: "#D85A30" },
  { id: "valen", lv: 2, x: 481, y: 255, w: 90,  h: 40, name: "Valen",  role: "BD", type: "person", accent: "#1D9E75" },
  { id: "pablo", lv: 4, x: 336, y: 255, w: 80,  h: 34, name: "Pablo",  role: "", type: "person", accent: "#D85A30" },
  // HOP / HOS
  { id: "juli",   lv: 2, teamCount: 5, x: 656, y: 185, w: 150, h: 48, name: "Juli",   role: "HOP + AD Front", type: "person", accent: "#5BB8D4" },
  { id: "guille", lv: 2, teamCount: 5, x: 896, y: 185, w: 160, h: 48, name: "Guille", role: "HOS + AD Back", type: "person", accent: "#378ADD" },
  // PM dept + team
  { id: "pm",    x: 641, y: 278, w: 180, h: 32, name: "Project management", type: "dept", accent: "#7CC8DE" },
  { id: "vick",  lv: 3, x: 601, y: 345, w: 120, h: 44, name: "Vick",  role: "PM Lead", type: "person", accent: "#7CC8DE" },
  { id: "male",  lv: 4, x: 741, y: 345, w: 120, h: 38, name: "Male",  role: "PM", type: "person", accent: "#4AADCA" },
  { id: "dana",  lv: 4, x: 741, y: 390, w: 120, h: 38, name: "Dana",  role: "PM", type: "person", accent: "#4AADCA" },
  { id: "nacho", lv: 4, x: 741, y: 435, w: 120, h: 38, name: "Nacho", role: "PM", type: "person", accent: "#4AADCA" },
  { id: "sofi",  lv: 4, x: 741, y: 480, w: 120, h: 38, name: "Sofi",  role: "PM", type: "person", accent: "#4AADCA" },
  // Production sub-depts
  { id: "interactive", x: 891,  y: 278, w: 100, h: 32, name: "Interactive", type: "dept", accent: "#7AC4F0" },
  { id: "modeling",    x: 1026, y: 278, w: 100, h: 32, name: "Modeling",    type: "dept", accent: "#3B94E0" },
  { id: "threeD",      x: 1176, y: 278, w: 60,  h: 32, name: "3D",          type: "dept", accent: "#1B5FB5" },
  { id: "pp",          x: 1316, y: 278, w: 60,  h: 32, name: "PP",          type: "dept", accent: "#0D3D78" },
  { id: "it",          x: 1071, y: 193, w: 60,  h: 32, name: "IT",          type: "dept", accent: "#888780" },
  // TLs
  { id: "lucho", lv: 3, x: 886,  y: 345, w: 110, h: 44, name: "Lucho", role: "TL · Interactive", type: "person", accent: "#7AC4F0", members: ["Santi C.", "Gabi B."] },
  { id: "anto",  lv: 3, x: 1021, y: 345, w: 110, h: 44, name: "Anto",  role: "TL · Modeling",    type: "person", accent: "#3B94E0", members: ["Gonza", "Juli F.", "Agus L."] },
  { id: "gasti", lv: 3, x: 1151, y: 345, w: 110, h: 44, name: "Gasti", role: "TL · 3D",          type: "person", accent: "#1B5FB5", members: ["Fer", "Rodri", "Javi", "Ingrid", "Joe", "Exe", "Juani", "Cin", "Fran", "Nere", "Gavi", "San", "Nahue", "Gon"] },
  { id: "cefe",  lv: 3, x: 1291, y: 345, w: 110, h: 44, name: "Cefe",  role: "TL · PP",          type: "person", accent: "#0D3D78", members: ["Mati", "Fede", "Any", "Espi"] },
  // Artistas (lv 5)
  { id: "santic",     lv: 5, x: 901,  y: 420, w: 80, h: 28, name: "Santi C.", type: "person", accent: "#7AC4F0" },
  { id: "gabib",      lv: 5, x: 901,  y: 454, w: 80, h: 28, name: "Gabi B.",  type: "person", accent: "#7AC4F0" },
  { id: "gonza",      lv: 5, x: 1036, y: 420, w: 80, h: 28, name: "Gonza",    type: "person", accent: "#3B94E0" },
  { id: "julif",      lv: 5, x: 1036, y: 454, w: 80, h: 28, name: "Juli F.",  type: "person", accent: "#3B94E0" },
  { id: "agusl_m",    lv: 5, x: 1036, y: 488, w: 80, h: 28, name: "Agus L.",  type: "person", accent: "#3B94E0" },
  { id: "3d_fer",     lv: 5, x: 1131, y: 420, w: 70, h: 28, name: "Fer",      type: "person", accent: "#1B5FB5" },
  { id: "3d_rodri",   lv: 5, x: 1211, y: 420, w: 70, h: 28, name: "Rodri",    type: "person", accent: "#1B5FB5" },
  { id: "3d_javi",    lv: 5, x: 1131, y: 454, w: 70, h: 28, name: "Javi",     type: "person", accent: "#1B5FB5" },
  { id: "3d_ingrid",  lv: 5, x: 1211, y: 454, w: 70, h: 28, name: "Ingrid",   type: "person", accent: "#1B5FB5" },
  { id: "3d_joe",     lv: 5, x: 1131, y: 488, w: 70, h: 28, name: "Joe",      type: "person", accent: "#1B5FB5" },
  { id: "3d_exe",     lv: 5, x: 1211, y: 488, w: 70, h: 28, name: "Exe",      type: "person", accent: "#1B5FB5" },
  { id: "3d_juani",   lv: 5, x: 1131, y: 522, w: 70, h: 28, name: "Juani",    type: "person", accent: "#1B5FB5" },
  { id: "3d_cin",     lv: 5, x: 1211, y: 522, w: 70, h: 28, name: "Cin",      type: "person", accent: "#1B5FB5" },
  { id: "3d_fran",    lv: 5, x: 1131, y: 556, w: 70, h: 28, name: "Fran",     type: "person", accent: "#1B5FB5" },
  { id: "3d_nere",    lv: 5, x: 1211, y: 556, w: 70, h: 28, name: "Nere",     type: "person", accent: "#1B5FB5" },
  { id: "3d_gavi",    lv: 5, x: 1131, y: 590, w: 70, h: 28, name: "Gavi",     type: "person", accent: "#1B5FB5" },
  { id: "3d_san",     lv: 5, x: 1211, y: 590, w: 70, h: 28, name: "San",      type: "person", accent: "#1B5FB5" },
  { id: "3d_nahue",   lv: 5, x: 1131, y: 624, w: 70, h: 28, name: "Nahue",    type: "person", accent: "#1B5FB5" },
  { id: "3d_gon",     lv: 5, x: 1211, y: 624, w: 70, h: 28, name: "Gon",      type: "person", accent: "#1B5FB5" },
  { id: "pp_mati",    lv: 5, x: 1306, y: 420, w: 80, h: 28, name: "Mati",     type: "person", accent: "#0D3D78" },
  { id: "pp_fede",    lv: 5, x: 1306, y: 454, w: 80, h: 28, name: "Fede",     type: "person", accent: "#0D3D78" },
  { id: "pp_any",     lv: 5, x: 1306, y: 488, w: 80, h: 28, name: "Any",      type: "person", accent: "#0D3D78" },
  { id: "pp_espi",    lv: 5, x: 1306, y: 522, w: 80, h: 28, name: "Espi",     type: "person", accent: "#0D3D78" },
];

const ORG_EDGES = [
  ["tincho", "people"], ["tincho", "admin"], ["fran", "sales"], ["sales", "valen"],
  ["people", "meme"], ["admin", "berni"], ["berni", "pablo"],
  ["chule", "arte"], ["arte", "juli"], ["arte", "guille"],
  ["juli", "pm"], ["pm", "vick"], ["pm", "male"], ["pm", "dana"], ["pm", "nacho"], ["pm", "sofi"],
  ["guille", "interactive"], ["guille", "modeling"], ["guille", "threeD"], ["guille", "pp"],
  ["interactive", "lucho"], ["modeling", "anto"], ["threeD", "gasti"], ["pp", "cefe"],
  ["lucho", "santic"], ["lucho", "gabib"],
  ["anto", "gonza"], ["anto", "julif"], ["anto", "agusl_m"],
  ["gasti", "3d_fer"], ["gasti", "3d_rodri"], ["gasti", "3d_javi"], ["gasti", "3d_ingrid"],
  ["gasti", "3d_joe"], ["gasti", "3d_exe"], ["gasti", "3d_juani"], ["gasti", "3d_cin"],
  ["gasti", "3d_fran"], ["gasti", "3d_nere"], ["gasti", "3d_gavi"], ["gasti", "3d_san"],
  ["gasti", "3d_nahue"], ["gasti", "3d_gon"],
  ["cefe", "pp_mati"], ["cefe", "pp_fede"], ["cefe", "pp_any"], ["cefe", "pp_espi"],
];

const ORG_ROLE_DESC = {
  chule: { bullets: [
    "Lidera el departamento de R&D, con foco en investigación y aplicación de IA.",
    "Trabaja transversal, asignando tareas vinculadas a iniciativas de R&D.",
    "Colaboradores de R&D no cambian su línea de reporte.",
    "Comunicación constante con líderes/referentes de cada área.",
  ]},
  tincho: { bullets: ["Supervisa People y Admin.", "Berni (Head of F&A) reporta directo a Tincho."] },
  fran: { bullets: ["Supervisa Sales.", "Valen reporta directo a Fran.", "Lucho (TL Interactive) reporta a Fran para esquemas de productos."] },
  juli: { bullets: [
    "Asume el rol de AD para todos los proyectos.",
    "Continúa liderando Project Management.",
    "AD en cámaras y FD sin excepción; SD/FI/ER solo si PM lo solicita.",
    "Responsable creativa en key accounts.",
    "No interviene en bloqueos técnicos ni en daily de asignaciones.",
    "Reporta directamente a Chule.",
  ]},
  guille: { bullets: [
    "Continúa como HOS.",
    "Responsable del estándar técnico de los artistas.",
    "Documenta guías de entrega por tipo de imagen y etapa.",
    "Primer nivel en bloqueos técnicos.",
    "Responsable de los 1:1 con artistas.",
    "Feedback técnico vía TLs en la diaria.",
    "Reporta directamente a Chule.",
  ]},
  vick: { bullets: [
    "Juli lidera el depto de PM. Todos los PMs (incluida Vick) reportan a Juli.",
    "Vick es PM Lead: rol operativo senior dentro del equipo.",
    "Lidera la daily de asignaciones.",
    "Dueña operativa de Monday.",
    "Primer filtro en urgencias de cliente.",
    "Detecta desvíos creativos y los escala a Juli.",
    "Escala bloqueos técnicos a Guille.",
  ]},
  lucho: { bullets: [
    "Parte activa del proceso de producción.",
    "Liderazgo dentro de su equipo.",
    "Referente técnico y de proceso.",
    "Coordina soporte técnico con Guille.",
    "Reporta a Guille. Para esquemas de productos, reporta a Fran.",
  ]},
  anto:  { bullets: ["Parte activa del proceso de producción.", "Liderazgo dentro de su equipo.", "Referente técnico y de proceso.", "Coordina soporte técnico con Guille.", "Reporta directamente a Guille."] },
  gasti: { bullets: ["Asume formalmente el rol de TL en 3D (nuevo en esta estructura).", "Parte activa del proceso de producción.", "Liderazgo dentro de su equipo.", "Cortafuegos de HOS en la diaria.", "Coordina soporte técnico con Guille.", "Reporta directamente a Guille."] },
  cefe:  { bullets: ["Parte activa del proceso de producción.", "Liderazgo dentro de su equipo.", "Referente técnico y de proceso.", "Coordina soporte técnico con Guille.", "Reporta directamente a Guille."] },
  meme:  { bullets: ["Lidera People. Gestión de talento, cultura y bienestar."] },
  berni: { bullets: ["Lidera Admin (Finance & Administration).", "Forma parte de Admin y Sales.", "Reporta directo a Tincho."] },
  valen: { bullets: ["Business Development. Pertenece a Sales.", "Reporta directo a Fran."] },
};

const CF_TIERS = [
  { code: "04", label: "Dirección", color: "#BA7517", desc: "Dirección & negocio. Decisiones de scope, cuenta y estrategia creativa — sólo sube acá lo que excede el criterio de producción." },
  { code: "03", label: "Criterio",  color: "#7F77DD", desc: "Criterio de producción. AD y HOS fijan el estándar creativo y técnico; resuelven desvíos que el equipo no puede cerrar." },
  { code: "02", label: "Técnica",   color: "#378ADD", desc: "Filtro técnico & operativo. PMs y TLs validan brief, referentes técnicos y trayectoria del proyecto en la daily." },
  { code: "01", label: "Autocheck", color: "#1D9E75", desc: "Autocheck de entrega. El artista valida su propia pieza contra las guías antes de arrobar a nadie." },
];

const DISC_GROUPS = [
  { id: "g-int", label: "Interactive",  ids: ["lucho", "santic", "gabib"] },
  { id: "g-mod", label: "Modeling",     ids: ["anto", "gonza", "julif", "agusl_m"] },
  { id: "g-3d",  label: "3D",           ids: ["gasti", "3d_fer", "3d_rodri", "3d_javi", "3d_ingrid", "3d_joe", "3d_exe", "3d_juani", "3d_cin", "3d_fran", "3d_nere", "3d_gavi", "3d_san", "3d_nahue", "3d_gon"] },
  { id: "g-pp",  label: "PP",           ids: ["cefe", "pp_mati", "pp_fede", "pp_any", "pp_espi"] },
  { id: "g-pm",  label: "Project mgmt", ids: ["vick", "male", "dana", "nacho", "sofi"] },
];

const FILTROS = [
  { code: "F1", color: "#1D9E75", title: "Artist check", who: "Artista",
    revisa: ["Técnica base: iluminación, escala, encuadre, materiales, limpieza de escena", "Aplica las guías documentadas por HOS"],
    escala: ["Problema excede su conocimiento → TL del área (referente técnico)", "TL no puede resolverlo → Guille"] },
  { code: "F2", color: "#639922", title: "PM check", who: "PM (con apoyo de PM Lead si es necesario)",
    revisa: ["Alineación con brief, mood, referencias", "Desvíos evidentes de criterio", "Seguimiento de etiquetado correcto"],
    escala: ["Desvío creativo real → Juli (AD)", "Bloqueo técnico → TL / Guille"] },
  { code: "F3", color: "#7F77DD", title: "AD check", who: "Juli (HOP + AD)",
    revisa: ["Criterio creativo, cámaras y FD en todos los proyectos", "SD / FI / ER solo si PM lo solicita o hay riesgo de cuenta"],
    escala: ["Supera scope creativo o es decisión de negocio → Chule o socios"] },
];

const ETIQ_SCENARIOS = [
  { key: "csfd", label: "CS / FD", title: "Etapa CS / FD — Revisión artística + PM", color: "#7F77DD",
    steps: [
      { t: "Artista arroba @AD + @PM" },
      { t: "Revisan AD y PM en paralelo", d: "AD valida dirección artística. PM valida cumplimiento de brief." },
      { t: "Escalada si es necesario", d: "AD puede derivar corrección técnica al TL del área → Guille si el TL no puede resolverlo. PM levanta la mano si hay desvío de brief." },
    ]},
  { key: "sdfi", label: "SD / FI / ER", title: "Etapa SD / FI / ER — Revisión PM", color: "#1D9E75",
    steps: [
      { t: "Artista arroba @PM únicamente", d: "Salvo aclarado lo contrario en proyectos especiales." },
      { t: "Revisa PM" },
      { t: "Escalada si es necesario", d: "PM arroba a @AD solo si detecta desvío artístico real. Bloqueo técnico: TL del área → Guille." },
    ]},
  { key: "tec", label: "Bloqueo técnico", title: "Bloqueo técnico — Cualquier etapa", color: "#D85A30",
    steps: [
      { t: "Artista arroba @PM + @TL del área" },
      { t: "Revisa el TL (referente técnico)" },
      { t: "Escalada si es necesario", d: "TL no puede resolverlo → Guille (HOS). Guille → Chule si es decisión de negocio." },
    ]},
  { key: "tr", label: "Transición AD", title: "Transición AD — Criterio por proyecto", color: "#BA7517", isTransition: true,
    items: [
      { color: "#1D9E75", label: "Proyectos nuevos", text: "Juli como AD, sin excepción. Estructura del depto AD (Juli visión AD, Guille asesor técnico, ambos reportando a Chule)." },
      { color: "#BA7517", label: "Proyectos existentes de Chule", text: "Los cierra él, con fecha límite explícita. Juli no interviene salvo consulta o elevación del PM." },
      { color: "#D85A30", label: "Ningún proyecto sin AD asignado", text: "Claro en el Project Overview." },
    ]},
];

Object.assign(window, { ORG_NODES, ORG_EDGES, ORG_ROLE_DESC, CF_TIERS, DISC_GROUPS, FILTROS, ETIQ_SCENARIOS });
