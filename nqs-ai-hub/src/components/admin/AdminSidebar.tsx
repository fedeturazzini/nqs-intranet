"use client";

/**
 * Sidebar del panel admin. Client porque usa `usePathname()` para
 * marcar el item activo. El badge de "Solicitudes" viene como prop —
 * el layout server hace la query una vez por request.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminSidebarProps = Readonly<{
  pendingRequests: number;
}>;

type NavItem = {
  label: string;
  href: string;
  match: (p: string) => boolean;
  badge?: number;
  comingSoon?: boolean;
};

export function AdminSidebar({ pendingRequests }: AdminSidebarProps) {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      label: "Overview",
      href: "/admin",
      match: (p) => p === "/admin",
    },
    {
      label: "Usuarios",
      href: "/admin/users",
      match: (p) => p.startsWith("/admin/users"),
    },
    {
      label: "Prompt padre",
      href: "/admin/prompt",
      match: (p) => p.startsWith("/admin/prompt"),
    },
    {
      label: "Accesos & horarios",
      href: "/admin/access",
      match: (p) => p.startsWith("/admin/access"),
    },
    {
      label: "Solicitudes",
      href: "/admin/requests",
      match: (p) => p.startsWith("/admin/requests"),
      badge: pendingRequests,
    },
    {
      label: "Logs",
      href: "/admin/logs",
      match: (p) => p.startsWith("/admin/logs"),
    },
  ];

  // Items que vendrán post-MVP (sesión 11+).
  const futureItems: { label: string }[] = [
    { label: "Créditos · pool" },
    { label: "Shield" },
    { label: "Snaps" },
  ];

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: "1px solid var(--line)",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflowY: "auto",
        background: "var(--bg)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ marginBottom: 12, color: "var(--fg-mute)" }}
      >
        ↳ PANEL ADMIN
      </div>

      {items.map((it) => {
        const active = it.match(pathname);
        return (
          <Link
            key={it.href}
            href={it.href}
            prefetch={false}
            style={{
              ...itemBaseStyle,
              background: active ? "var(--bg-elev)" : "transparent",
              borderLeft: active
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              color: active ? "var(--fg)" : "var(--fg-mute)",
            }}
          >
            <span>{it.label}</span>
            {it.badge != null && it.badge > 0 && (
              <span
                className="tag warn"
                style={{ padding: "1px 6px", fontSize: 10 }}
              >
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}

      <div
        className="t-eyebrow"
        style={{
          marginTop: 18,
          marginBottom: 8,
          color: "var(--fg-mute)",
          opacity: 0.6,
        }}
      >
        ↳ PRÓXIMAMENTE
      </div>
      {futureItems.map((it) => (
        <div
          key={it.label}
          style={{
            ...itemBaseStyle,
            color: "var(--fg-mute)",
            opacity: 0.5,
            cursor: "not-allowed",
            borderLeft: "2px solid transparent",
          }}
        >
          <span>{it.label}</span>
          <span
            className="tag"
            style={{ padding: "1px 5px", fontSize: 9 }}
          >
            v2
          </span>
        </div>
      ))}
    </aside>
  );
}

const itemBaseStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 10px",
  fontFamily: "var(--mono)",
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  textDecoration: "none",
  borderRadius: 0,
};
