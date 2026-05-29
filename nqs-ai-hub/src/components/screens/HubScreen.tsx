"use client";

/**
 * Hub principal — el catálogo de tools del workspace.
 *
 * Adaptado de design/screens.jsx líneas 98-208. Cliente porque maneja
 * filter / search / drag-and-drop / persistencia en localStorage.
 *
 * Recibe los datos ya resueltos (ToolWithAccess[]) desde el Server
 * Component padre — no fetcha. Si en algún momento querés refrescar
 * sin recargar la página, llamá GET /api/me/access y reinjectá props.
 *
 * Drag-and-drop: HTML5 nativo, sin librería externa. Cada card declara
 * sus handlers y manejamos el reorder en el state local. El orden
 * persiste en `localStorage["nqs-tool-order"]` (lectura defensiva en
 * useEffect para evitar hydration mismatch).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OutsideHoursModal } from "@/components/tool/OutsideHoursModal";
import { RequestAccessModal } from "@/components/tool/RequestAccessModal";
import { ToolCard } from "@/components/tool/ToolCard";
import { ToolRow } from "@/components/tool/ToolRow";
import { showToast } from "@/lib/store/toast";
import { checkSchedule } from "@/lib/utils/schedule";
import type { ToolWithAccess } from "@/lib/db/queries/access";
import type { ToolId } from "@/types/db-aliases";

const ORDER_KEY = "nqs-tool-order";

type Filter = "all" | "active" | "pending" | "locked";
type Layout = "grid" | "list";

type HubScreenProps = Readonly<{
  tools: ToolWithAccess[];
  /** Nombre del user para el saludo. */
  userFirstName: string;
}>;

