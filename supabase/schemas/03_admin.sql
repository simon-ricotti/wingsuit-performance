-- Admin writes: events, pilots and user access. Each function changes the data and writes the audit
-- log in the same transaction, so no change goes unrecorded. Only the server (service_role) can call
-- them, after checking the user's role (lib/auth/session.ts assertRole).
-- Messages raised here are shown to the user, so they are in Spanish.

-- Jump counts per event, for lists. security_invoker: the reader's RLS applies (only visible jumps count).
create view public.event_jump_counts with (security_invoker = true) as
  select event_id, count(*)::int as jumps from public.jumps group by event_id;
grant select on public.event_jump_counts to anon, authenticated, service_role;

-- Records who acts, for the archive triggers (public.current_actor) and the audit log.
create function public.begin_admin_write(p_actor uuid, p_reason text default null)
returns void language sql as $$
  select set_config('app.actor', coalesce(p_actor::text, ''), true), set_config('app.reason', coalesce(p_reason, ''), true)
$$;

-- ---------- events ----------
-- Creates (no id) or updates an event. Only the editable settings are taken from p_event; ids,
-- publication, validations, tiebreak and exit order are managed elsewhere.
-- Scoring settings (cfg, lane, separation, reference points) cannot change once the event has jumps,
-- because stored results would no longer match them (rescoring arrives with jump upload, stage 3).
create function public.save_event(p_event jsonb, p_actor uuid, p_who text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  editable constant text[] := array['name', 'date', 'dz', 'mode', 'rounds', 'team_size', 'units', 'lane', 'sep_check', 'refs', 'cfg', 'judging'];
  scoring constant text[] := array['cfg', 'lane', 'sep_check', 'refs'];
  p jsonb;
  old_row public.events;
  new_row public.events;
  changed text[];
begin
  perform public.begin_admin_write(p_actor);
  select coalesce(jsonb_object_agg(key, value), '{}') into p from jsonb_each(p_event) where key = any(editable);

  if p_event ->> 'id' is null then
    new_row := jsonb_populate_record(null::public.events, p);
    insert into public.events (name, date, dz, mode, rounds, team_size, units, lane, sep_check, refs, cfg, judging)
      values (new_row.name, new_row.date, coalesce(new_row.dz, ''), coalesce(new_row.mode, 'free'), coalesce(new_row.rounds, 3),
              coalesce(new_row.team_size, 3), coalesce(new_row.units, 'm'), coalesce(new_row.lane, false), coalesce(new_row.sep_check, false),
              coalesce(new_row.refs, '[]'), coalesce(new_row.cfg, '{}'), coalesce(new_row.judging, '{"profile":"arg"}'))
      returning * into new_row;
    insert into public.audit_log (event_id, actor, who, text, data)
      values (new_row.id, p_actor, coalesce(p_who, ''), 'Se creó la jornada "' || new_row.name || '"', p);
    return new_row.id;
  end if;

  select * into old_row from public.events where id = p_event ->> 'id' for update;
  if old_row.id is null then raise exception 'La jornada no existe (puede que la hayan borrado).'; end if;
  new_row := jsonb_populate_record(old_row, p);

  select coalesce(array_agg(k), '{}') into changed from unnest(editable) k
   where (to_jsonb(old_row) -> k) is distinct from (to_jsonb(new_row) -> k);
  if cardinality(changed) = 0 then return old_row.id; end if;
  if changed && scoring and exists (select 1 from public.jumps where event_id = old_row.id) then
    raise exception 'La jornada ya tiene saltos: la elevación, la ventana, la salida, el carril, la separación y los puntos de referencia no se pueden cambiar todavía (el recálculo llega con la carga de saltos).';
  end if;

  update public.events set
    name = new_row.name, date = new_row.date, dz = new_row.dz, mode = new_row.mode, rounds = new_row.rounds,
    team_size = new_row.team_size, units = new_row.units, lane = new_row.lane, sep_check = new_row.sep_check,
    refs = new_row.refs, cfg = new_row.cfg, judging = new_row.judging
  where id = old_row.id;
  insert into public.audit_log (event_id, actor, who, text, data)
    values (old_row.id, p_actor, coalesce(p_who, ''), 'Se cambiaron los ajustes de la jornada (' || array_to_string(changed, ', ') || ')',
            jsonb_build_object('before', (select jsonb_object_agg(k, to_jsonb(old_row) -> k) from unnest(changed) k),
                               'after',  (select jsonb_object_agg(k, to_jsonb(new_row) -> k) from unnest(changed) k)));
  return old_row.id;
end $$;

-- Deletes an event without jumps (an event with jumps is protected by the foreign key).
-- The archive trigger keeps a copy of the row.
create function public.delete_event(p_id text, p_actor uuid, p_who text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  perform public.begin_admin_write(p_actor, p_reason);
  select * into ev from public.events where id = p_id;
  if ev.id is null then raise exception 'La jornada no existe (puede que la hayan borrado).'; end if;
  if exists (select 1 from public.jumps where event_id = p_id) then
    raise exception 'La jornada "%" tiene saltos: no se puede borrar.', ev.name;
  end if;
  delete from public.events where id = p_id;
  insert into public.audit_log (event_id, actor, who, text, data)
    values (p_id, p_actor, coalesce(p_who, ''), 'Se borró la jornada "' || ev.name || '" (queda en el archivo)', jsonb_build_object('reason', p_reason));
end $$;

-- ---------- pilots ----------
create function public.save_pilot(p_pilot jsonb, p_actor uuid, p_who text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  editable constant text[] := array['name', 'suit', 'gender', 'team'];
  p jsonb;
  old_row public.pilots;
  new_row public.pilots;
  changed text[];
begin
  perform public.begin_admin_write(p_actor);
  select coalesce(jsonb_object_agg(key, value), '{}') into p from jsonb_each(p_pilot) where key = any(editable);

  if p_pilot ->> 'id' is null then
    new_row := jsonb_populate_record(null::public.pilots, p);
    insert into public.pilots (name, suit, gender, team)
      values (new_row.name, coalesce(new_row.suit, ''), coalesce(new_row.gender, ''), coalesce(new_row.team, ''))
      returning * into new_row;
    insert into public.audit_log (actor, who, text, data)
      values (p_actor, coalesce(p_who, ''), 'Se creó el piloto ' || new_row.name, jsonb_build_object('pilot', new_row.id));
    return new_row.id;
  end if;

  select * into old_row from public.pilots where id = p_pilot ->> 'id' for update;
  if old_row.id is null then raise exception 'El piloto no existe (puede que lo hayan borrado).'; end if;
  new_row := jsonb_populate_record(old_row, p);
  select coalesce(array_agg(k), '{}') into changed from unnest(editable) k
   where (to_jsonb(old_row) -> k) is distinct from (to_jsonb(new_row) -> k);
  if cardinality(changed) = 0 then return old_row.id; end if;
  update public.pilots set name = new_row.name, suit = new_row.suit, gender = new_row.gender, team = new_row.team where id = old_row.id;
  insert into public.audit_log (actor, who, text, data)
    values (p_actor, coalesce(p_who, ''), 'Se editó el piloto ' || new_row.name || ' (' || array_to_string(changed, ', ') || ')',
            jsonb_build_object('pilot', old_row.id,
                               'before', (select jsonb_object_agg(k, to_jsonb(old_row) -> k) from unnest(changed) k),
                               'after',  (select jsonb_object_agg(k, to_jsonb(new_row) -> k) from unnest(changed) k)));
  return old_row.id;
end $$;

create function public.delete_pilot(p_id text, p_actor uuid, p_who text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare pl public.pilots;
begin
  perform public.begin_admin_write(p_actor, p_reason);
  select * into pl from public.pilots where id = p_id;
  if pl.id is null then raise exception 'El piloto no existe (puede que lo hayan borrado).'; end if;
  if exists (select 1 from public.jumps where pilot_id = p_id) then
    raise exception '% tiene saltos cargados: no se puede borrar.', pl.name;
  end if;
  delete from public.pilots where id = p_id;
  insert into public.audit_log (actor, who, text, data)
    values (p_actor, coalesce(p_who, ''), 'Se borró el piloto ' || pl.name || ' (queda en el archivo)', jsonb_build_object('pilot', p_id, 'reason', p_reason));
end $$;

-- ---------- user access ----------
-- Sets a user's role, linked pilot and display name. There is always at least one admin left.
create function public.set_user_access(p_user uuid, p_role public.app_role, p_pilot text, p_display_name text, p_actor uuid, p_who text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_row public.profiles;
  pilot_name text;
begin
  perform public.begin_admin_write(p_actor);
  select * into old_row from public.profiles where id = p_user for update;
  if old_row.id is null then raise exception 'El usuario no existe.'; end if;
  if old_row.role = 'admin' and p_role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> p_user) then
    raise exception 'Tiene que quedar al menos un organizador.';
  end if;
  if p_pilot is not null then
    select name into pilot_name from public.pilots where id = p_pilot;
    if pilot_name is null then raise exception 'El piloto elegido no existe.'; end if;
    if exists (select 1 from public.profiles where pilot_id = p_pilot and id <> p_user) then
      raise exception '% ya está vinculado a otro usuario.', pilot_name;
    end if;
  end if;
  if old_row.role = p_role and old_row.pilot_id is not distinct from p_pilot
     and old_row.display_name = coalesce(trim(p_display_name), '') then
    return;
  end if;
  update public.profiles set role = p_role, pilot_id = p_pilot, display_name = coalesce(trim(p_display_name), '') where id = p_user;
  insert into public.audit_log (actor, who, text, data)
    values (p_actor, coalesce(p_who, ''),
            'Se cambió el acceso de ' || coalesce(nullif(trim(p_display_name), ''), old_row.display_name) || ': rol ' || p_role
              || coalesce(', piloto ' || pilot_name, ', sin piloto vinculado'),
            jsonb_build_object('user', p_user,
                               'before', jsonb_build_object('role', old_row.role, 'pilot_id', old_row.pilot_id, 'display_name', old_row.display_name),
                               'after', jsonb_build_object('role', p_role, 'pilot_id', p_pilot, 'display_name', coalesce(trim(p_display_name), ''))));
end $$;

revoke execute on function public.begin_admin_write(uuid, text) from public, anon, authenticated;
revoke execute on function public.save_event(jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function public.delete_event(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.save_pilot(jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function public.delete_pilot(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.set_user_access(uuid, public.app_role, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_admin_write(uuid, text) to service_role;
grant execute on function public.save_event(jsonb, uuid, text) to service_role;
grant execute on function public.delete_event(text, uuid, text, text) to service_role;
grant execute on function public.save_pilot(jsonb, uuid, text) to service_role;
grant execute on function public.delete_pilot(text, uuid, text, text) to service_role;
grant execute on function public.set_user_access(uuid, public.app_role, text, text, uuid, text) to service_role;
