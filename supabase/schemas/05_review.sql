-- Judge review: decisions on a jump, review signatures with the logged-in user, deleting a jump and
-- validating tasks. Each function writes the change and the audit log in one transaction; only the
-- server (service_role) calls them, after checking the role. Log texts come from the server (Spanish).

-- A validated task reopens when one of its jumps changes (as on the previous platform).
create function public.reopen_slot(p_event text, p_task text, p_round integer, p_actor uuid, p_who text)
returns void language plpgsql security definer set search_path = '' as $$
declare slot text := p_task || '|' || p_round;
begin
  if exists (select 1 from public.events where id = p_event and validated ? slot) then
    update public.events set validated = validated - slot where id = p_event;
    insert into public.audit_log (event_id, actor, who, text, jump_key)
      values (p_event, p_actor, coalesce(p_who, ''), 'Se reabrió la tarea ' || public.task_label(p_task) || ' '
              || case when p_round = 0 then 'Desempate' else 'R' || p_round end || ' porque cambió un salto', null);
  end if;
end $$;

-- Changes judge decisions (and the lane fields when the lane start is corrected) of one jump.
-- p_set: only the keys present change. p_clear_reviews: a changed decision voids the signatures.
create function public.update_jump(p_event text, p_pilot text, p_task text, p_round integer, p_set jsonb,
                                   p_clear_reviews boolean, p_text text, p_actor uuid, p_who text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  editable constant text[] := array['pen_manual', 'lane_decision', 'sep_apply', 'exit_pen', 'flag_decision', 'void', 'notes',
                                    'lane_shift', 't_val', 'lane_dev', 'lane_outside', 'lane_pen'];
  p jsonb;
  old_row public.jumps;
  new_row public.jumps;
  removed jsonb := '[]';
begin
  perform public.begin_admin_write(p_actor);
  perform 1 from public.events where id = p_event for update;
  select * into old_row from public.jumps where (event_id, pilot_id, task, round) = (p_event, p_pilot, p_task, p_round) for update;
  if old_row.event_id is null then raise exception 'El salto no existe (puede que lo hayan reemplazado o borrado).'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}') into p from jsonb_each(p_set) where key = any(editable);
  new_row := jsonb_populate_record(old_row, p);
  update public.jumps set
    pen_manual = new_row.pen_manual, lane_decision = new_row.lane_decision, sep_apply = new_row.sep_apply, exit_pen = new_row.exit_pen,
    flag_decision = new_row.flag_decision, void = new_row.void, notes = new_row.notes, lane_shift = new_row.lane_shift,
    t_val = new_row.t_val, lane_dev = new_row.lane_dev, lane_outside = new_row.lane_outside, lane_pen = new_row.lane_pen
  where (event_id, pilot_id, task, round) = (p_event, p_pilot, p_task, p_round);
  if p_clear_reviews then
    -- Nothing is deleted without a copy: the removed signatures go into the audit log entry.
    with d as (delete from public.reviews where (event_id, pilot_id, task, round) = (p_event, p_pilot, p_task, p_round) returning *)
    select coalesce(jsonb_agg(to_jsonb(d) order by d.at), '[]') into removed from d;
  end if;
  insert into public.audit_log (event_id, actor, who, text, jump_key, data)
    values (p_event, p_actor, coalesce(p_who, ''), p_text, public.jump_key(p_pilot, p_task, p_round),
            jsonb_build_object('before', (select jsonb_object_agg(k, to_jsonb(old_row) -> k) from jsonb_object_keys(p) k),
                               'after', p, 'reviewsRemoved', removed));
  perform public.reopen_slot(p_event, p_task, p_round, p_actor, p_who);
end $$;

-- Review signature by the logged-in judge. Two signatures are always two different users.
create function public.sign_review(p_event text, p_pilot text, p_task text, p_round integer, p_name text, p_text text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.jumps;
begin
  perform 1 from public.events where id = p_event for update;
  select * into j from public.jumps where (event_id, pilot_id, task, round) = (p_event, p_pilot, p_task, p_round) for update;
  if j.event_id is null then raise exception 'El salto no existe (puede que lo hayan reemplazado o borrado).'; end if;
  if j.void then raise exception 'El salto está anulado por re-salto: no se firma.'; end if;
  if exists (select 1 from public.reviews where (event_id, pilot_id, task, round) = (p_event, p_pilot, p_task, p_round) and reviewer = p_actor) then
    raise exception 'Ya firmaste este salto. La otra revisión tiene que ser de otro juez.';
  end if;
  insert into public.reviews (event_id, pilot_id, task, round, reviewer, reviewer_name)
    values (p_event, p_pilot, p_task, p_round, p_actor, coalesce(p_name, ''));
  insert into public.audit_log (event_id, actor, who, text, jump_key)
    values (p_event, p_actor, coalesce(p_name, ''), p_text, public.jump_key(p_pilot, p_task, p_round));
  perform public.reopen_slot(p_event, p_task, p_round, p_actor, p_name);
end $$;

-- Deletes a jump: the archive trigger keeps it with its track, file and signatures.
create function public.delete_jump(p_event text, p_pilot text, p_task text, p_round integer, p_text text, p_actor uuid, p_who text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.begin_admin_write(p_actor, 'Borrado por un juez');
  perform 1 from public.events where id = p_event for update;
  delete from public.jumps where (event_id, pilot_id, task, round) = (p_event, p_pilot, p_task, p_round);
  if not found then raise exception 'El salto no existe (puede que ya lo hayan borrado).'; end if;
  insert into public.audit_log (event_id, actor, who, text, jump_key)
    values (p_event, p_actor, coalesce(p_who, ''), p_text, public.jump_key(p_pilot, p_task, p_round));
end $$;

-- Validates (results become final, 5.4.2) or reopens a task of a round. p_slot: 'task|round'.
create function public.set_task_validation(p_event text, p_slot text, p_validate boolean, p_text text, p_actor uuid, p_who text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.events set validated = case when p_validate
      then validated || jsonb_build_object(p_slot, jsonb_build_object('by', coalesce(p_who, ''), 'at', (extract(epoch from now()) * 1000)::bigint))
      else validated - p_slot end
   where id = p_event;
  if not found then raise exception 'La jornada no existe.'; end if;
  insert into public.audit_log (event_id, actor, who, text) values (p_event, p_actor, coalesce(p_who, ''), p_text);
end $$;

revoke execute on function public.reopen_slot(text, text, integer, uuid, text) from public, anon, authenticated;
revoke execute on function public.update_jump(text, text, text, integer, jsonb, boolean, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.sign_review(text, text, text, integer, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.delete_jump(text, text, text, integer, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.set_task_validation(text, text, boolean, text, uuid, text) from public, anon, authenticated;
grant execute on function public.reopen_slot(text, text, integer, uuid, text) to service_role;
grant execute on function public.update_jump(text, text, text, integer, jsonb, boolean, text, uuid, text) to service_role;
grant execute on function public.sign_review(text, text, text, integer, text, text, uuid) to service_role;
grant execute on function public.delete_jump(text, text, text, integer, text, uuid, text) to service_role;
grant execute on function public.set_task_validation(text, text, boolean, text, uuid, text) to service_role;
