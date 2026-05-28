/**
 * PATCH /api/me/preferences
 *
 * Actualiza preferencias del user actual. Por ahora solo `theme`.
 * Body: { theme: "light" | "dark" }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";

const BodySchema = z.object({
  theme: z.enum(["light", "dark"]),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const { error } = await db
    .from("users")
    .update({ theme_preference: parsed.data.theme })
    .eq("id", session.userId);
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, theme: parsed.data.theme });
}
