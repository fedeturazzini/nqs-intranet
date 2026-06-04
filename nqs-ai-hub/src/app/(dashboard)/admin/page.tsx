/**
 * /admin — entrada al panel. El Overview se ocultó del sidebar (sesión
 * auxiliar); el landing default del admin pasa a /admin/users. El Overview
 * sigue disponible por URL en /admin/overview.
 */
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/users");
}
