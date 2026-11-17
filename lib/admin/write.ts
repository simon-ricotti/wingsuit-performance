// Server-side writes through the database functions in supabase/schemas/03_admin.sql.
// Always called after assertRole: the secret-key client bypasses RLS.
import 'server-only';
import { createAdminClient } from '../supabase/admin';
import type { Session } from '../auth/session';

/** Result of a form action: an error message for the user (Spanish), or nothing. */
export interface FormState { error?: string; saved?: boolean; rescored?: number }

/** Name recorded in the audit log for this user. */
export const actorName = (s: Session) => s.displayName || s.email;

/**
 * Calls a write function. Messages raised by our functions (Spanish) are passed to the user;
 * anything else becomes a generic message.
 */
export async function callWrite<T>(fn: string, args: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await createAdminClient().rpc(fn, args);
  if (!error) return { data: data as T };
  // P0001 = raise exception in plpgsql: our own message.
  if (error.code === 'P0001') return { error: error.message };
  console.error(`[admin] ${fn} failed`, error);
  return { error: 'No pude guardar el cambio. Probá de nuevo.' };
}
