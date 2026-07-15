/**
 * /organigrama — vista pública del organigrama del estudio (todos los users).
 *
 * Server Component: trae los datos (personas in-org + cajas de área) y se los
 * pasa al canvas (OrgCanvas), que calcula el layout en el cliente con el mismo
 * motor y porta el look/interacciones del diseño NQS. A los admins les habilita
 * el modo edición (fijar posiciones); para el resto es read-only.
 */
import { OrgCanvas } from "@/components/screens/OrgCanvas";
import { requireAuth } from "@/lib/auth/server";
import { getOrgLayoutData } from "@/lib/db/queries/org";

export const dynamic = "force-dynamic";

export default async function OrganigramaPage() {
  const session = await requireAuth();
  const { persons, deptNodes } = await getOrgLayoutData();
  const isAdmin = session.role === "admin";

  // Áreas presentes (dept de las personas + nombre de las cajas), desde el dato.
  const areas = new Set(
    [...persons.map((p) => p.dept), ...deptNodes.map((d) => d.name)].filter(
      Boolean,
    ),
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

      <OrgCanvas persons={persons} deptNodes={deptNodes} isAdmin={isAdmin} />
    </div>
  );
}
