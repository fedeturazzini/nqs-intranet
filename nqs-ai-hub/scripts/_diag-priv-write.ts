/**
 * Test del PATH de persistencia de proyecto privado (migration 0016).
 * Inserta un proyecto throwaway ARCHIVADO (is_active=false → NO aparece en la
 * lista de users) con is_private=true, verifica que persiste y que la lectura
 * del gate lo ve, y lo BORRA (hard) en el finally. No deja rastro.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main(): Promise<void> {
  const slug = `zzz-diag-delete-me-${Date.now()}`;
  let id: string | null = null;
  try {
    // 1) Insert idéntico a lo que hace POST /api/admin/projects para un privado.
    const hash = await bcrypt.hash("diagtest1234", 10);
    const ins = await db
      .from("projects")
      .insert({
        name: "__diag borrar__",
        slug,
        is_active: false, // archivado → invisible para users
        is_private: true,
        password_hash: hash,
      })
      .select("id, is_private, gate_version, password_hash")
      .single();

    if (ins.error) {
      console.log("✗ INSERT falló:", ins.error.message);
      console.log("   → si es de columna/constraint, ahí está el bug de persistencia.");
      return;
    }
    id = ins.data.id;
    console.log("[1] insert OK →", {
      is_private: ins.data.is_private,
      gate_version: ins.data.gate_version,
      has_password: ins.data.password_hash ? "SÍ" : "—",
    });

    // 2) Lectura que usa el gate (getProjectGateFields).
    const gate = await db
      .from("projects")
      .select("id, is_private, gate_version")
      .eq("id", id)
      .maybeSingle();
    console.log("[2] getProjectGateFields vería →", gate.data);
    console.log(
      gate.data?.is_private === true
        ? "    ✓ is_private=true → hasProjectGate pediría contraseña. PATH OK."
        : "    ✗ is_private NO es true al leer → bug de persistencia.",
    );
  } finally {
    if (id) {
      const del = await db.from("projects").delete().eq("id", id);
      console.log(del.error ? `✗ cleanup falló: ${del.error.message}` : "[3] throwaway borrado ✓");
    }
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
