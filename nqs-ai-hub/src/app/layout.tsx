import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "NQS AI Hub",
  description:
    "Plataforma interna NQS — acceso centralizado al stack de IA del estudio.",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es" data-theme="dark">
      <body className="app">{children}</body>
    </html>
  );
}
