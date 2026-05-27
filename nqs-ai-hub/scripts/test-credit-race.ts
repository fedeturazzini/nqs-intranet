/**
 * Test de race condition del RPC `consume_credit_atomic`.
 *
 *   npx tsx scripts/test-credit-race.ts
 *
 * Estrategia:
 *   1. Resetear el allocation de Sofía a 3DSky a 10 créditos disponibles.
 *   2. Disparar N consumos de 1 crédito EN PARALELO via Promise.all.
 *      Sin atomicidad, dos consumos podrían leer credits_used=0 al
 *      mismo tiempo y ambos descontar — terminaríamos con credits_used
 *      mayor que sum(amounts).
 *   3. Verificar que credits_used == N OK y que el sobrante en credits
 *      _transactions cuadra. Si N > créditos iniciales, los que sobran
 *      deben fallar con `insufficient_credits` y NO descontar.
 *
 * Resultado esperado:
 *   - 10 consumos OK (uno por crédito)
 *   - 5 consumos fail "insufficient_credits"
 *   - credits_used == 10 (no overflow)
 *   - credit_transactions: 10 rows con type='consumption' y amount=-1
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/db";

const INITIAL_CREDITS = 10;
const CONCURRENT_CONSUMES = 15; // 5 más que los disponibles
const SOFIA_EMAIL = "sofia@nqs.test";
const TOOL_ID = "3dsky";

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main(): Promise<void> {
  console.log("─ race condition test del RPC consume_credit_atomic ─");

  // 1) buscar a sofía
  const { data: sofia } = await db
    .from("users")
    .select("id, name")
    .eq("email", SOFIA_EMAIL)
    .single();
  if (!sofia) throw new Error("sofia no existe");

  console.log(`user: ${sofia.name} (${sofia.id.slice(0, 8)}…)`);

  // 2) reset allocation a INITIAL_CREDITS / 0 used
  await db
    .from("credit_allocations")
    .upsert(
      {
        user_id: sofia.id,
        tool_id: TOOL_ID,
        credits_assigned: INITIAL_CREDITS,
        credits_used: 0,
      },
      { onConflict: "user_id,tool_id" },
    );

  // limpiamos transactions previas de este test
  await db
    .from("credit_transactions")
    .delete()
    .eq("user_id", sofia.id)
    .eq("tool_id", TOOL_ID)
    .like("reason", "race-test-%");

  // 3) baseline read
  const { data: pre } = await db
    .from("credit_allocations")
    .select("credits_assigned, credits_used")
    .eq("user_id", sofia.id)
    .eq("tool_id", TOOL_ID)
    .single();
  console.log(
    `pre: assigned=${pre?.credits_assigned} used=${pre?.credits_used} ` +
      `(disponible=${(pre?.credits_assigned ?? 0) - (pre?.credits_used ?? 0)})`,
  );

  // 4) disparo concurrente
  console.log(`disparando ${CONCURRENT_CONSUMES} consumos en paralelo…`);
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: CONCURRENT_CONSUMES }, (_, i) =>
      db.rpc("consume_credit_atomic", {
        p_user_id: sofia.id,
        p_tool_id: TOOL_ID,
        p_amount: 1,
        p_reason: `race-test-${i}`,
      }),
    ),
  );
  const elapsed = Date.now() - t0;

  // 5) clasificar resultados
  let success = 0;
  let insufficient = 0;
  let otherErr = 0;
  for (const r of results) {
    if (r.error) {
      if (r.error.message.includes("insufficient_credits")) insufficient++;
      else otherErr++;
    } else {
      success++;
    }
  }

  // 6) read final
  const { data: post } = await db
    .from("credit_allocations")
    .select("credits_assigned, credits_used")
    .eq("user_id", sofia.id)
    .eq("tool_id", TOOL_ID)
    .single();

  const { count: txCount } = await db
    .from("credit_transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", sofia.id)
    .eq("tool_id", TOOL_ID)
    .like("reason", "race-test-%");

  console.log(`\nresultado (${elapsed}ms):`);
  console.log(`  consumos OK:           ${success}`);
  console.log(`  insufficient_credits:  ${insufficient}`);
  console.log(`  otros errores:         ${otherErr}`);
  console.log(
    `  post: assigned=${post?.credits_assigned} used=${post?.credits_used} `,
  );
  console.log(`  credit_transactions:   ${txCount}`);

  // assertions
  const failures: string[] = [];
  if (success !== INITIAL_CREDITS)
    failures.push(`expected ${INITIAL_CREDITS} success, got ${success}`);
  if (insufficient !== CONCURRENT_CONSUMES - INITIAL_CREDITS)
    failures.push(
      `expected ${CONCURRENT_CONSUMES - INITIAL_CREDITS} insufficient, got ${insufficient}`,
    );
  if (post?.credits_used !== INITIAL_CREDITS)
    failures.push(
      `expected credits_used=${INITIAL_CREDITS} (no overflow), got ${post?.credits_used}`,
    );
  if (otherErr !== 0) failures.push(`unexpected errors: ${otherErr}`);
  if (txCount !== INITIAL_CREDITS)
    failures.push(`expected ${INITIAL_CREDITS} tx rows, got ${txCount}`);

  if (failures.length === 0) {
    console.log("\n✓ race condition test PASSED");
  } else {
    console.log("\n✗ race condition test FAILED:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }

  // cleanup: dejamos a sofía con 30/0 como estaba antes (seed default)
  await db
    .from("credit_allocations")
    .update({ credits_assigned: 30, credits_used: 0 })
    .eq("user_id", sofia.id)
    .eq("tool_id", TOOL_ID);
  await db
    .from("credit_transactions")
    .delete()
    .eq("user_id", sofia.id)
    .eq("tool_id", TOOL_ID)
    .like("reason", "race-test-%");
  console.log("cleanup: sofia → 30/0 créditos restaurados.");
}

main().catch((err) => {
  console.error("✗ fatal:", err);
  process.exit(1);
});
