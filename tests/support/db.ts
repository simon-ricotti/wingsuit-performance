// In-process Postgres (PGlite) with the bare minimum of Supabase (roles, auth.uid(), auth.users, storage.buckets)
// to load the real schema from supabase/schemas and test permissions without Docker or the cloud.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './cache';

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase grants all table privileges to these roles and lets RLS decide.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Who = { role: 'anon' } | { role: 'authenticated'; uid: string } | { role: 'service_role' };

export interface TestDb {
  pg: PGlite;
  /** Runs `sql` as that user (as PostgREST would) and returns rows as JSON. */
  as<T = Record<string, unknown>>(who: Who, sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs any statement (insert, update, delete) as that user. */
  run(who: Who, sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; affected: number }>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  const dir = join(ROOT, 'supabase/schemas');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return {
    pg,
    async as<T>(who: Who, sql: string, params: unknown[] = []) {
      return pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who.role === 'authenticated' ? who.uid : '']);
        await tx.exec(`set local role ${who.role}`);
        // Like PostgREST: each row comes back as JSON (exact doubles, ISO dates).
        const r = await tx.query<{ j: T }>(`select to_jsonb(q) as j from (${sql}) q`, params);
        return r.rows.map((x) => x.j);
      });
    },
    async run(who: Who, sql: string, params: unknown[] = []) {
      return pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who.role === 'authenticated' ? who.uid : '']);
        await tx.exec(`set local role ${who.role}`);
        const r = await tx.query(sql, params);
        return { rows: r.rows as Record<string, unknown>[], affected: r.affectedRows ?? 0 };
      });
    },
    close: () => pg.close(),
  };
}

/** Creates a user with a profile and role (as the Supabase trigger plus an admin update would). */
export async function createUser(db: TestDb, role: 'admin' | 'judge' | 'pilot', pilotId: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await db.pg.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${role}-${id.slice(0, 6)}@ejemplo.test`]);
  await db.pg.query(`update public.profiles set role = $2, pilot_id = $3 where id = $1`, [id, role, pilotId]);
  return id;
}
