/**
 * /hub — catálogo del workspace.
 *
 * Server Component: resuelve sesión + tools-con-acceso desde la DB,
 * pasa todo prerendered al `HubScreen` (Client). Sin fetch HTTP entre
 * server y client — query directa en el mismo proceso.
 */
import { redirect } from "next/navigation";
import { HubScreen } from "@/components/screens/HubScreen";
import { requireAuth } from "@/lib/auth/server";
import { listToolsWithAccess } from "@/lib/db/queries/access";
import { getActiveProjectForUser } from "@/lib/db/queries/projects";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const session = await requireAuth();

  // Sistema de proyectos (migration 0008): si el user todavía no eligió un
  // proyecto activo, lo mandamos a /projects a elegir antes de ver el hub.
  const activeProject = await getActiveProjectForUser(session.userId);
  if (!activeProject) redirect("/projects");

  const tools = await listToolsWithAccess(session.userId);
  const firstName = session.name.split(" ")[0] ?? session.name;

  return (
    <HubScreen
      tools={tools}
      userFirstName={firstName}
      activeProject={{ name: activeProject.name, icon: activeProject.icon }}
    />
  );
}
