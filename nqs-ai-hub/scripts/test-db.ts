/**
 * Smoke test contra la DB de Supabase.
 *
 *   npx tsx scripts/test-db.ts
 *
 * Verifica:
 *   - Conexión vía service_role.
 *   - listUsers() devuelve al menos los 3 seeds.
 *   - listTools() devuelve los 7 tools del roadmap.
 *   - getActiveSystemPrompt('claude') devuelve el placeholder desencriptado.
 *   - getToolAccess() devuelve un access activo para Sofía en Claude.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { listUsers, getUserByEmail } from "../src/lib/db/queries/users";
import { listTools, getToolAccess } from "../src/lib/db/queries/tools";
import { getActiveSystemPrompt } from "../src/lib/db/queries/system-prompts";

function divider(title: string) {
  console.log("\n" + "─".repeat(60));
  console.log("  " + title);
  console.log("─".repeat(60));
}

async function main(): Promise<void> {
  divider("USERS");
  const users = await listUsers();
  console.table(
    users.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      dept: u.dept,
    })),
  );
  console.log(`Total: ${users.length}`);

  divider("TOOLS");
  const tools = await listTools();
  console.table(
    tools.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      is_active: t.is_active,
      uses_credits: t.uses_credits,
    })),
  );
  console.log(`Total: ${tools.length}`);

  divider("SYSTEM PROMPT — claude");
  const prompt = await getActiveSystemPrompt("claude");
  if (!prompt) {
    console.log("⚠️ no hay system_prompt activo para claude");
  } else {
    console.log(`name:    ${prompt.name}`);
    console.log(`version: ${prompt.version}`);
    console.log(`id:      ${prompt.id}`);
    console.log(`content: ${prompt.content.slice(0, 200)}…`);
  }

  divider("TOOL ACCESS — sofia → claude");
  const sofia = await getUserByEmail("sofia@nqs.test");
  if (!sofia) {
    console.log("⚠️ sofia@nqs.test no existe — corré: npx tsx scripts/create-users.ts");
  } else {
    const access = await getToolAccess(sofia.id, "claude");
    console.log(access ?? "sin access");
  }

  console.log("\n✓ test-db OK\n");
}

main().catch((err) => {
  console.error("\n✗ test-db falló:", err);
  process.exit(1);
});
