// Client with the secret key: bypasses RLS. Server only, and always after checking the role.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';

export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Missing SUPABASE_SECRET_KEY (see .env.example).');
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
