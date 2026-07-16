/**
 * Auto-layout del organigrama híbrido (etapa 1 — solo cálculo, sin render).
 *
 * A partir de las personas in-org (`reports_to_id`) y las cajas de área
 * (`org_dept_nodes`, que cuelgan de una persona vía `parent_person_id` y
 * agrupan sus reportes por `department`) arma un árbol y le calcula posiciones
 * con Reingold-Tilford (d3-hierarchy → `tree()`). El resultado es la posición,
 * tamaño, color, teamCount y edges de cada nodo para que la etapa 2 dibuje el
 * canvas.
 *
 * Clave del híbrido: la posición es CALCULADA, salvo que el nodo tenga override
 * manual (`org_x`/`org_y` no nulos) → en ese caso se usa el override
 * (posición = override ?? auto). Nada está hardcodeado: el árbol, los edges y el
 * teamCount se derivan de los datos.
 *
 * Modelo del árbol:
 *   persona → [cajas de área, en orden sort_order] → sus reportes por dept
 *          → [reportes sin caja que matchee] como hijos directos
 * Si una persona no tiene cajas, todos sus reportes cuelgan directo (degrada al
 * árbol clásico de reports_to_id). Server-safe y puro (testeable sin DB).
 */
import {
  hierarchy,
  tree,
  type HierarchyNode,
  type HierarchyPointNode,
} from "d3-hierarchy";
import type { OrgPerson, OrgDeptNode } from "@/lib/db/queries/org";

export type OrgLayoutNode = {
  id: string;
  type: "person" | "dept";
  name: string;
  /** Rol en el organigrama (personas); null en las cajas. */
  role: string | null;
  /** dept de la persona, o department de la caja. */
  dept: string | null;
  accent: string;
  /** Esquina superior-izquierda del nodo en el canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Personas que cuelgan del nodo (directas + indirectas). Calculado. */
  teamCount: number;
  /** true si la posición vino de un override manual (org_x/org_y). */
  overridden: boolean;
};

export type OrgEdge = { from: string; to: string };

export type OrgLayout = {
  nodes: OrgLayoutNode[];
  edges: OrgEdge[];
  width: number;
  height: number;
};

// Tamaños por tipo/nivel (inspirados en el diseño del cliente). El "tier" de una
// persona = cuántas personas tiene por encima en el árbol (las cajas no cuentan):
// 0 = socios, 1 = heads, 2 = TLs, 3+ = artistas. Se clampea al último.
const DEPT_SIZE = { w: 120, h: 32 };
const PERSON_TIERS = [
  { w: 150, h: 48 },
  { w: 128, h: 44 },
  { w: 116, h: 42 },
  { w: 92, h: 30 },
];
const H_GAP = 28; // separación mínima horizontal entre nodos
const V_GAP = 44; // separación vertical entre filas
const MARGIN = 40; // margen del canvas

// Ancho adaptado al texto: los tiers de arriba son el MÍNIMO; si el nombre o
// el rol no entran, el nodo se ensancha hasta MAX_NODE_W (la separación dx se
// calcula del ancho real máximo, así el no-solape se mantiene). Estimación en
// px por carácter, generosa (sin DOM en el server; la elipsis del CSS es la
// red de seguridad si un texto exótico se pasa igual).
const MAX_NODE_W = 240;
const CH_NAME = 8.2; // Inter 600 13px (.org-node-name)
const CH_NAME_SM = 7.2; // Inter 500 11.5px (.org-node-sm)
const CH_ROLE = 6.2; // Inter 10.5px (.org-node-role)
const CH_ROLE_SM = 5.6; // Inter 9.5px (rol en nodos chicos)
const CH_DEPT = 9.3; // 12px uppercase + tracking (cajas de área)

const VROOT = "__vroot__"; // super-raíz virtual (soporta varias raíces reales)

// Paleta de accents por dept — mismos valores que OrgChart para que la leyenda
// de la etapa 2 coincida con el organigrama clásico.
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

function deptColor(key: string | null): string {
  return PALETTE[hashStr(key ?? "—") % PALETTE.length];
}

/** Nodo interno del árbol antes de aplicar d3. */
type TNode = {
  id: string;
  type: "person" | "dept";
  name: string;
  role: string | null;
  dept: string | null;
  accent: string;
  ox: number | null; // override x (null = auto)
  oy: number | null; // override y
  children: TNode[];
};

/** Orden entre personas hermanas: org_position ?? 9999 → nombre (mismo criterio que OrgChart). */
function cmpPerson(a: OrgPerson, b: OrgPerson): number {
  const pa = a.orgPosition ?? 9999;
  const pb = b.orgPosition ?? 9999;
  if (pa !== pb) return pa - pb;
  return a.name.localeCompare(b.name, "es");
}

