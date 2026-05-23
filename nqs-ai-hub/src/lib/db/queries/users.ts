/**
 * Queries de usuarios.
 *
 * Server-only — usan `createServerClient()` que se salta RLS con la
 * service_role_key. No importar desde Client Components.
 */
import { createServerClient } from "@/lib/db/supabase";
import type { UserRow } from "@/types/db";

export async function getUserById(id: string): Promise<UserRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listUsers(): Promise<UserRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
