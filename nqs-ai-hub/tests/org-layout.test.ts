/**
 * Tests del auto-layout del organigrama híbrido (src/lib/org/layout).
 *
 * Motor puro (sin DB): le damos personas + cajas de área y verificamos los
 * criterios del pedido: todos los nodos con x/y, ninguno se solapa, hermanos en
 * orden de org_position, teamCount = gente real que cuelga (directa+indirecta),
 * las cajas se intercalan (persona → caja → reportes) y el override org_x/org_y
 * pisa la posición calculada.
 */
import { describe, expect, test } from "vitest";
import { computeOrgLayout } from "@/lib/org/layout";
import type { OrgPerson, OrgDeptNode } from "@/lib/db/queries/org";

function person(
  id: string,
  opts: Partial<OrgPerson> = {},
): OrgPerson {
  return {
    id,
    name: opts.name ?? id,
    dept: opts.dept ?? null,
    orgRole: opts.orgRole ?? null,
    reportsToId: opts.reportsToId ?? null,
    orgPosition: opts.orgPosition ?? null,
    orgX: opts.orgX ?? null,
    orgY: opts.orgY ?? null,
  };
}

function box(id: string, opts: Partial<OrgDeptNode> = {}): OrgDeptNode {
  return {
    id,
    name: opts.name ?? id,
    department: opts.department ?? null,
    parentPersonId: opts.parentPersonId ?? null,
    accent: opts.accent ?? null,
    sortOrder: opts.sortOrder ?? null,
    orgX: opts.orgX ?? null,
    orgY: opts.orgY ?? null,
  };
}

/**
 * Fixture:
 *   A (raíz, pos1) ──┬─ [People/AD] ──┬─ D (AD, pos1)
 *                    │                └─ C (AD, pos2) ── G (AD)   ← G cuelga de C
 *                    ├─ [Production/3D] ─ E (3D)
 *                    └─ F (PM, sin caja que matchee → hijo directo)
 *   B (raíz, pos2)  (hoja)
 */
function makeFixture(): { persons: OrgPerson[]; deptNodes: OrgDeptNode[] } {
  const persons = [
    person("A", { dept: "PARTNER", orgPosition: 1 }),
    person("B", { dept: "PARTNER", orgPosition: 2 }),
    person("C", { dept: "AD", reportsToId: "A", orgPosition: 2 }),
    person("D", { dept: "AD", reportsToId: "A", orgPosition: 1 }),
    person("E", { dept: "3D ARTIST", reportsToId: "A" }),
    person("F", { dept: "PM", reportsToId: "A" }),
    person("G", { dept: "AD", reportsToId: "C" }),
  ];
  const deptNodes = [
    box("People", { department: "AD", parentPersonId: "A", sortOrder: 1 }),
    box("Production", {
      department: "3D ARTIST",
      parentPersonId: "A",
      sortOrder: 2,
    }),
  ];
  return { persons, deptNodes };
}

function byId(layout: ReturnType<typeof computeOrgLayout>) {
  return new Map(layout.nodes.map((n) => [n.id, n]));
}

/** ¿Se solapan los rectángulos a y b? (tocar bordes no cuenta). */
function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

