import type { Metadata } from "next";
import "@/styles/globals.css";
import { getSession } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "NQS AI Hub",
  description:
    "Plataforma interna NQS — acceso centralizado al stack de IA del estudio.",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

/**
 * Root layout async: lee el theme del usuario logueado (light por
 * default si no hay sesión). El CSS del cliente ya tiene
 * `[data-theme="light"]` con todas las variables redefinidas, así que
 * cambiar este atributo cambia el estilo sin recargar.
 *
 * El `ThemeToggle` en la topbar se encarga del toggle client-side +
 * persistencia en `users.theme_preference`.
 */
export default async function RootLayout({ children }: RootLayoutProps) {
  const session = await getSession();
  const theme = session?.theme ?? "light";

  return (
    <html lang="es" data-theme={theme}>
      <body className="app">{children}</body>
    </html>
  );
}