/** Orden entre cajas del mismo padre: sort_order ?? 9999 → nombre. */
function cmpBox(a: OrgDeptNode, b: OrgDeptNode): number {
  const sa = a.sortOrder ?? 9999;
  const sb = b.sortOrder ?? 9999;
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name, "es");
}

/**
 * Calcula el layout completo del organigrama híbrido. Puro: no toca DB.
 */
export function computeOrgLayout(
  persons: OrgPerson[],
  deptNodes: OrgDeptNode[],
): OrgLayout {
  const personById = new Map(persons.map((p) => [p.id, p]));

  // Cajas válidas agrupadas por su persona-padre (parent in-org).
  const boxesByParent = new Map<string, OrgDeptNode[]>();
  for (const b of deptNodes) {
    if (!b.parentPersonId || !personById.has(b.parentPersonId)) continue;
    const arr = boxesByParent.get(b.parentPersonId) ?? [];
    arr.push(b);
    boxesByParent.set(b.parentPersonId, arr);
  }

  // Reportes directos de cada persona (X con reports_to_id = P in-org).
  const reportsByBoss = new Map<string, OrgPerson[]>();
  for (const p of persons) {
    const boss =
      p.reportsToId && personById.has(p.reportsToId) ? p.reportsToId : null;
    if (!boss) continue;
    const arr = reportsByBoss.get(boss) ?? [];
    arr.push(p);
    reportsByBoss.set(boss, arr);
  }

  // Construye el subárbol de una persona. `built` corta ciclos y evita duplicar.
  const built = new Set<string>();
  function buildPerson(p: OrgPerson): TNode {
    built.add(p.id);
    const reports = (reportsByBoss.get(p.id) ?? []).slice().sort(cmpPerson);
    const boxes = (boxesByParent.get(p.id) ?? []).slice().sort(cmpBox);

    // Primera caja por department (para repartir los reportes).
    const boxByDept = new Map<string, OrgDeptNode>();
    for (const b of boxes) {
      if (b.department && !boxByDept.has(b.department)) {
        boxByDept.set(b.department, b);
      }
    }

    // Reparte: reporte cuyo dept matchea una caja → bajo la caja; resto directo.
    const underBox = new Map<string, OrgPerson[]>();
    const directReports: OrgPerson[] = [];
    for (const r of reports) {
      const box = r.dept ? boxByDept.get(r.dept) : undefined;
      if (box) {
        const arr = underBox.get(box.id) ?? [];
        arr.push(r);
        underBox.set(box.id, arr);
      } else {
        directReports.push(r);
      }
    }

    const children: TNode[] = [];
    // Cajas primero (en orden), cada una con sus personas.
    for (const b of boxes) {
      const kids: TNode[] = [];
      for (const r of underBox.get(b.id) ?? []) {
        if (!built.has(r.id)) kids.push(buildPerson(r));
      }
      children.push({
        id: b.id,
        type: "dept",
        name: b.name,
        role: null,
        dept: b.department,
        accent: b.accent ?? deptColor(b.department ?? b.name),
        ox: b.orgX,
        oy: b.orgY,
        children: kids,
      });
    }
    // Después, reportes sin caja como hijos directos de la persona.
    for (const r of directReports) {
      if (!built.has(r.id)) children.push(buildPerson(r));
    }

    return {
      id: p.id,
      type: "person",
      name: p.name,
      role: p.orgRole,
      dept: p.dept,
      accent: deptColor(p.dept),
      ox: p.orgX,
      oy: p.orgY,
      children,
    };
  }

  // Raíces: personas sin jefe válido. Luego, defensivo, cualquiera no alcanzada
  // (ciclo) también como raíz, para que TODOS los nodos salgan.
  const roots: TNode[] = [];
  for (const p of persons
    .filter((p) => !(p.reportsToId && personById.has(p.reportsToId)))
    .sort(cmpPerson)) {
    if (!built.has(p.id)) roots.push(buildPerson(p));
  }
  for (const p of persons.slice().sort(cmpPerson)) {
    if (!built.has(p.id)) roots.push(buildPerson(p));
  }

  const virtual: TNode = {
    id: VROOT,
    type: "person",
    name: "",
    role: null,
    dept: null,
    accent: "#000000",
    ox: null,
    oy: null,
    children: roots,
  };

  const root = hierarchy<TNode>(virtual, (d) => d.children);

  // Tamaño de un nodo: alto por tier (como el diseño); ancho ADAPTADO AL TEXTO
  // (nombre y rol) para que no se trunque con "…". Estimación generosa por
  // caracteres (sin DOM en el server), clampeada a MAX_NODE_W; la elipsis del
  // CSS queda como red de seguridad para casos exóticos.
  function sizeOf(n: HierarchyNode<TNode>): { w: number; h: number } {
    if (n.data.type === "dept") {
      const w = Math.ceil(n.data.name.length * CH_DEPT) + 26; // padding+borde
      return { w: Math.min(MAX_NODE_W, Math.max(DEPT_SIZE.w, w)), h: DEPT_SIZE.h };
    }
    const tier = n
      .ancestors()
      .slice(1)
      .filter((a) => a.data.type === "person" && a.data.id !== VROOT).length;
    const t = PERSON_TIERS[Math.min(tier, PERSON_TIERS.length - 1)];
    const small = t.h <= 34; // mismo criterio que .org-node-sm en el canvas
    const nameW = n.data.name.length * (small ? CH_NAME_SM : CH_NAME);
    const roleW = (n.data.role?.length ?? 0) * (small ? CH_ROLE_SM : CH_ROLE);
    const w = Math.ceil(Math.max(nameW, roleW)) + 34; // barra+padding+borde
    return { w: Math.min(MAX_NODE_W, Math.max(t.w, w)), h: t.h };
  }

  // Anchos primero (dependen solo del dato/tier, no de la posición): dx =
  // ancho máximo REAL + gap → separación uniforme que garantiza que ningún
  // par de nodos se solape horizontalmente, aún con nombres largos.
  const sizeById = new Map<string, { w: number; h: number }>();
  let maxW = 1;
  for (const n of root.descendants()) {
    if (n.data.id === VROOT) continue;
    const s = sizeOf(n);
    sizeById.set(n.data.id, s);
    maxW = Math.max(maxW, s.w);
  }
  const dx = maxW + H_GAP;
  const laidOut = tree<TNode>().nodeSize([dx, 1])(root);

  const nodes = laidOut
    .descendants()
    .filter((n) => n.data.id !== VROOT);

  // Alto de cada fila (por profundidad real = depth - 1, vroot en depth 0).
  const rowH = new Map<number, number>();
  for (const n of nodes) {
    const s = sizeById.get(n.data.id)!;
    const d = n.depth - 1;
    rowH.set(d, Math.max(rowH.get(d) ?? 0, s.h));
  }
  const depths = [...rowH.keys()];
  const maxDepth = depths.length ? Math.max(...depths) : -1;
  const rowY = new Map<number, number>();
  let acc = MARGIN;
  for (let d = 0; d <= maxDepth; d++) {
    rowY.set(d, acc);
    acc += (rowH.get(d) ?? 0) + V_GAP;
  }

  // Normaliza la X para que el nodo más a la izquierda (auto) quede en MARGIN.
  let minLeft = Infinity;
  for (const n of nodes) {
    const s = sizeById.get(n.data.id)!;
    minLeft = Math.min(minLeft, n.x - s.w / 2);
  }
  const dxShift = Number.isFinite(minLeft) ? MARGIN - minLeft : 0;

  // teamCount = personas descendientes (excluye la propia y las cajas).
  function teamCount(n: HierarchyPointNode<TNode>): number {
    return n.descendants().filter((d) => d !== n && d.data.type === "person")
      .length;
  }

  const outNodes: OrgLayoutNode[] = [];
  let width = 0;
  let height = 0;
  for (const n of nodes) {
    const s = sizeById.get(n.data.id)!;
    const overridden = n.data.ox !== null && n.data.oy !== null;
    const x = overridden ? n.data.ox! : Math.round(n.x - s.w / 2 + dxShift);
    const y = overridden ? n.data.oy! : (rowY.get(n.depth - 1) ?? MARGIN);
    outNodes.push({
      id: n.data.id,
      type: n.data.type,
      name: n.data.name,
      role: n.data.role,
      dept: n.data.dept,
      accent: n.data.accent,
      x,
      y,
      w: s.w,
      h: s.h,
      teamCount: teamCount(n),
      overridden,
    });
    width = Math.max(width, x + s.w);
    height = Math.max(height, y + s.h);
  }

  // Edges = padre→hijo del árbol (excluye la super-raíz virtual).
  const edges: OrgEdge[] = [];
  for (const n of nodes) {
    const parent = n.parent;
    if (parent && parent.data.id !== VROOT) {
      edges.push({ from: parent.data.id, to: n.data.id });
    }
  }

  return {
    nodes: outNodes,
    edges,
    width: outNodes.length ? width + MARGIN : 0,
    height: outNodes.length ? height + MARGIN : 0,
  };
}
