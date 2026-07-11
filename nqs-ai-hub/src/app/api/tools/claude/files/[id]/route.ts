/**
 * GET /api/tools/claude/files/[id]
 *
 * Devuelve una signed download URL (1h) para un archivo generado por Claude
 * (PDF/Word/Excel/PPT). El binario vive en Storage privado (bucket
 * `claude-uploads`), así que se firma on-demand. Valida ownership: el archivo
 * tiene que pertenecer al user logueado (403 si no).
 *
 * Response: { url } | { error }
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { createFileDownloadUrl } from "@/lib/storage/claude-uploads";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse> {
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
  // Ownership: el archivo tiene que ser del user logueado.
  if (file.user_id !== session.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = await createFileDownloadUrl(file.storage_path, file.name);
  if (!url) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }
  return NextResponse.json({ url });
}
