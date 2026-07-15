/**
 * /admin/organigrama — gestión del organigrama (admin). El layout /admin
 * ya valida rol admin.
 *
 * Dos bloques que conviven:
 *   - OrgAdminPanel: jerarquía + orden (En org, reporta a, flechas ↑/↓).
 *   - OrgBoxesAdmin: CRUD de las cajas de área (org_dept_nodes).
 * El acomodo espacial (fijar posición con drag) vive en el canvas /organigrama.
 */
import { OrgAdminPanel } from "@/components/admin/OrgAdminPanel";
import { OrgBoxesAdmin } from "@/components/admin/OrgBoxesAdmin";
import { getAllUsersForOrg, getOrgLayoutData } from "@/lib/db/queries/org";

export const dynamic = "force-dynamic";

export default async function AdminOrganigramaPage() {
  const [users, { persons, deptNodes }] = await Promise.all([
    getAllUsersForOrg(),
    getOrgLayoutData(),
  ]);
  const personOpts = persons.map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <OrgAdminPanel initialUsers={users} />
      <div style={{ padding: "0 32px 48px" }}>
        <OrgBoxesAdmin initialBoxes={deptNodes} persons={personOpts} />
      </div>
    </>
  );
}
