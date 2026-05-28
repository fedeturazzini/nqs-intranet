/**
 * /admin/logs — Auditoría combinada.
 *
 * 3 pestañas que cada una pega a su propio endpoint:
 *   - Usage Logs       → /api/admin/logs
 *   - Module Sessions  → /api/admin/module-sessions
 *   - Credit Transactions → /api/admin/credit-transactions
 */
import { LogsBoard } from "@/components/admin/LogsBoard";

export const dynamic = "force-dynamic";

export default function AdminLogsPage() {
  return (
    <div className="page" style={{ padding: 32 }}>
      <div className="t-eyebrow" style={{ marginBottom: 14 }}>
        ↳ ADMIN · LOGS
      </div>
      <h1
        className="page-title"
        style={{ fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}
      >
        Auditoría
      </h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 22 }}>
        Quién hizo qué, cuándo, con qué tool.
      </p>
      <LogsBoard />
    </div>
  );
}
