/**
 * POST /api/projects/[id]/verify-password
 *
 * Gate de un proyecto PRIVADO (migration 0016). Body: { password }.
 * bcrypt.compare contra projects.password_hash. Si coincide, setea la cookie
 * httpOnly de gate (30 min) firmada con { projectId, gateVersion } y devuelve
 * { success: true }.
 *
 *   - Proyecto abierto o inexistente → 400 (no hay nada que desbloquear).
 *   - Password incorrecta → 401 genérico.
 *
 * Requiere sesión (cualquier user logueado), NO admin — los admins pasan el
 * mismo gate (si olvidan la clave, la resetean desde el panel).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import {
  PROJECT_GATE_TTL_SECONDS,
  mintProjectGateToken,
  projectGateCookieName,
} from "@/lib/auth/project-gate";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({ password: z.string().min(1).max(200) });

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = createServerClient();
  const { data: project } = await db
    .from("projects")
    .select("id, is_private, gate_version, password_hash")
    .eq("id", id)
    .maybeSingle();

  if (!project || !project.is_private || !project.password_hash) {
    return NextResponse.json(
      { error: "not_private", message: "Este proyecto no requiere contraseña" },
      { status: 400 },
    );
  }

  const ok = await bcrypt.compare(parsed.data.password, project.password_hash);
  if (!ok) {
    // 401 genérico — no distinguimos "password incorrecta" de otros fallos.
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const isProd = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ success: true });
  res.cookies.set(
    projectGateCookieName(project.id),
    mintProjectGateToken(project.id, project.gate_version),
    {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: PROJECT_GATE_TTL_SECONDS,
    },
  );
  return res;
}
