export default function ToolLoading() {
  return (
    <div
      className="page"
      aria-busy="true"
      aria-label="Cargando herramienta"
      style={{
        minHeight: "calc(100vh - 60px - 38px)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div className="t-eyebrow" style={{ marginBottom: 12 }}>
          ↳ CARGANDO HERRAMIENTA
        </div>
        <div className="pulse t-meta dim">
          Preparando proyecto y conversaciones…
        </div>
      </div>
    </div>
  );
}