describe("computeOrgLayout", () => {
  test("devuelve TODOS los nodos (personas + cajas válidas) con x/y", () => {
    const { persons, deptNodes } = makeFixture();
    const layout = computeOrgLayout(persons, deptNodes);
    expect(layout.nodes).toHaveLength(persons.length + deptNodes.length); // 7 + 2
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.w).toBeGreaterThan(0);
      expect(n.h).toBeGreaterThan(0);
    }
    const m = byId(layout);
    expect(m.get("A")!.type).toBe("person");
    expect(m.get("People")!.type).toBe("dept");
  });

  test("ningún nodo se solapa con otro", () => {
    const { persons, deptNodes } = makeFixture();
    const { nodes } = computeOrgLayout(persons, deptNodes);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(
          overlaps(nodes[i], nodes[j]),
          `${nodes[i].id} se solapa con ${nodes[j].id}`,
        ).toBe(false);
      }
    }
  });

  test("los hermanos salen en orden de org_position (izq→der)", () => {
    const { persons, deptNodes } = makeFixture();
    const m = byId(computeOrgLayout(persons, deptNodes));
    // D (pos1) a la izquierda de C (pos2), ambos bajo la caja People.
    expect(m.get("D")!.x).toBeLessThan(m.get("C")!.x);
    // A (raíz pos1) a la izquierda de B (raíz pos2).
    expect(m.get("A")!.x).toBeLessThan(m.get("B")!.x);
  });

  test("teamCount = gente real que cuelga (directa + indirecta), sin contar cajas", () => {
    const { persons, deptNodes } = makeFixture();
    const m = byId(computeOrgLayout(persons, deptNodes));
    expect(m.get("A")!.teamCount).toBe(5); // C, D, E, F, G
    expect(m.get("People")!.teamCount).toBe(3); // C, D, G
    expect(m.get("Production")!.teamCount).toBe(1); // E
    expect(m.get("C")!.teamCount).toBe(1); // G
    expect(m.get("B")!.teamCount).toBe(0);
    expect(m.get("F")!.teamCount).toBe(0);
    expect(m.get("G")!.teamCount).toBe(0);
  });

  test("las cajas se intercalan: persona → caja → reportes (edges derivados)", () => {
    const { persons, deptNodes } = makeFixture();
    const { edges } = computeOrgLayout(persons, deptNodes);
    const has = (from: string, to: string) =>
      edges.some((e) => e.from === from && e.to === to);
    expect(has("A", "People")).toBe(true);
    expect(has("People", "D")).toBe(true);
    expect(has("People", "C")).toBe(true);
    expect(has("C", "G")).toBe(true);
    expect(has("A", "F")).toBe(true); // F sin caja → hijo directo
    // Ningún edge apunta a la raíz virtual ni al revés.
    expect(edges.every((e) => e.from !== "__vroot__" && e.to !== "__vroot__")).toBe(
      true,
    );
    expect(edges).toHaveLength(7);
  });

  test("override org_x/org_y pisa la posición calculada; el resto sigue auto", () => {
    const { persons, deptNodes } = makeFixture();
    const overridden = persons.map((p) =>
      p.id === "D" ? { ...p, orgX: 999, orgY: 555 } : p,
    );
    const m = byId(computeOrgLayout(overridden, deptNodes));
    const d = m.get("D")!;
    expect(d.overridden).toBe(true);
    expect(d.x).toBe(999);
    expect(d.y).toBe(555);
    expect(m.get("C")!.overridden).toBe(false);
    // El canvas se agranda para contener el override.
    const layout = computeOrgLayout(overridden, deptNodes);
    expect(layout.width).toBeGreaterThanOrEqual(999 + d.w);
    expect(layout.height).toBeGreaterThanOrEqual(555 + d.h);
  });

  test("una persona nueva sin caja aparece igual (auto-posicionada)", () => {
    const { persons, deptNodes } = makeFixture();
    const withNew = [
      ...persons,
      person("NEW", { dept: "PM", reportsToId: "A" }),
    ];
    const m = byId(computeOrgLayout(withNew, deptNodes));
    expect(m.has("NEW")).toBe(true);
    expect(Number.isFinite(m.get("NEW")!.x)).toBe(true);
  });

  test("sin cajas degrada al árbol clásico (todos los reportes directos)", () => {
    const { persons } = makeFixture();
    const layout = computeOrgLayout(persons, []);
    expect(layout.nodes).toHaveLength(persons.length); // solo personas
    const has = (from: string, to: string) =>
      layout.edges.some((e) => e.from === from && e.to === to);
    expect(has("A", "C")).toBe(true); // sin caja, C cuelga directo de A
    expect(has("A", "D")).toBe(true);
    expect(has("A", "E")).toBe(true);
  });

  test("caja huérfana (parent inexistente) se ignora", () => {
    const { persons } = makeFixture();
    const orphan = [box("Ghost", { department: "AD", parentPersonId: "ZZZ" })];
    const layout = computeOrgLayout(persons, orphan);
    expect(layout.nodes.some((n) => n.id === "Ghost")).toBe(false);
  });

  test("input vacío → layout vacío", () => {
    const layout = computeOrgLayout([], []);
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });
});
