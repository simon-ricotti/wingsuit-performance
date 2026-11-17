// Who is logged in and with which role. The role comes from the profiles table (never from the browser).
import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';

export type AppRole = 'admin' | 'judge' | 'pilot';

export interface Session {
  userId: string;
  email: string;
  role: AppRole;
  displayName: string;
  pilotId: string | null;
}

export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  // getClaims verifies the token signature (no round trip to the Auth server with asymmetric keys).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: profile } = await supabase.from('profiles').select('role, display_name, pilot_id').eq('id', claims.sub).maybeSingle();
  if (!profile) return null;
  return { userId: claims.sub, email: String(claims.email ?? ''), role: profile.role, displayName: profile.display_name, pilotId: profile.pilot_id };
}

/** For pages: redirects to /login without a session, or to / if the role is not allowed. */
export async function requireRole(...roles: AppRole[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roles.includes(s.role)) redirect('/');
  return s;
}

/** For server actions: throws instead of redirecting (the message is shown to the user). */
export async function assertRole(...roles: AppRole[]): Promise<Session> {
  const s = await getSession();
  if (!s || !roles.includes(s.role)) throw new Error('No tenés permiso para hacer esto.');
  return s;
}