function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 6 && h < 13) return "Buenos días";
  if (h >= 13 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function HubScreen({ tools, userFirstName }: HubScreenProps) {
  const router = useRouter();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<Layout>("grid");

  // Order persistido. Inicializamos con el orden que llegó del server
  // (que ya viene ordenado por status). En el primer render del cliente
  // intentamos hidratar desde localStorage.
  const defaultOrder = useMemo<ToolId[]>(
    () => tools.map((t) => t.id),
    [tools],
  );
  const [order, setOrder] = useState<ToolId[]>(defaultOrder);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const validIds = new Set<string>(defaultOrder);
      // El filter garantiza que cada id está en validIds (= es un ToolId
      // del catálogo actual), así que el cast a ToolId es seguro.
      const filtered = parsed.filter(
        (id): id is ToolId => typeof id === "string" && validIds.has(id),
      );
      if (filtered.length === 0) return;
      // Si suman tools nuevas no presentes en el storage, las
      // appendeamos al final para que aparezcan igual.
      const filteredSet = new Set<string>(filtered);
      const missing = defaultOrder.filter((id) => !filteredSet.has(id));
      setOrder([...filtered, ...missing]);
    } catch {
      // localStorage corrupto / inaccesible — ignoramos.
    }
    // Solo en mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } catch {
      // Sin localStorage (modo privado en algunos browsers) — no es crítico.
    }
  }, [order]);

  // Mapa para lookup rápido por id.
  const byId = useMemo(
    () => new Map(tools.map((t) => [t.id, t])),
    [tools],
  );

  // Aplicamos order primero, después filter + search.
  const orderedTools = useMemo(() => {
    const arr = order
      .map((id) => byId.get(id))
      .filter((t): t is ToolWithAccess => t !== undefined);
    // Por si quedó alguna tool sin entrar al order (paranoia).
    const inOrder = new Set<string>(order);
    for (const t of tools) {
      if (!inOrder.has(t.id)) arr.push(t);
    }
    return arr;
  }, [order, byId, tools]);

  const counts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let locked = 0;
    for (const t of tools) {
      const s = t.access.status;
      if (s === "active") active++;
      else if (s === "pending") pending++;
      else if (s === "locked" || s === "expired") locked++;
    }
    return { all: tools.length, active, pending, locked };
  }, [tools]);

  const filtered = orderedTools.filter((t) => {
    if (query && !t.name.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    if (filter === "all") return true;
    if (filter === "active") return t.access.status === "active";
    if (filter === "pending") return t.access.status === "pending";
    if (filter === "locked") {
      return t.access.status === "locked" || t.access.status === "expired";
    }
    return true;
  });

  // ─── drag & drop ──────────────────────────────────────────
  const [dragId, setDragId] = useState<ToolId | null>(null);
  const [dragOverId, setDragOverId] = useState<ToolId | null>(null);

  const handleDragStart =
    (id: ToolId) => (e: React.DragEvent<HTMLDivElement>) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", id);
      } catch {
        // Safari edge case — ignorable.
      }
    };

  const handleDragOver =
    (id: ToolId) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (id !== dragOverId) setDragOverId(id);
    };

  const handleDrop =
    (id: ToolId) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!dragId || dragId === id) {
        setDragId(null);
        setDragOverId(null);
        return;
      }
      setOrder((prev) => {
        const next = prev.filter((x) => x !== dragId);
        const idx = next.indexOf(id);
        const safeIdx = idx < 0 ? next.length : idx;
        next.splice(safeIdx, 0, dragId);
        return next;
      });
      setDragId(null);
      setDragOverId(null);
    };

  // ─── handlers de acción ──────────────────────────────────
  // Si la tool tiene schedule configurado y estamos fuera de horario,
  // abrimos el modal en lugar de redirigir. Server igual valida con
  // canUseTool, así que esto es una mejora UX (no de seguridad).
  const [outsideHoursTool, setOutsideHoursTool] = useState<ToolWithAccess | null>(
    null,
  );
  const [requestAccessTool, setRequestAccessTool] =
    useState<ToolWithAccess | null>(null);

  const onOpen = (tool: ToolWithAccess) => {
    const schedule = tool.access.schedule ?? null;
    if (schedule) {
      const check = checkSchedule(schedule);
      if (!check.allowed) {
        setOutsideHoursTool(tool);
        return;
      }
    }
    router.push(`/tool/${tool.id}`);
  };

  // El user clickeó una tool sin acceso (locked) → modal para pedir
  // que el admin se la habilite. Tools coming_soon no llegan acá (la
  // card las muestra disabled).
  const onRequest = (tool: ToolWithAccess) => {
    if (tool.access.status === "coming_soon") return;
    setRequestAccessTool(tool);
  };

  // ─── header dinámico ─────────────────────────────────────
  // Calculamos en el cliente para que el saludo refleje la hora del user,
  // no la del server. Para evitar hydration mismatch, arrancamos con
  // "Hola" y reemplazamos en useEffect.
  const [header, setHeader] = useState<{
    greeting: string;
    dateStr: string;
  }>({
    greeting: "Hola",
    dateStr: "",
  });
  useEffect(() => {
    const now = new Date();
    setHeader({
      greeting: greeting(now),
      dateStr: DATE_FMT.format(now),
    });
  }, []);

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>
            ↳ TU WORKSPACE
          </div>
          <h1 className="page-title">
            {header.greeting},{" "}
            <em>{userFirstName}.</em>
          </h1>
          <div className="page-sub">
            Tu suite del día. Arrastrá las cards para reordenarlas a tu
            gusto.
          </div>
        </div>
        <div className="page-meta">
          <div>HOY</div>
          <strong>{header.dateStr || "—"}</strong>
          <div>EQUIPO ONLINE</div>
          <strong>{counts.active + 1} personas</strong>
        </div>
      </div>

      <div className="hub-toolbar">
        <div className="hub-filters">
          <FilterButton
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="Todas"
            count={counts.all}
          />
          <FilterButton
            active={filter === "active"}
            onClick={() => setFilter("active")}
            label="Activas"
            count={counts.active}
          />
          <FilterButton
            active={filter === "pending"}
            onClick={() => setFilter("pending")}
            label="Pendientes"
            count={counts.pending}
          />
          <FilterButton
            active={filter === "locked"}
            onClick={() => setFilter("locked")}
            label="Bloqueadas"
            count={counts.locked}
          />
        </div>

        <div className="hub-search">
          <span className="t-meta">⌕</span>
          <input
            placeholder="buscar herramienta…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="buscar herramienta"
          />
          <span className="kbd">⌘K</span>
        </div>

        <div className="hub-filters">
          <FilterButton
            active={layout === "grid"}
            onClick={() => setLayout("grid")}
            label="Grid"
          />
          <FilterButton
            active={layout === "list"}
            onClick={() => setLayout("list")}
            label="Lista"
          />
        </div>
      </div>

      {layout === "grid" ? (
        <div className="hub-grid">
          {filtered.map((t) => (
            <ToolCard
              key={t.id}
              tool={t}
              idx={orderedTools.indexOf(t)}
              onOpen={onOpen}
              onRequest={onRequest}
              draggable
              onDragStart={handleDragStart(t.id)}
              onDragOver={handleDragOver(t.id)}
              onDrop={handleDrop(t.id)}
              dragging={dragId === t.id}
              dragOver={dragOverId === t.id && dragId !== t.id}
            />
          ))}
        </div>
      ) : (
        <div className="hub-list">
          {filtered.map((t) => (
            <ToolRow
              key={t.id}
              tool={t}
              idx={orderedTools.indexOf(t)}
              onOpen={onOpen}
              onRequest={onRequest}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div
          className="t-meta dim"
          style={{ padding: "60px 0", textAlign: "center" }}
        >
          ↳ no hay herramientas que coincidan con el filtro
        </div>
      )}

      <OutsideHoursModal
        open={outsideHoursTool !== null}
        toolId={outsideHoursTool?.id ?? ""}
        toolName={outsideHoursTool?.name ?? ""}
        schedule={outsideHoursTool?.access.schedule ?? null}
        onClose={() => setOutsideHoursTool(null)}
        onSubmitted={() => {
          setOutsideHoursTool(null);
        }}
      />

      <RequestAccessModal
        open={requestAccessTool !== null}
        toolId={requestAccessTool?.id ?? ""}
        toolName={requestAccessTool?.name ?? ""}
        toolGlyph={requestAccessTool?.glyph}
        toolColor={requestAccessTool?.color}
        onClose={() => setRequestAccessTool(null)}
        onSubmitted={() => {
          setRequestAccessTool(null);
        }}
      />
    </div>
  );
}

type FilterButtonProps = Readonly<{
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}>;

function FilterButton({ active, onClick, label, count }: FilterButtonProps) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      onClick={onClick}
    >
      {label}
      {count != null ? ` · ${count}` : ""}
    </button>
  );
}
