/**
 * /login — Server Component.
 *
 * Si ya hay sesión, manda a /admin o /hub según rol (evita re-loguear).
 * Si no, renderiza el LoginScreen.
 *
 * El proxy también redirige de /login si ya hay cookie, pero acá hacemos
 * doble check porque la cookie podría existir y ser inválida (ej. token
 * revocado) — el proxy no valida JWT, este chequeo sí.
 */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/screens/LoginScreen";
import { getSession } from "@/lib/auth/server";

// Forzamos render dinámico: el render depende de cookies + DB.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/hub");

  // Formato dd.MM.yyyy — fecha del server, evita mismatch SSR/CSR.
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const displayDate = `${dd}.${mm}.${now.getFullYear()}`;

  return (
    // useSearchParams requiere Suspense en Next 16 cuando se usa en
    // Client Components renderizados desde Server Components.
    <Suspense fallback={null}>
      <LoginScreen displayDate={displayDate} />
    </Suspense>
  );
}
