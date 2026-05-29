/**
 * Supabase clients — dos factorías, una para cada side del runtime.
 *
 * - `createServerClient()` usa la `service_role_key` y se salta RLS.
 *   **Sólo** se puede importar desde código que corre en el server
 *   (API routes, Server Components, server actions, scripts).
 * - `createBrowserClient()` usa la `anon_key` pública. Va al frontend
 *   y respeta RLS — el backend igual valida cada operación sensible.
 *
 * Reglas críticas (ver `kit/docs/02-conventions.md`):
 *   - El `SUPABASE_SERVICE_ROLE_KEY` nunca llega al cliente.
 *   - Cualquier acceso que cruce roles tiene que pasar por el middleware
 *     de permisos (`lib/middleware/permissions.ts`).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var: ${name}. Revisá .env.local y .env.local.example.`,
    );
  }
  return value;
}

/**
 * Cliente con service_role_key. **Server-only.**
 * Crear uno por request (no cachear globalmente) para no compartir
 * estado de auth entre usuarios.
 */
export function createServerClient(): SupabaseClient<Database> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Cliente con anon_key. Apto para frontend (browser) y para Server
 * Components que sólo leen datos públicos respetando RLS.
 *
 * ⚠️ IMPORTANTE: las `NEXT_PUBLIC_*` se referencian de forma ESTÁTICA
 * (`process.env.NEXT_PUBLIC_X` literal), NO vía `requireEnv(name)`. Next.js
 * solo incrusta estas vars en el bundle del browser cuando las ve escritas
 * literalmente en build-time; un acceso dinámico `process.env[name]` queda
 * `undefined` en el cliente en producción (en dev funciona igual, por eso
 * el bug solo aparecía deployado).
 */
export function createBrowserClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing required env var: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Revisá .env.local y .env.local.example.",
    );
  }
  return createClient<Database>(url, anonKey);
}
