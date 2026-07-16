/**
 * /admin/organigrama — gestión del organigrama (admin). El layout /admin
 * ya valida rol admin.
 *
 * Una sola pantalla (OrgAdminPanel) con estado compartido: tabla de jerarquía/
 * orden + CRUD de cajas de área + preview con el canvas REAL (el mismo de
 * /organigrama), que refleja todo en vivo y permite fijar posiciones ahí mismo.
 */
import { OrgAdminPanel } from "@/components/admin/OrgAdminPanel";
import { getAllUsersForOrg, getOrgLayoutData } from "@/lib/db/queries/org";

export const dynamic = "force-dynamic";

export default async function AdminOrganigramaPage() {
  const [users, { deptNodes }] = await Promise.all([
    getAllUsersForOrg(),
    getOrgLayoutData(),
  ]);

  return <OrgAdminPanel initialUsers={users} initialBoxes={deptNodes} />;
}
