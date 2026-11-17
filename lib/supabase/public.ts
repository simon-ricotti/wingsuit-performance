// Client without a session for public pages: reads only what RLS shows anyone (published events).
// No cookies, so the pages can be static and served from the CDN.
import { createClient } from '@supabase/supabase-js';
import { supabasePublishableKey, supabaseUrl } from './env';

export const createPublicClient = () => createClient(supabaseUrl(), supabasePublishableKey(), { auth: { persistSession: false, autoRefreshToken: false } });
