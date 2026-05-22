/**
 * Placeholder — cada tool resuelve a su propia view en sesiones
 * posteriores (Claude en 07, 3DSky en 09, etc).
 *
 * En Next 16 `params` viene como Promise y hay que await-earla.
 */
type ToolPageProps = {
  params: Promise<{ toolId: string }>;
};

export default async function ToolPage({ params }: ToolPageProps) {
  const { toolId } = await params;
  return (
    <main className="center grow" style={{ padding: 80 }}>
      <div className="t-eyebrow">tool · {toolId}</div>
    </main>
  );
}
