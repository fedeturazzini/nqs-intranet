/**
 * Seed de la password inicial del gate de Gastos.
 *
 *   npx tsx scripts/seed-gastos-password.ts
 *
 * Hashea "bigsteps" con bcrypt e inserta una fila en `gastos_gate_config`
 * SOLO si todavía no hay ninguna (idempotente).
 *
 * Correr DESPUÉS de aplicar la migration 0021.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { createServerClient } from "../src/lib/db/supabase";

const INITIAL_PASSWORD = "bigsteps";
const BCRYPT_ROUNDS = 10;

async function main(): Promise<void> {
  const db = createServerClient();

  const { data: existing, error: selErr } = await db
    .from("gastos_gate_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.error("✗ no pude leer gastos_gate_config:", selErr.message);
    console.error("  ¿aplicaste la migration 0021?");
    process.exit(1);
  }

  if (existing) {
    console.log("✓ gastos_gate_config ya tiene una password — no se toca.");
    return;
  }

  const hash = await bcrypt.hash(INITIAL_PASSWORD, BCRYPT_ROUNDS);
  const { error: insErr } = await db
    .from("gastos_gate_config")
    .insert({ password_hash: hash, gate_version: 1 });

  if (insErr) {
    console.error("✗ no pude insertar la password:", insErr.message);
    process.exit(1);
  }

  console.log(
    `✓ password de Gastos seteada a "${INITIAL_PASSWORD}" (hasheada).`,
  );
  console.log(
    "  Cambiala desde /admin/logs → 'Cambiar contraseña de Gastos'.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
