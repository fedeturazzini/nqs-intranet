/**
 * Seed de la password inicial del System Brain.
 *
 *   npx tsx scripts/seed-brain-password.ts
 *
 * Hashea "bigsteps" con bcrypt e inserta una fila en `brain_config` SOLO
 * si todavía no hay ninguna (idempotente — no pisa una password ya
 * cambiada por el admin).
 *
 * Correr DESPUÉS de aplicar la migration 0008.
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
    .from("brain_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.error("✗ no pude leer brain_config:", selErr.message);
    console.error("  ¿aplicaste la migration 0008?");
    process.exit(1);
  }

  if (existing) {
    console.log("✓ brain_config ya tiene una password — no se toca.");
    return;
  }

  const hash = await bcrypt.hash(INITIAL_PASSWORD, BCRYPT_ROUNDS);
  const { error: insErr } = await db
    .from("brain_config")
    .insert({ password_hash: hash });

  if (insErr) {
    console.error("✗ no pude insertar la password:", insErr.message);
    process.exit(1);
  }

  console.log(`✓ password del Brain seteada a "${INITIAL_PASSWORD}" (hasheada).`);
  console.log("  Cambiala desde /admin/brain → 'Cambiar contraseña del Brain'.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
