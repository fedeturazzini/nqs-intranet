/**
 * /projects — listado de proyectos del estudio.
 *
 * Server Component: trae los proyectos activos + el proyecto activo del
 * user (para marcarlo). Al clickear una card, el ProjectsScreen guarda el
 * proyecto activo y redirige a /tool/claude.
 */
import { ProjectsScreen } from "@/components/screens/ProjectsScreen";
import { requireAuth } from "@/lib/auth/server";
import {
  getActiveProjectId,
  listActiveProjects,
} from "@/lib/db/queries/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const session = await requireAuth();
  const [projects, activeId] = await Promise.all([
    listActiveProjects(),
    getActiveProjectId(session.userId),
  ]);

  return (
    <ProjectsScreen
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        icon: p.icon,
        updatedAt: p.updated_at,
      }))}
      activeProjectId={activeId}
      isAdmin={session.role === "admin"}
    />
  );
}
