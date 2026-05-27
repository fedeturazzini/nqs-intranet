/**
 * PATCH /api/admin/tools/schedule
 *
 * Body: { userId, toolId, schedule: ToolSchedule | null }
 *
 * Actualiza el JSONB `tool_access.schedule` para un (user, tool).
 * `schedule = null` desactiva el control horario (acceso libre 24/7).
 *
 * Validamos forma del schedule con Zod — cada día opcional con
 * { enabled: true, from: "HH:MM", to: "HH:MM" } o { enabled: false }.
 * Horario "from < to" obligatorio (no soportamos ventanas que cruzan
 * medianoche por ahora).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerClient } from "@/lib/db/supabase";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DayScheduleSchema = z.union([
  z.object({
    enabled: z.literal(true),
    from: z.string().regex(HHMM, "from debe ser HH:MM"),
    to: z.string().regex(HHMM, "to debe ser HH:MM"),
  }).refine((d) => d.from < d.to, {
    message: "from debe ser menor que to (no soportamos ventanas cruzando medianoche)",
  }),
  z.object({ enabled: z.literal(false) }),
]);

const ScheduleSchema = z.object({
  monday: DayScheduleSchema.optional(),
  tuesday: DayScheduleSchema.optional(),
  wednesday: DayScheduleSchema.optional(),
  thursday: DayScheduleSchema.optional(),
  friday: DayScheduleSchema.optional(),
  saturday: DayScheduleSchema.optional(),
  sunday: DayScheduleSchema.optional(),
});

const BodySchema = z.object({
  userId: z.string().uuid(),
  toolId: z.string().min(1),
  schedule: ScheduleSchema.nullable(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "bad_request",
        message: `${first.path.join(".") || "body"}: ${first.message}`,
      },
      { status: 400 },
    );
  }
  const { userId, toolId, schedule } = parsed.data;

  const db = createServerClient();
  // Upsert para que funcione aunque no exista tool_access aún (default
  // status='active' en el insert para no romper el acceso cuando solo
  // querés setear el schedule).
  const { error } = await db.from("tool_access").upsert(
    {
      user_id: userId,
      tool_id: toolId,
      schedule,
      granted_by: guard.userId,
    },
    { onConflict: "user_id,tool_id" },
  );
  if (error) {
    return NextResponse.json(
      { error: "db_error", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
