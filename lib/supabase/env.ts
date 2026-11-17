// Supabase environment variables. The publishable key may reach the browser; the secret key never does.
export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL (see .env.example).');
  return v;
}

export function supabasePublishableKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!v) throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).');
  return v;
}
