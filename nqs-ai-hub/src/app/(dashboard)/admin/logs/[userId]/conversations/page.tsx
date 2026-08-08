/**
 * /admin/logs/[userId]/conversations — lista de conversaciones (admin).
 * Gate de Gastos obligatorio.
 */
import { GastosPasswordGate } from "@/components/admin/GastosPasswordGate";
import { AdminConversationsList } from "@/components/admin/AdminConversationsList";
import { hasGastosGate } from "@/lib/auth/gastos-gate";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ userId: string }>;
};

export default async function AdminUserConversationsPage({
  params,
}: PageProps) {
  if (!(await hasGastosGate())) {
    return <GastosPasswordGate />;
  }

  const { userId } = await params;
  const db = createServerClient();
  const { data: user } = await db
    .from("users")
    .select("id, name")
    .eq("id", userId)
    .maybeSingle();

  if (!user) {
    return (
      <div className="page" style={{ padding: 32 }}>
        <p className="t-meta dim">Usuario no encontrado.</p>
      </div>
    );
  }

  return <AdminConversationsList userId={user.id} userName={user.name} />;
}
