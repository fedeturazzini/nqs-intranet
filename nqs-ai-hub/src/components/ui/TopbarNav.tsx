"use client";

/**
 * Nav del topbar. Client Component porque necesita:
 *   - `usePathname()` para resaltar el item activo.
 *   - Navegar / disparar toasts en items aún no implementados.
 *
 * El prompt pide usar `next/headers` para detectar la ruta. Lo hago con
 * `usePathname()` porque en Next 16 el pathname server-side requiere
 * setear un header custom en el proxy y leerlo desde el layout — más
 * frágil y menos idiomático que el hook. La nav es una pieza chica de
 * UI sin SEO ni SSR-only, no perdemos nada con hidratarla.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { showToast } from "@/lib/store/toast";

type NavItem =
  | { kind: "link"; label: string; href: string; match: (p: string) => boolean }
  | {
      kind: "soon";
      label: string;
      key: string;
      toastTitle: string;
      toastMsg: string;
    };

const BASE_ITEMS: NavItem[] = [
  {
    kind: "link",
    label: "Hub",
    href: "/hub",
    match: (p) => p === "/hub" || p.startsWith("/tool/"),
  },
  {
    kind: "soon",
    label: "Tutoriales",
    key: "tutoriales",
    toastTitle: "TUTORIALES",
    toastMsg: "Módulo en preparación. Disponible en una próxima sesión del roadmap.",
  },
  {
    kind: "soon",
    label: "Playbook",
    key: "playbook",
    toastTitle: "PLAYBOOK",
    toastMsg: "Módulo en preparación. Disponible en una próxima sesión del roadmap.",
  },
  {
    kind: "soon",
    label: "Organigrama",
    key: "organigrama",
    toastTitle: "ORGANIGRAMA",
    toastMsg: "Módulo en preparación. Disponible en una próxima sesión del roadmap.",
  },
];

type TopbarNavProps = Readonly<{
  isAdmin: boolean;
  pendingCount: number;
}>;

export function TopbarNav({ isAdmin, pendingCount }: TopbarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {BASE_ITEMS.map((item) => {
        if (item.kind === "link") {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "active" : ""}
              // Reseteamos prefetch en links de la home porque cada uno
              // resuelve auth + db en el server.
              prefetch={false}
              style={{
                appearance: "none",
                background: active ? "var(--bg-elev)" : "transparent",
                border: 0,
                color: active ? "var(--fg)" : "var(--fg-mute)",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: 12,
                letterSpacing: "0.02em",
                fontFamily: "var(--mono)",
                textTransform: "uppercase",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              {item.label}
            </Link>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            onClick={() =>
              showToast({ title: item.toastTitle, msg: item.toastMsg })
            }
          >
            {item.label}
          </button>
        );
      })}

      {isAdmin && (
        <Link
          href="/admin"
          prefetch={false}
          className={pathname.startsWith("/admin") ? "active" : ""}
          style={{
            appearance: "none",
            background: pathname.startsWith("/admin")
              ? "var(--bg-elev)"
              : "transparent",
            border: 0,
            color: pathname.startsWith("/admin")
              ? "var(--fg)"
              : "var(--fg-mute)",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            letterSpacing: "0.02em",
            fontFamily: "var(--mono)",
            textTransform: "uppercase",
            textDecoration: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Admin
          {pendingCount > 0 && (
            <span
              className="tag warn"
              style={{ marginLeft: 2, padding: "1px 5px" }}
            >
              {pendingCount}
            </span>
          )}
        </Link>
      )}

    </nav>
  );
}
