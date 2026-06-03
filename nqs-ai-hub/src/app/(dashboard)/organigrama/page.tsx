/**
 * /organigrama — vista pública del organigrama del estudio (todos los users).
 *
 * Server Component: trae los nodos (users con is_in_org=true) y los pasa al
 * OrgChart, que arma el árbol desde reports_to_id. Read-only para el user.
 */
import { OrgChart } from "@/components/screens/OrgChart";
import { requireAuth } from "@/lib/auth/server";
import { getOrgNodes } from "@/lib/db/queries/org";

export const dynamic = "force-dynamic";

export default async function OrganigramaPage() {
  await requireAuth();
  const nodes = await getOrgNodes();

  return (
    <div className="page" style={{ padding: 32 }}>
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
          <strong>{nodes.length}</strong>
        </div>
      </div>

      <OrgChart nodes={nodes} />
    </div>
  );
}
