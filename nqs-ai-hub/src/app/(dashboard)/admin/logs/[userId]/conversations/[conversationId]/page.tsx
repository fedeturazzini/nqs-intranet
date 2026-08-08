/**
 * /admin/logs/[userId]/conversations/[conversationId]
 * Detalle read-only. Gate de Gastos obligatorio.
 */
import { GastosPasswordGate } from "@/components/admin/GastosPasswordGate";
import { AdminConversationDetail } from "@/components/admin/AdminConversationDetail";
import { hasGastosGate } from "@/lib/auth/gastos-gate";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ userId: string; conversationId: string }>;
};

export default async function AdminConversationDetailPage({
  params,
}: PageProps) {
  if (!(await hasGastosGate())) {
    return <GastosPasswordGate />;
  }

  const { userId, conversationId } = await params;
  return (
    <AdminConversationDetail
      userId={userId}
      conversationId={conversationId}
    />
  );
}
