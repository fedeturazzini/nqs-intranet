/**
 * /admin/projects — gestión de proyectos del estudio (admin).
 *
 * El layout `/admin` ya valida rol admin. Acá cargamos todos los proyectos
 * (incluye archivados) y los pasamos al panel client.
 */
import { ProjectsAdminPanel } from "@/components/admin/ProjectsAdminPanel";
import { listAllProjects } from "@/lib/db/queries/projects";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const projects = await listAllProjects();
  return (
    <ProjectsAdminPanel
      initialProjects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        icon: p.icon,
        is_active: p.is_active,
        updated_at: p.updated_at,
      }))}
    />
  );
}
