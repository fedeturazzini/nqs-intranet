"use client";

/**
 * Vista de gestión de créditos para una tool. Adaptado de
 * design/screens.jsx líneas 1057-1145 (AdminCredits).
 *
 * Estructura:
 *   - Hero card con título + descripción.
 *   - 3 StatTiles: POOL TOTAL · ASIGNADOS · DISPONIBLE.
 *   - Tabla con: usuario · rol · uso mensual (barra) · disponibles ·
 *     botones de ajuste (−5 / − / + / +5).
 *   - Botones globales: "comprar más créditos" / "historial".
 *
 * Reglas de UX:
 *   - Update optimista en +/-: el número se actualiza al toque y si el
 *     server rechaza (ej. credits_assigned < credits_used), revertimos
 *     + toast rojo.
 *   - "−" / "−5" se bloquea si llevaría el assigned por debajo de used.
 *   - Confirm modal antes de quitar TODOS los créditos a un user.
 */
import { useCallback, useMemo, useState } from "react";
import { StatTile } from "./StatTile";
import { BuyCreditsModal } from "./BuyCreditsModal";
import { TransactionsModal } from "./TransactionsModal";
import { showToast } from "@/lib/store/toast";

export type AllocationRow = {
  userId: string;
  name: string;
  initials: string;
  dept: string | null;
  role: "admin" | "employee";
  assigned: number;
  used: number;
  allocationId: string | null;
};

type AdminCreditsViewProps = Readonly<{
  toolId: string;
  poolTotal: number;
  initialRows: AllocationRow[];
}>;

export function AdminCreditsView({
  toolId,
  poolTotal: initialPool,
  initialRows,
}: AdminCreditsViewProps) {
  const [poolTotal, setPoolTotal] = useState(initialPool);
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [showBuy, setShowBuy] = useState(false);
  const [showTx, setShowTx] = useState(false);

  const allocated = useMemo(
    () => rows.reduce((s, r) => s + r.assigned, 0),
    [rows],
  );
  const remaining = poolTotal - allocated;

  const adjust = useCallback(
    async (userId: string, delta: number) => {
      const row = rows.find((r) => r.userId === userId);
      if (!row) return;
      const newAssigned = row.assigned + delta;

      // Guardrail local: no permitir negativo ni dejar al user
      // por debajo de lo que ya consumió (DB lo rechazaría igual).
      if (newAssigned < 0) return;
      if (newAssigned < row.used) {
        showToast({
          title: "NO PODÉS BAJAR DE LO USADO",
          msg: `${row.name} ya gastó ${row.used} créditos. Mínimo asignado: ${row.used}.`,
          color: "var(--warn)",
        });
        return;
      }

      // Confirm si vamos a 0 con assigned > 0.
      if (newAssigned === 0 && row.assigned > 0) {
        const ok = confirm(
          `¿Quitar TODOS los créditos a ${row.name}? Va a quedar sin acceso a compras.`,
        );
        if (!ok) return;
      }

      // Optimistic update.
      const prevRows = rows;
      setRows((prev) =>
        prev.map((r) =>
          r.userId === userId ? { ...r, assigned: newAssigned } : r,
        ),
      );
      setBusy((b) => ({ ...b, [userId]: true }));

      try {
        const res = await fetch("/api/admin/credits/allocations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, toolId, delta }),
        });
        const data = (await res.json()) as
          | { ok: true; credits_assigned: number }
          | { error: string; message?: string };
        if (!res.ok || !("ok" in data)) {
          // Rollback.
          setRows(prevRows);
          showToast({
            title: "ERROR AL AJUSTAR",
            msg:
              "message" in data && data.message
                ? data.message
                : "no se pudo aplicar el cambio",
            color: "var(--danger)",
          });
        } else {
          // Sincronizar con el valor authoritative del server.
          setRows((prev) =>
            prev.map((r) =>
              r.userId === userId
                ? { ...r, assigned: data.credits_assigned }
                : r,
            ),
          );
        }
      } catch (err) {
        setRows(prevRows);
        showToast({
          title: "ERROR DE RED",
          msg: err instanceof Error ? err.message : "no se pudo conectar",
          color: "var(--danger)",
        });
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[userId];
          return next;
        });
      }
    },
    [rows, toolId],
  );

  const refreshPool = useCallback(async () => {
    // Refetch del state completo via reload. Para esta sesión es el
    // patrón más simple — si después el costo de un reload molesta, se
    // arma un endpoint dedicado /api/admin/credits/state.
    window.location.reload();
  }, []);

  return (
    <div className="col" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Hero */}
      <div
        className="card card-pad"
        style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "var(--bg-elev)",
          padding: "22px 24px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="t-eyebrow">↳ POOL DE CRÉDITOS · 3DSKY</div>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 28,
              letterSpacing: "-0.02em",
              marginTop: 6,
              lineHeight: 1.15,
              maxWidth: 720,
            }}
          >
            Asigná y reasigná créditos a tu equipo. Una vez que un usuario
            los gasta, no puede gastar más hasta que vos lo habilites.
          </div>
        </div>
      </div>

      {/* StatTiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}
      >
        <StatTile label="POOL TOTAL" value={poolTotal} unit="créditos" />
        <StatTile
          label="ASIGNADOS"
          value={allocated}
          unit={`/ ${poolTotal}`}
          accent="var(--accent)"
        />
        <StatTile
          label="DISPONIBLE"
          value={remaining}
          unit="para repartir"
          accent={
            remaining < 0
              ? "var(--danger)"
              : remaining < 20
                ? "var(--warn)"
                : "var(--ok)"
          }
        />
      </div>

      {remaining < 0 && (
        <div
          className="t-meta"
          style={{
            color: "var(--danger)",
            background: "rgba(255,92,92,0.06)",
            border: "1px solid rgba(255,92,92,0.32)",
            padding: "10px 14px",
            borderRadius: 8,
          }}
        >
          ↳ Asignaste más créditos que los del pool. Comprá más para
          que las allocations sumen menos o igual al pool.
        </div>
      )}

      {/* Tabla de asignaciones */}
      <div
        className="card"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "var(--bg-elev)",
          overflow: "hidden",
        }}
      >
        <div
          className="card-hd"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div className="t-eyebrow">↳ ASIGNACIÓN POR USUARIO</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setShowBuy(true)}
            >
              comprar más créditos
            </button>
            <button
              type="button"
              className="btn sm secondary"
              onClick={() => setShowTx(true)}
            >
              historial
            </button>
          </div>
        </div>

        <div style={{ padding: "0 18px 14px" }}>
          <RowHead />
          {rows.length === 0 && (
            <div
              className="t-meta dim"
              style={{ padding: "30px 0", textAlign: "center" }}
            >
              ↳ no hay employees registrados todavía
            </div>
          )}
          {rows.map((row) => (
            <AllocRow
              key={row.userId}
              row={row}
              busy={busy[row.userId] === true}
              onAdjust={(delta) => adjust(row.userId, delta)}
            />
          ))}
        </div>
      </div>

      {showBuy && (
        <BuyCreditsModal
          toolId={toolId}
          onClose={() => setShowBuy(false)}
          onPurchased={(added) => {
            setPoolTotal((p) => p + added);
            setShowBuy(false);
          }}
        />
      )}

      {showTx && (
        <TransactionsModal
          toolId={toolId}
          onClose={() => setShowTx(false)}
        />
      )}
    </div>
  );
}

