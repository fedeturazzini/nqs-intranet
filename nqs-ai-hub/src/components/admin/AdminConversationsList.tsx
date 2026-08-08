"use client";

/**
 * Lista de conversaciones de un usuario (admin, solo lectura).
 * Paginación con "cargar más".
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ConvRow = {
  id: string;
  title: string | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminConversationsListProps = Readonly<{
  userId: string;
  userName: string;
}>;

const PAGE = 50;

const DT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function AdminConversationsList({
  userId,
  userName,
}: AdminConversationsListProps) {
  const router = useRouter();
  const [items, setItems] = useState<ConvRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          limit: String(PAGE),
          offset: String(nextOffset),
        });
        const res = await fetch(
          `/api/admin/users/${userId}/conversations?${qs}`,
          { cache: "no-store" },
        );
        if (res.status === 403) {
          router.refresh();
          return;
        }
        if (!res.ok) {
          setError("no pude cargar las conversaciones");
          return;
        }
        const data = (await res.json()) as {
          conversations: ConvRow[];
          hasMore: boolean;
        };
        setItems((prev) =>
          append ? [...prev, ...data.conversations] : data.conversations,
        );
        setHasMore(data.hasMore);
        setOffset(nextOffset + data.conversations.length);
      } catch {
        setError("error de red");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId, router],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <div className="page" style={{ padding: 32 }}>
      <Link
        href={`/admin/logs/${userId}`}
        className="t-meta"
        style={{ color: "var(--accent)" }}
      >
        ← volver al gasto
      </Link>

      <div className="t-eyebrow" style={{ margin: "14px 0 6px" }}>
        ↳ ADMIN · GASTO · CONVERSACIONES · SOLO LECTURA
      </div>
      <h1 className="page-title" style={{ fontSize: 26, margin: 0 }}>
        Conversaciones de{" "}
        <em style={{ fontFamily: "var(--serif)" }}>{userName}</em>
      </h1>
      <p className="t-meta dim" style={{ marginTop: 6, marginBottom: 18 }}>
        Vista de supervisión. No se puede escribir ni renombrar.
      </p>

      {loading && (
        <div className="t-meta dim" style={{ padding: "24px 0" }}>
          cargando…
        </div>
      )}
      {error && (
        <div className="t-meta" style={{ color: "var(--danger)" }}>
          ↳ {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div
          className="t-meta dim"
          style={{ padding: "40px 0", textAlign: "center" }}
        >
          ↳ sin conversaciones
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((c) => (
          <Link
            key={c.id}
            href={`/admin/logs/${userId}/conversations/${c.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--bg-elev)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}>
                {c.title?.trim() || "(sin título)"}
              </div>
              <div className="t-meta dim" style={{ fontSize: 10, marginTop: 2 }}>
                {c.projectName ?? "Sin proyecto"}
              </div>
            </div>
            <div className="t-meta dim" style={{ fontSize: 11, flexShrink: 0 }}>
              {c.updatedAt ? DT.format(new Date(c.updatedAt)) : "—"}
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          className="btn sm secondary"
          style={{ marginTop: 16 }}
          disabled={loadingMore}
          onClick={() => void load(offset, true)}
        >
          {loadingMore ? "cargando…" : "cargar más →"}
        </button>
      )}
    </div>
  );
}
