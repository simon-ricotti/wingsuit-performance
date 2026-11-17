-- Storage: private buckets. No policies on storage.objects: only the server (secret key) uploads
-- and reads; the browser gets short-lived signed URLs when needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('originals', 'originals', false, 20971520, array['application/gzip']),   -- GPS file, gzip
  ('imports',   'imports',   false, 104857600, array['application/json'])  -- full backups uploaded for import
on conflict (id) do nothing;

-- Imports a full backup exported by the previous platform, already converted to rows (lib/import/backup.ts).
-- All or nothing: runs in one transaction. Original files are uploaded to Storage before calling it.
-- Error and log messages are shown to the admin, so they are in Spanish.
create function public.import_backup(payload jsonb, p_actor uuid, p_who text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  new_pilots text[];
  existing_pilots text[];
  n_jumps integer;
begin
  ev := jsonb_populate_record(null::public.events, payload -> 'event');
  if ev.id is null then raise exception 'La copia no trae la jornada'; end if;
  if exists (select 1 from public.events where id = ev.id) then
    raise exception 'La jornada "%" (%) ya existe: no se importa encima para no perder datos', ev.name, ev.id;
  end if;

  select coalesce(array_agg(p.id), '{}') into existing_pilots
    from jsonb_populate_recordset(null::public.pilots, payload -> 'pilots') p
   where exists (select 1 from public.pilots x where x.id = p.id);
  -- An existing pilot is left untouched (the database wins).
  with ins as (
    insert into public.pilots select * from jsonb_populate_recordset(null::public.pilots, payload -> 'pilots')
    on conflict (id) do nothing returning id
  ) select coalesce(array_agg(id), '{}') into new_pilots from ins;

  insert into public.events select (ev).*;
  insert into public.jumps  select * from jsonb_populate_recordset(null::public.jumps,  payload -> 'jumps');
  get diagnostics n_jumps = row_count;
  insert into public.tracks select * from jsonb_populate_recordset(null::public.tracks, payload -> 'tracks');
  insert into public.files  select * from jsonb_populate_recordset(null::public.files,  payload -> 'files');
  insert into public.reviews (event_id, pilot_id, task, round, reviewer, reviewer_name, legacy_uid, at)
    select event_id, pilot_id, task, round, null, reviewer_name, legacy_uid, at
      from jsonb_populate_recordset(null::public.reviews, payload -> 'reviews');
  insert into public.audit_log (event_id, at, actor, who, text, jump_key, data)
    select event_id, at, null, who, text, jump_key, data
      from jsonb_populate_recordset(null::public.audit_log, payload -> 'log')
     order by at;
  insert into public.audit_log (event_id, actor, who, text, data)
    values (ev.id, p_actor, coalesce(p_who, ''), 'Se importó la copia completa de la versión anterior (' || n_jumps || ' saltos)',
            payload -> 'source');

  return jsonb_build_object('event', ev.id, 'jumps', n_jumps, 'newPilots', to_jsonb(new_pilots), 'existingPilots', to_jsonb(existing_pilots));
end $$;

revoke execute on function public.import_backup(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.import_backup(jsonb, uuid, text) to service_role;
