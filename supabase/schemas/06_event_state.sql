-- Competition state of an event that is not a setting: tiebreak draw (5.10.6), team nomination (8.4.2),
-- participants, pass size, task order draw (5.4.8), exit order (5.5) and publication (stage 7). Draws are made by the server.
-- One function with a whitelist, writing the change and the audit log in one transaction.
create function public.set_event_state(p_event text, p_patch jsonb, p_text text, p_actor uuid, p_who text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  editable constant text[] := array['tiebreak', 'team_pick', 'roster', 'pass_size', 'task_order', 'exit_order', 'published'];
  p jsonb;
  old_row public.events;
  new_row public.events;
begin
  select * into old_row from public.events where id = p_event for update;
  if old_row.id is null then raise exception 'La jornada no existe (puede que la hayan borrado).'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}') into p from jsonb_each(p_patch) where key = any(editable);
  new_row := jsonb_populate_record(old_row, p);
  update public.events set tiebreak = new_row.tiebreak, team_pick = new_row.team_pick, roster = new_row.roster,
    pass_size = new_row.pass_size, task_order = new_row.task_order, exit_order = new_row.exit_order, published = new_row.published
  where id = p_event;
  insert into public.audit_log (event_id, actor, who, text, data)
    values (p_event, p_actor, coalesce(p_who, ''), p_text,
            jsonb_build_object('before', (select jsonb_object_agg(k, to_jsonb(old_row) -> k) from jsonb_object_keys(p) k), 'after', p));
end $$;

revoke execute on function public.set_event_state(text, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_event_state(text, jsonb, text, uuid, text) to service_role;
