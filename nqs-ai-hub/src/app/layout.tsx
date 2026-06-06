import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "@/styles/globals.css";
import { getSession } from "@/lib/auth/server";

// Design system NQS: fuentes self-hosted por Next (sin request a Google en
// runtime, sin flash de fuente). Inter y JetBrains Mono son variable fonts,
// así que no hace falta declarar weights. La serif (Instrument Serif) se
// declara aparte más abajo porque no es variable font.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
// Instrument Serif: override de serif del HTML del cliente (más editorial que
// Times). No es variable font → hay que declarar weight; traemos normal +
// italic porque los títulos del diseño usan italic.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

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
    <html
      lang="es"
      data-theme={theme}
      className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="app">{children}</body>
    </html>
  );
}
