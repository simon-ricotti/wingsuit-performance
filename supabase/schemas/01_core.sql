-- Core schema: tables, role-based read access (RLS), archive and audit log.
-- This is the declarative source of truth for the database (see docs/stage-2-database-and-costs.md).
--
-- Principles:
--  * The browser only READS (RLS). Every write goes through the server with the secret key, which
--    checks the role and recomputes the score: the server never trusts what the browser sends.
--  * Nothing is deleted without archiving: deleting a jump, pilot or event copies the row to `archive`
--    (trigger). `archive` and `audit_log` cannot be updated or deleted, not even with the secret key.
--  * Tracks live in their own table so listing jumps or building standings never reads them.
--  * Unknown fields from imported backups go to `extra`, so import → export loses nothing.

-- ---------- types ----------
create type public.app_role as enum ('admin', 'judge', 'pilot');

-- ---------- pilots ----------
create table public.pilots (
  id          text primary key default ('p' || substr(md5(gen_random_uuid()::text), 1, 12)),
  name        text not null check (length(trim(name)) > 0),
  suit        text not null default '',
  gender      text not null default '' check (gender in ('F', '')),
  team        text not null default '',
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- profiles: user ↔ role ↔ pilot ----------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '',
  role          public.app_role not null default 'pilot',
  pilot_id      text unique references public.pilots (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- events (competition days) ----------
create table public.events (
  id          text primary key default ('e' || substr(md5(gen_random_uuid()::text), 1, 12)),
  name        text not null check (length(trim(name)) > 0),
  date        date,
  dz          text not null default '',
  mode        text not null default 'free' check (mode in ('free', 'competition')),
  rounds      integer not null default 3 check (rounds between 1 and 12),
  team_size   integer not null default 3 check (team_size between 1 and 10),
  units       text not null default 'm' check (units in ('m', 'ft')),
  lane        boolean not null default false,      -- 2.2 designated lane
  sep_check   boolean not null default false,      -- 5.6.3 separation
  refs        jsonb not null default '[]',         -- [{name, lat, lon}] 2.2, 5.5.5
  cfg         jsonb not null default '{}',         -- elev, top, bottom, exitMin, exitMax (lib/engine DEFAULT_CFG)
  judging     jsonb not null default '{"profile":"arg"}',
  validated   jsonb not null default '{}',         -- {'task|round': {by, at}} 5.4.2
  tiebreak    jsonb,                               -- {task, at, by, pilots} 5.10.6
  task_order  jsonb,                               -- 5.4.8
  exit_order  jsonb,                               -- {round: {ids, how, at, by}} 5.5.2
  pass_size   integer,
  roster      jsonb,
  team_pick   jsonb,
  published   boolean not null default false,      -- visible to the public (stage 7)
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- jumps ----------
-- Natural key: one jump per pilot, task and round (round 0 = tiebreak).
create table public.jumps (
  event_id       text not null references public.events (id) on delete restrict,
  pilot_id       text not null references public.pilots (id) on delete restrict,
  task           text not null check (task in ('time', 'distance', 'speed')),
  round          integer not null check (round >= 0),
  -- result computed by the engine (written by the server only)
  ok             boolean not null default false,
  time           double precision not null default 0,
  distance       double precision not null default 0,
  speed          double precision not null default 0,
  exit_agl       double precision,
  t_exit         double precision,   -- UNIX seconds (GPS time)
  t_val          double precision,
  t_top          double precision,
  t_bot          double precision,
  t_deploy       double precision,
  hz             double precision,
  sep_max        double precision,
  flags          jsonb not null default '[]',
  ref_idx        integer,
  lane_dev       double precision,
  lane_outside   double precision,
  lane_pen       double precision not null default 0,
  sep_min        double precision,
  sep_with       text,
  sep_violation  boolean not null default false,
  -- judge decisions
  pen_manual     double precision,
  lane_decision  double precision,
  lane_shift     double precision,
  sep_apply      boolean,
  exit_pen       double precision,
  flag_decision  text,               -- 'accept' | 'rejump' | null
  void           boolean,            -- null = no decision
  notes          text,
  -- source file
  device         text not null default '',
  file_name      text not null default '',
  file_hash      text,
  file_size      bigint,
  uploaded_by    text,
  uploaded_at    timestamptz,
  original_saved boolean,
  extra          jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (event_id, pilot_id, task, round)
);
create index jumps_pilot_idx on public.jumps (pilot_id);

-- Packed track (lib/engine packTrack). Separate so it never travels with the standings.
create table public.tracks (
  event_id  text not null,
  pilot_id  text not null,
  task      text not null,
  round     integer not null,
  packed    jsonb not null,
  primary key (event_id, pilot_id, task, round),
  foreign key (event_id, pilot_id, task, round) references public.jumps on delete cascade
);

-- Original GPS file: the content is in Storage (bucket `originals`, gzip-compressed).
create table public.files (
  event_id      text not null,
  pilot_id      text not null,
  task          text not null,
  round         integer not null,
  storage_path  text not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size          bigint not null,       -- uncompressed size in bytes
  name          text not null default '',
  uploaded_at   timestamptz not null default now(),
  primary key (event_id, pilot_id, task, round),
  foreign key (event_id, pilot_id, task, round) references public.jumps on delete cascade
);

-- Review signatures. reviewer = logged-in user (stage 5); imported ones only carry a typed name.
create table public.reviews (
  id             bigint generated always as identity primary key,
  event_id       text not null,
  pilot_id       text not null,
  task           text not null,
  round          integer not null,
  reviewer       uuid references auth.users (id) on delete set null,
  reviewer_name  text not null default '',
  legacy_uid     text,
  at             timestamptz not null default now(),
  foreign key (event_id, pilot_id, task, round) references public.jumps on delete cascade
);
create index reviews_jump_idx on public.reviews (event_id, pilot_id, task, round);

-- ---------- archive and audit log (append-only) ----------
create table public.archive (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('jump', 'pilot', 'event')),
  event_id     text,
  key          text not null,           -- jump: pilotId-task-round
  data         jsonb not null,          -- the row; for a jump also its track, file and reviews
  deleted      boolean not null default false,  -- true: deleted; false: replaced
  reason       text,
  archived_by  uuid,
  archived_at  timestamptz not null default now()
);
create index archive_event_idx on public.archive (event_id, archived_at desc);

create table public.audit_log (
  id        bigint generated always as identity primary key,
  event_id  text,
  at        timestamptz not null default now(),
  actor     uuid,
  who       text not null default '',
  text      text not null,             -- shown in the UI (Spanish)
  jump_key  text,
  data      jsonb
);
create index audit_log_event_idx on public.audit_log (event_id, at desc);

-- ---------- helper functions ----------
create function public.jump_key(p_pilot text, p_task text, p_round integer)
returns text language sql immutable as $$ select p_pilot || '-' || p_task || '-' || p_round $$;

-- Role of the logged-in user (null without a session). security definer so policies can use it without recursion.
create function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin', 'judge') from public.profiles where id = auth.uid()), false)
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function public.event_is_published(p_event text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select published from public.events where id = p_event), false)
$$;

-- updated_at
create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger pilots_touch   before update on public.pilots   for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger events_touch   before update on public.events   for each row execute function public.touch_updated_at();
create trigger jumps_touch    before update on public.jumps    for each row execute function public.touch_updated_at();

-- Profile created automatically for every new user (role pilot; the first admin is set by hand, see docs).
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(split_part(new.email, '@', 1), ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- nothing is deleted without archiving ----------
create function public.archive_deleted_jump()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.archive (kind, event_id, key, data, deleted, reason, archived_by)
  values ('jump', old.event_id, public.jump_key(old.pilot_id, old.task, old.round),
    jsonb_build_object(
      'jump', to_jsonb(old),
      'track', (select t.packed from public.tracks t where (t.event_id, t.pilot_id, t.task, t.round) = (old.event_id, old.pilot_id, old.task, old.round)),
      'file', (select to_jsonb(f) from public.files f where (f.event_id, f.pilot_id, f.task, f.round) = (old.event_id, old.pilot_id, old.task, old.round)),
      'reviews', (select coalesce(jsonb_agg(to_jsonb(r) order by r.at), '[]') from public.reviews r where (r.event_id, r.pilot_id, r.task, r.round) = (old.event_id, old.pilot_id, old.task, old.round))
    ), true, current_setting('app.reason', true), auth.uid());
  return old;
end $$;
create trigger jumps_archive before delete on public.jumps for each row execute function public.archive_deleted_jump();

create function public.archive_deleted_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.archive (kind, event_id, key, data, deleted, reason, archived_by)
  values (tg_argv[0], case when tg_argv[0] = 'event' then old.id end, old.id, to_jsonb(old), true, current_setting('app.reason', true), auth.uid());
  return old;
end $$;
create trigger pilots_archive before delete on public.pilots for each row execute function public.archive_deleted_row('pilot');
create trigger events_archive before delete on public.events for each row execute function public.archive_deleted_row('event');

create function public.forbid_change()
returns trigger language plpgsql as $$
begin raise exception '% is append-only: rows cannot be updated or deleted', tg_table_name; end $$;
create trigger archive_append_only   before update or delete on public.archive   for each row execute function public.forbid_change();
create trigger audit_log_append_only before update or delete on public.audit_log for each row execute function public.forbid_change();

-- ---------- read access (RLS) ----------
-- No write policies: anon and authenticated cannot insert, update or delete anything.
-- `(select auth.uid())` and functions wrapped in select are evaluated once per query, not per row.
alter table public.pilots    enable row level security;
alter table public.profiles  enable row level security;
alter table public.events    enable row level security;
alter table public.jumps     enable row level security;
alter table public.tracks    enable row level security;
alter table public.files     enable row level security;
alter table public.reviews   enable row level security;
alter table public.archive   enable row level security;
alter table public.audit_log enable row level security;

create policy "published events or staff" on public.events for select
  using (published or (select public.is_staff()));

create policy "jumps of published events or staff" on public.jumps for select
  using ((select public.is_staff()) or public.event_is_published(event_id));
create policy "tracks of published events or staff" on public.tracks for select
  using ((select public.is_staff()) or public.event_is_published(event_id));
create policy "files of published events or staff" on public.files for select
  using ((select public.is_staff()) or public.event_is_published(event_id));
create policy "reviews of published events or staff" on public.reviews for select
  using ((select public.is_staff()) or public.event_is_published(event_id));

-- Pilots: staff sees all; everyone else sees those in a published event, and each pilot their own.
create policy "visible pilots" on public.pilots for select
  using (
    (select public.is_staff())
    or id = (select p.pilot_id from public.profiles p where p.id = (select auth.uid()))
    or exists (select 1 from public.jumps j join public.events e on e.id = j.event_id where j.pilot_id = pilots.id and e.published)
  );

create policy "own profile or admin" on public.profiles for select
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "archive for staff" on public.archive for select using ((select public.is_staff()));
create policy "audit log for staff" on public.audit_log for select using ((select public.is_staff()));

-- Trigger functions are not exposed as RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.archive_deleted_jump() from public, anon, authenticated;
revoke execute on function public.archive_deleted_row() from public, anon, authenticated;
