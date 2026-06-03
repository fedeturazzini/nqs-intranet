/**
 * /admin/organigrama — gestión del organigrama (admin). El layout /admin
 * ya valida rol admin.
 */
import { OrgAdminPanel } from "@/components/admin/OrgAdminPanel";
import { getAllUsersForOrg } from "@/lib/db/queries/org";

export const dynamic = "force-dynamic";

export default async function AdminOrganigramaPage() {
  const users = await getAllUsersForOrg();
  return <OrgAdminPanel initialUsers={users} />;
}
