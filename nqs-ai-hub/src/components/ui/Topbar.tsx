/**
 * Topbar del dashboard. Server Component que recibe los datos del user
 * (resueltos en el layout via getSession). La nav y el chip son
 * Client Components anidados — solo lo que realmente necesita hidratarse
 * se hidrata.
 *
 * Adaptado de NQS AI Hub.html líneas 113-140.
 */
import { NqsLogo } from "./NqsLogo";
import { TopbarNav } from "./TopbarNav";
import { UserChip } from "./UserChip";
import type { UserRole } from "@/types/db-aliases";

type TopbarProps = Readonly<{
  user: {
    name: string;
    initials: string;
    role: UserRole;
  };
  /** Cantidad de solicitudes pendientes para badge en Admin (post-MVP). */
  pendingCount?: number;
}>;

export function Topbar({ user, pendingCount = 0 }: TopbarProps) {
  const isAdmin = user.role === "admin";

  return (
    <header className="topbar">
      <div className="topbar-l">
        <div className="brand">
          <NqsLogo size={28} />
          <span>WORKSPACE</span>
          <span className="brand-pip" title="conectado" />
        </div>
        <TopbarNav isAdmin={isAdmin} pendingCount={pendingCount} />
      </div>
      <div className="topbar-r">
        <span className="t-meta">
          ↳ {isAdmin ? "ADMIN" : "EQUIPO CREATIVO"}
        </span>
        <UserChip user={{ name: user.name, initials: user.initials }} />
      </div>
    </header>
  );
}
