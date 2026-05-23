/**
 * Crea (idempotente) los 3 usuarios seed del MVP:
 *
 *   tomas@nqs.test  / nqs2026admin     (admin)
 *   sofia@nqs.test  / nqs2026sofia     (employee)
 *   bruno@nqs.test  / nqs2026bruno     (employee)
 *
 * Para cada uno:
 *   - crea el user en auth.users (si no existe)
 *   - inserta o updatea el registro en public.users con el mismo UUID
 *   - para los employees, activa tool_access en claude + 3dsky
 *   - para los employees, asigna créditos 3dsky (sofia 30, bruno 20)
 *
 * Uso:
 *   npx tsx scripts/create-users.ts
 *
 * Requiere `.env.local` con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database, ToolId, UserRole } from "../src/types/db";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const db = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SeedUser = {
  email: string;
  password: string;
  name: string;
  initials: string;
  role: UserRole;
  dept: string;
  jobTitle: string;
  toolAccess: ToolId[];
  credits3DSky: number;
};

const seedUsers: SeedUser[] = [
  {
    email: "tomas@nqs.test",
    password: "nqs2026admin",
    name: "Tomás Pérez",
    initials: "TP",
    role: "admin",
    dept: "Dirección",
    jobTitle: "Founder / Admin",
    toolAccess: [],
    credits3DSky: 0,
  },
  {
    email: "sofia@nqs.test",
    password: "nqs2026sofia",
    name: "Sofía Galván",
    initials: "SG",
    role: "employee",
    dept: "Diseño",
    jobTitle: "Senior Designer",
    toolAccess: ["claude", "3dsky"],
    credits3DSky: 30,
  },
  {
    email: "bruno@nqs.test",
    password: "nqs2026bruno",
    name: "Bruno Acuña",
    initials: "BA",
    role: "employee",
    dept: "Video",
    jobTitle: "Motion Designer",
    toolAccess: ["claude", "3dsky"],
    credits3DSky: 20,
  },
];

async function findAuthUserByEmail(email: string): Promise<string | null> {
  // listUsers admite paginado; con 3 users alcanza la primera página.
  const { data, error } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  const found = data.users.find((u) => u.email === email);
  return found?.id ?? null;
}

async function ensureAuthUser(user: SeedUser): Promise<string> {
  const existing = await findAuthUserByEmail(user.email);
  if (existing) {
    console.log(`  · auth user ya existe — ${user.email} (${existing})`);
    return existing;
  }
  const { data, error } = await db.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { name: user.name, role: user.role },
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser no devolvió user");
  console.log(`  · auth user creado — ${user.email} (${data.user.id})`);
  return data.user.id;
}

async function upsertPublicUser(id: string, user: SeedUser): Promise<void> {
  const { error } = await db.from("users").upsert(
    {
      id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      role: user.role,
      dept: user.dept,
      job_title: user.jobTitle,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  console.log(`  · public.users upserted — ${user.email}`);
}

async function grantToolAccess(
  userId: string,
  toolIds: ToolId[],
  grantedBy: string,
): Promise<void> {
  if (toolIds.length === 0) return;
  const rows = toolIds.map((toolId) => ({
    user_id: userId,
    tool_id: toolId,
    status: "active" as const,
    granted_by: grantedBy,
  }));
  const { error } = await db
    .from("tool_access")
    .upsert(rows, { onConflict: "user_id,tool_id" });
  if (error) throw error;
  console.log(`  · tool_access — ${toolIds.join(", ")}`);
}

async function allocateCredits(
  userId: string,
  toolId: ToolId,
  assigned: number,
): Promise<void> {
  if (assigned === 0) return;
  const { error } = await db.from("credit_allocations").upsert(
    {
      user_id: userId,
      tool_id: toolId,
      credits_assigned: assigned,
      credits_used: 0,
    },
    { onConflict: "user_id,tool_id" },
  );
  if (error) throw error;
  console.log(`  · credit_allocations — ${toolId}: ${assigned}`);
}

async function main(): Promise<void> {
  console.log("Seeding users → " + url);
  const ids: Record<string, string> = {};

  for (const user of seedUsers) {
    console.log(`\n[${user.email}]`);
    const id = await ensureAuthUser(user);
    ids[user.email] = id;
    await upsertPublicUser(id, user);
  }

  const adminId = ids["tomas@nqs.test"];
  if (!adminId) throw new Error("No se encontró el admin para granted_by");

  for (const user of seedUsers) {
    if (user.role !== "employee") continue;
    console.log(`\n[${user.email} — grants]`);
    const userId = ids[user.email];
    await grantToolAccess(userId, user.toolAccess, adminId);
    await allocateCredits(userId, "3dsky", user.credits3DSky);
  }

  console.log("\n✓ seed completo.");
}

main().catch((err) => {
  console.error("\n✗ seed falló:", err);
  process.exit(1);
});
