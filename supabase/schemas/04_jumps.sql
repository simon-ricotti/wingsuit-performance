-- Jump upload and rescoring. The server scores the file with lib/engine (it never trusts the browser)
-- and calls these functions, which write everything plus the audit log in one transaction.
-- Only service_role can call them. Log texts are shown in the UI (Spanish), as on the previous platform.

create function public.task_label(p_task text)
returns text language sql immutable as $$
  select case p_task when 'time' then 'Tiempo' when 'distance' then 'Distancia' when 'speed' then 'Velocidad' else p_task end
$$;

-- Saves an uploaded jump with its packed track and original file (already in Storage).
-- If the pilot already has a jump in that task and round, the previous one goes to the archive
-- (with its track, file and reviews) and is replaced, judge decisions included (a new file starts clean).
-- p_sep: other jumps of the same task and round that are now closer to this one (5.6.3).
create function public.save_jump(p_jump jsonb, p_track jsonb, p_file jsonb, p_sep jsonb, p_actor uuid, p_who text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.jumps;
  old_row public.jumps;
  ev public.events;
  pilot_name text;
  k text;
  slot text;
begin
  perform public.begin_admin_write(p_actor, 'Reemplazado por un archivo nuevo');
  j := jsonb_populate_record(null::public.jumps, p_jump);
  -- One upload at a time per event: keeps separation and replacements consistent.
  select * into ev from public.events where id = j.event_id for update;
  if ev.id is null then raise exception 'La jornada no existe (puede que la hayan borrado).'; end if;
  select name into pilot_name from public.pilots where id = j.pilot_id;
  if pilot_name is null then raise exception 'El piloto no existe (puede que lo hayan borrado).'; end if;
  k := public.jump_key(j.pilot_id, j.task, j.round);

  select * into old_row from public.jumps
   where (event_id, pilot_id, task, round) = (j.event_id, j.pilot_id, j.task, j.round) for update;

  if old_row.event_id is not null then
    insert into public.archive (kind, event_id, key, data, deleted, reason, archived_by)
    values ('jump', j.event_id, k, jsonb_build_object(
        'jump', to_jsonb(old_row),
        'track', (select t.packed from public.tracks t where (t.event_id, t.pilot_id, t.task, t.round) = (j.event_id, j.pilot_id, j.task, j.round)),
        'file', (select to_jsonb(f) from public.files f where (f.event_id, f.pilot_id, f.task, f.round) = (j.event_id, j.pilot_id, j.task, j.round)),
        'reviews', (select coalesce(jsonb_agg(to_jsonb(r) order by r.at), '[]') from public.reviews r where (r.event_id, r.pilot_id, r.task, r.round) = (j.event_id, j.pilot_id, j.task, j.round))
      ), false, 'Reemplazado por un archivo nuevo', p_actor);
    delete from public.reviews where (event_id, pilot_id, task, round) = (j.event_id, j.pilot_id, j.task, j.round);
    delete from public.tracks  where (event_id, pilot_id, task, round) = (j.event_id, j.pilot_id, j.task, j.round);
    delete from public.files   where (event_id, pilot_id, task, round) = (j.event_id, j.pilot_id, j.task, j.round);
    update public.jumps set
      ok = j.ok, time = j.time, distance = j.distance, speed = j.speed, exit_agl = j.exit_agl,
      t_exit = j.t_exit, t_val = j.t_val, t_top = j.t_top, t_bot = j.t_bot, t_deploy = j.t_deploy, hz = j.hz, sep_max = j.sep_max,
      flags = j.flags, ref_idx = j.ref_idx, lane_dev = j.lane_dev, lane_outside = j.lane_outside, lane_pen = j.lane_pen,
      sep_min = j.sep_min, sep_with = j.sep_with, sep_violation = j.sep_violation,
      pen_manual = j.pen_manual, lane_decision = j.lane_decision, lane_shift = j.lane_shift, sep_apply = j.sep_apply,
      exit_pen = j.exit_pen, flag_decision = j.flag_decision, void = j.void, notes = j.notes,
      device = j.device, file_name = j.file_name, file_hash = j.file_hash, file_size = j.file_size,
      uploaded_by = j.uploaded_by, uploaded_at = j.uploaded_at, original_saved = j.original_saved, extra = coalesce(j.extra, '{}')
    where (event_id, pilot_id, task, round) = (j.event_id, j.pilot_id, j.task, j.round);
    insert into public.audit_log (event_id, actor, who, text, jump_key)
      values (j.event_id, p_actor, coalesce(p_who, ''), 'Se reemplazó el salto de ' || pilot_name || ', ' || public.task_label(j.task) || ' R' || j.round
              || case when old_row.void then ' (re-salto)' else '' end || '; el anterior quedó archivado', k);
  else
    j.extra := coalesce(j.extra, '{}');
    j.created_at := now();
    j.updated_at := now();
    insert into public.jumps select (j).*;
    insert into public.audit_log (event_id, actor, who, text, jump_key)
      values (j.event_id, p_actor, coalesce(p_who, ''), 'Se cargó el salto de ' || pilot_name || ', ' || public.task_label(j.task) || ' R' || j.round
              || ' (' || j.file_name || ')', k);
  end if;

  insert into public.tracks (event_id, pilot_id, task, round, packed) values (j.event_id, j.pilot_id, j.task, j.round, p_track);
  if jsonb_typeof(p_file) = 'object' then
    insert into public.files select * from jsonb_populate_record(null::public.files, p_file || jsonb_build_object(
      'event_id', j.event_id, 'pilot_id', j.pilot_id, 'task', j.task, 'round', j.round));
  end if;

  -- Other jumps of the slot that are now closer to this one (only if closer than what they had).
  update public.jumps t set sep_min = s.sep_min, sep_with = s.sep_with, sep_violation = s.sep_violation
    from jsonb_to_recordset(case when jsonb_typeof(p_sep) = 'array' then p_sep else '[]' end) as s(pilot_id text, task text, round integer, sep_min double precision, sep_with text, sep_violation boolean)
   where t.event_id = j.event_id and t.pilot_id = s.pilot_id and t.task = s.task and t.round = s.round
     and (t.sep_min is null or s.sep_min < t.sep_min);

  -- A validated task reopens when one of its jumps changes.
  slot := j.task || '|' || j.round;
  if ev.validated ? slot then
    update public.events set validated = validated - slot where id = j.event_id;
    insert into public.audit_log (event_id, actor, who, text, jump_key)
      values (j.event_id, p_actor, coalesce(p_who, ''), 'Se reabrió la tarea ' || public.task_label(j.task) || ' '
              || case when j.round = 0 then 'Desempate' else 'R' || j.round end || ' porque cambió un salto', k);
  end if;

  return jsonb_build_object('replaced', old_row.event_id is not null);
end $$;

-- Applies a rescoring of all the event's jumps, computed by the server from their tracks.
-- p_scores: one entry per jump with its key, the updated_at it was computed from, and the engine columns.
-- Refuses if any jump changed in the meantime, so a result is never computed from stale data.
create function public.apply_scores(p_event text, p_scores jsonb, p_actor uuid, p_who text, p_text text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  changes jsonb;
begin
  perform public.begin_admin_write(p_actor);
  perform 1 from public.events where id = p_event for update;
  if jsonb_typeof(p_scores) is distinct from 'array'
     or jsonb_array_length(p_scores) <> (select count(*) from public.jumps where event_id = p_event)
     or exists (
       select 1 from public.jumps j where j.event_id = p_event and not exists (
         select 1 from jsonb_array_elements(p_scores) s
          where s ->> 'pilot_id' = j.pilot_id and s ->> 'task' = j.task and (s ->> 'round')::int = j.round
            and (s ->> 'expected_updated_at')::timestamptz = j.updated_at)) then
    raise exception 'Cambiaron saltos de la jornada mientras se recalculaba: probá de nuevo.';
  end if;

  with s as (select * from jsonb_populate_recordset(null::public.jumps, p_scores))
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', public.jump_key(j.pilot_id, j.task, j.round),
           'before', jsonb_build_object('ok', j.ok, 'time', j.time, 'distance', j.distance, 'speed', j.speed, 'lane_pen', j.lane_pen, 'sep_violation', j.sep_violation),
           'after',  jsonb_build_object('ok', s.ok, 'time', s.time, 'distance', s.distance, 'speed', s.speed, 'lane_pen', s.lane_pen, 'sep_violation', s.sep_violation))), '[]')
    into changes
    from public.jumps j join s using (event_id, pilot_id, task, round)
   where (j.ok, j.time, j.distance, j.speed, j.lane_pen, j.sep_violation) is distinct from (s.ok, s.time, s.distance, s.speed, s.lane_pen, s.sep_violation);

  update public.jumps j set
    ok = s.ok, time = s.time, distance = s.distance, speed = s.speed, exit_agl = s.exit_agl,
    t_exit = s.t_exit, t_val = s.t_val, t_top = s.t_top, t_bot = s.t_bot, t_deploy = s.t_deploy, hz = s.hz, sep_max = s.sep_max,
    flags = s.flags, lane_dev = s.lane_dev, lane_outside = s.lane_outside, lane_pen = s.lane_pen,
    sep_min = s.sep_min, sep_with = s.sep_with, sep_violation = s.sep_violation
  from jsonb_populate_recordset(null::public.jumps, p_scores) s
  where j.event_id = p_event and (j.pilot_id, j.task, j.round) = (s.pilot_id, s.task, s.round);
  get diagnostics n = row_count;

  insert into public.audit_log (event_id, actor, who, text, data)
    values (p_event, p_actor, coalesce(p_who, ''), p_text, jsonb_build_object('changed', changes));
  return n;
end $$;

revoke execute on function public.save_jump(jsonb, jsonb, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_scores(text, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_jump(jsonb, jsonb, jsonb, jsonb, uuid, text) to service_role;
grant execute on function public.apply_scores(text, jsonb, uuid, text, text) to service_role;
