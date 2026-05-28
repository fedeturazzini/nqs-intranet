/**
 * Layout del segmento `/admin/*`. Server Component.
 *
 * - Valida rol admin (defense in depth — el `(dashboard)/layout` ya
 *   garantizó la sesión; acá agregamos el rol).
 * - Resuelve el badge de "Solicitudes" con una query rápida.
 * - Renderea sidebar fija + main scroll independiente.
 */
import { requireAdmin } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

type AdminLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

async function getPendingRequestsCount(): Promise<number> {
  const db = createServerClient();
  const { count, error } = await db
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdmin();
  const pendingCount = await getPendingRequestsCount();

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 60px - 38px)",
        minHeight: 0,
      }}
    >
      <AdminSidebar pendingRequests={pendingCount} />
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          minWidth: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
