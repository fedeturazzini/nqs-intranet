/**
 * Placeholder layout para el grupo `(dashboard)`.
 * En `prompts/mvp/04-layout.md` se reemplaza por el layout real
 * (topbar + marquee + nav + user chip).
 */
type DashboardLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <>{children}</>;
}
