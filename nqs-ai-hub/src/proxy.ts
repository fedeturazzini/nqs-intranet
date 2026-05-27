/**
 * Proxy (Next 16 — antes "middleware").
 *
 * Hace un guard barato a nivel de edge:
 *   - Si NO hay cookie `sb-access-token` y la ruta requiere auth →
 *     redirect a /login.
 *   - Si HAY cookie y la ruta es /login → redirect a /hub (evita ver el
 *     login estando logueado).
 *
 * No hace validación de JWT acá — eso lo hace `getSession()` por request
 * con `auth.getUser(token)` contra Supabase. El proxy es una pre-pantalla:
 * evita render de páginas privadas a anónimos, pero no es la fuente de
 * verdad. La fuente de verdad son los `requireAuth()` / `requireAdmin()`
 * en cada página/route handler.
 *
 * Por la misma razón, las rutas /admin las protege la página con
 * `requireAdmin()` — el proxy no puede leer el rol sin un round-trip a
 * Supabase (caro en edge), y el chequeo a nivel page ya alcanza.
 *
 * Migración: en Next ≤15 esto vivía en `middleware.ts`. Renombrado a
 * `proxy` en Next 16 — la firma y `config.matcher` son iguales.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);

  // OJO: NO redirigimos /login → /hub aunque haya cookie. Razón:
  // si el JWT está stale (revocado en Supabase, kicked, o expiró), la
  // cookie sigue presente pero `getSession()` devuelve null y la page
  // de /hub redirige a /login. Si el proxy ahora bouncea /login → /hub,
  // entramos en loop infinito (ERR_TOO_MANY_REDIRECTS).
  //
  // La pantalla de /login YA hace el redirect a /hub o /admin si la
  // sesión es válida (vía `getSession()` que SÍ chequea Supabase). Si
  // la sesión es inválida, /login renderea el form como corresponde y
  // el user puede re-loguearse (el POST de /api/auth/login sobrescribe
  // las cookies stale con tokens frescos).

  // Anónimo y va a una ruta privada:
  //   - Rutas de API (`/api/*`): 401 JSON. Los API clients esperan JSON,
  //     no un redirect HTML.
  //   - Páginas: redirect a /login con `?next=` para volver después.
  if (!hasSession && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Toda la app menos assets estáticos y _next internals
    "/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)",
  ],
};
