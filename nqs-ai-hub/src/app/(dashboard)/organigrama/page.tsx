/**
 * /organigrama — vista pública del organigrama del estudio (todos los users).
 *
 * Server Component: trae los datos (personas in-org + cajas de área), calcula
 * el layout con el motor (mismo que expone GET /api/organigrama/layout) y se lo
 * pasa al canvas (OrgCanvas), que porta el look/interacciones del diseño NQS.
 * Read-only para el user; la edición vive en /admin/organigrama.
 */
import { OrgCanvas } from "@/components/screens/OrgCanvas";
import { requireAuth } from "@/lib/auth/server";
import { getOrgLayoutData } from "@/lib/db/queries/org";
import { computeOrgLayout } from "@/lib/org/layout";

export const dynamic = "force-dynamic";

export default async function OrganigramaPage() {
  await requireAuth();
  const { persons, deptNodes } = await getOrgLayoutData();
  const layout = computeOrgLayout(persons, deptNodes);

  // Áreas presentes (dept de las personas + nombre de las cajas), desde el dato.
  const areas = new Set(
    layout.nodes
      .map((n) => (n.type === "dept" ? n.name : n.dept))
      .filter(Boolean),
  ).size;

  return (
    <div className="page org-page" style={{ padding: 32 }}>
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>
            ↳ ESTRUCTURA DEL ESTUDIO
          </div>
          <h1 className="page-title">
            Cómo nos <em>organizamos.</em>
          </h1>
          <div className="page-sub">
            Quién depende de quién. La estructura del estudio en una sola
            página.
          </div>
        </div>
        <div className="page-meta">
          <div>PERSONAS</div>
          <strong>{persons.length}</strong>
          <div>ÁREAS</div>
          <strong>{areas}</strong>
        </div>
      </div>

      <OrgCanvas layout={layout} />
    </div>
  );
}