// ───────────────── Filas de la tabla ─────────────────

const GRID_COLS = "1.4fr 0.8fr 1fr 0.8fr 200px 60px";

function RowHead() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 12,
        padding: "12px 0 10px",
        borderBottom: "1px solid var(--line)",
        fontFamily: "var(--mono)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--fg-mute)",
      }}
    >
      <div>USUARIO</div>
      <div>ROL</div>
      <div>USO MENSUAL</div>
      <div>DISPONIBLES</div>
      <div style={{ textAlign: "center" }}>AJUSTAR</div>
      <div />
    </div>
  );
}

type AllocRowProps = Readonly<{
  row: AllocationRow;
  busy: boolean;
  onAdjust: (delta: number) => void;
}>;

function AllocRow({ row, busy, onAdjust }: AllocRowProps) {
  const free = row.assigned - row.used;
  const pct =
    row.assigned === 0 ? 0 : Math.min(100, (row.used / row.assigned) * 100);

  const freeColor =
    free === 0
      ? "var(--danger)"
      : free < 3
        ? "var(--warn)"
        : "var(--fg)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 12,
        padding: "14px 0",
        borderBottom: "1px solid var(--line)",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          className="av"
          style={{ width: 30, height: 30, fontSize: 11 }}
          title={row.userId}
        >
          {row.initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.name}
          </div>
          <div className="t-meta dim" style={{ fontSize: 10 }}>
            {row.dept ?? "—"}
          </div>
        </div>
      </div>

      <div className="t-meta" style={{ textTransform: "uppercase" }}>
        {row.role}
      </div>

      <div>
        <div
          className="meter"
          style={{ width: "100%" }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="meter-fill"
            style={{
              width: `${pct}%`,
              background: pct > 80 ? "var(--warn)" : "#4FD1C5",
            }}
          />
        </div>
        <div className="t-meta" style={{ marginTop: 4 }}>
          {row.used} / {row.assigned} este mes
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 26,
            letterSpacing: "-0.02em",
            color: freeColor,
          }}
        >
          {free}
        </span>
        <span className="t-meta">cr.</span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <AdjustBtn label="−5" disabled={busy || row.assigned - 5 < row.used} onClick={() => onAdjust(-5)} kind="secondary" />
        <AdjustBtn label="−" disabled={busy || row.assigned - 1 < row.used} onClick={() => onAdjust(-1)} kind="secondary" />
        <AdjustBtn label="+" disabled={busy} onClick={() => onAdjust(1)} kind="primary" />
        <AdjustBtn label="+5" disabled={busy} onClick={() => onAdjust(5)} kind="primary" />
      </div>

      <div style={{ textAlign: "right" }}>
        <button
          type="button"
          className="btn ghost sm"
          aria-label="acciones"
          title="más acciones (próximamente)"
          disabled
          style={{ opacity: 0.5, cursor: "not-allowed" }}
        >
          ⋯
        </button>
      </div>
    </div>
  );
}

type AdjustBtnProps = Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  kind: "primary" | "secondary";
}>;

function AdjustBtn({ label, disabled, onClick, kind }: AdjustBtnProps) {
  return (
    <button
      type="button"
      className={`btn sm ${kind === "secondary" ? "secondary" : ""}`}
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 32,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
