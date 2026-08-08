/**
 * GET /api/tools/claude/files/[id]
 *
 * Devuelve una signed URL (1h) para un archivo generado por Claude
 * (PDF/Word/Excel/PPT). El binario vive en Storage privado (bucket
 * `claude-uploads`), así que se firma on-demand. Valida ownership: el archivo
 * tiene que pertenecer al user logueado (403 si no) — excepto admin con gate
 * de Gastos válido (ver conversaciones ajenas).
 *
 *   - sin query        → URL de DESCARGA (Content-Disposition: attachment con el
 *                        nombre real; para el botón "Descargar").
 *   - ?inline=1        → URL INLINE (sin attachment) para renderizar el PDF
 *                        embebido en el visor (preview).
 *
 * Response: { url } | { error }
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { hasGastosGate } from "@/lib/auth/gastos-gate";
import { createServerClient } from "@/lib/db/supabase";
import {
  createFileDownloadUrl,
  signDownloadUrls,
} from "@/lib/storage/claude-uploads";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const { data: file, error } = await db
    .from("claude_files")
    .select("user_id, storage_path, name")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Ownership: dueño, o admin con gate de Gastos (vista de conversaciones).
  if (file.user_id !== session.userId) {
    const adminUnlocked =
      session.role === "admin" && (await hasGastosGate());
    if (!adminUnlocked) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // ?inline=1 → URL sin Content-Disposition:attachment (renderiza el PDF embebido
  // en el visor). Sin el param → URL de descarga (con el nombre real).
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  if (inline) {
    const signed = await signDownloadUrls([file.storage_path]);
    const url = signed[0]?.url;
    if (!url) {
      return NextResponse.json({ error: "sign_failed" }, { status: 500 });
    }
    return NextResponse.json({ url });
  }

  const url = await createFileDownloadUrl(file.storage_path, file.name);
  if (!url) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }
  return NextResponse.json({ url });
}
