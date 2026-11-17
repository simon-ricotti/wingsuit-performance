'use server';
import { randomInt } from 'node:crypto';
import { TASKS } from '@/lib/engine';
import { eventStandings } from '@/lib/standings/views';
import { reverseOrder, shuffle, topTies } from '@/lib/standings/order';
import { revalidatePath } from 'next/cache';
import { assertRole } from '@/lib/auth/session';
import { actorName, callWrite, type FormState } from '@/lib/admin/write';
import { createAdminClient } from '@/lib/supabase/admin';
import { rowToJump, type EventRow, type JumpRow, type ReviewRow } from '@/lib/data/rows';
import { roundLabel, TASK_LABEL } from '@/lib/jumps/score';
import { jumpStatus } from '@/lib/standings/views';

/** 5.4.2: a task of a round is validated when all its jumps are reviewed; until then results are provisional. */
export async function setTaskValidation(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin', 'judge'); } catch (e) { return { error: (e as Error).message }; }
  const eventId = String(form.get('event') ?? ''), slot = String(form.get('slot') ?? ''), validate = form.get('validate') === '1';
  const m = /^(time|distance|speed)\|(\d{1,3})$/.exec(slot);
  if (!m || !/^e[0-9a-z]{4,40}$/i.test(eventId)) return { error: 'Tarea inválida.' };
  const [, task, round] = m;
  if (validate) {
    const admin = createAdminClient();
    const [{ data: ev }, { data: rows }, { data: reviews }] = await Promise.all([
      admin.from('events').select('judging, lane').eq('id', eventId).maybeSingle<Pick<EventRow, 'judging' | 'lane'>>(),
      admin.from('jumps').select('*').eq('event_id', eventId).eq('task', task).eq('round', +round).returns<JumpRow[]>(),
      admin.from('reviews').select('pilot_id, task, round, reviewer_name, legacy_uid, at').eq('event_id', eventId).eq('task', task).eq('round', +round).returns<ReviewRow[]>(),
    ]);
    const live = (rows ?? []).map((r) => rowToJump(r, reviews ?? [])).filter((j) => !j.void);
    if (!ev || !live.length || live.some((j) => jumpStatus(ev, j).code !== 'ok')) return { error: 'Faltan saltos por revisar en esta tarea.' };
  }
  const label = `${TASK_LABEL[task as keyof typeof TASK_LABEL]} ${roundLabel(+round)}`;
  const r = await callWrite('set_task_validation', {
    p_event: eventId, p_slot: slot, p_validate: validate, p_text: `${validate ? 'Se validó' : 'Se reabrió'} la tarea ${label}`,
    p_actor: s.userId, p_who: actorName(s),
  });
  if (r.error) return { error: r.error };
  revalidatePath(`/admin/events/${eventId}`, 'layout');
  return { saved: true };
}

// ---------- competition state: tiebreak, team nomination, participants, task order and exit order ----------
const rnd = (n: number) => randomInt(n);

/** One action for every competition-state change; `op` says which. Draws happen here, on the server. */
export async function eventState(_prev: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await assertRole('admin', 'judge'); } catch (e) { return { error: (e as Error).message }; }
  const eventId = String(form.get('event') ?? ''), op = String(form.get('op') ?? '');
  if (!/^e[0-9a-z]{4,40}$/i.test(eventId)) return { error: 'Jornada inválida.' };
  // Publishing is the organizer's call, and needs nothing else loaded (stage 7).
  if (op === 'publish' || op === 'unpublish') {
    if (s.role !== 'admin') return { error: 'Publicar o despublicar una jornada lo decide el organizador.' };
    const r = await callWrite('set_event_state', {
      p_event: eventId, p_patch: { published: op === 'publish' }, p_text: op === 'publish' ? 'Se publicó la jornada' : 'Se despublicó la jornada',
      p_actor: s.userId, p_who: actorName(s),
    });
    if (r.error) return { error: r.error };
    revalidatePath(`/admin/events/${eventId}`, 'layout');
    revalidatePath('/results', 'layout');
    return { saved: true };
  }
  const admin = createAdminClient();
  const [{ data: ev }, { data: rows }] = await Promise.all([
    admin.from('events').select('*').eq('id', eventId).maybeSingle<EventRow>(),
    admin.from('jumps').select('*').eq('event_id', eventId).returns<JumpRow[]>(),
  ]);
  if (!ev) return { error: 'La jornada no existe.' };
  const who = actorName(s);
  const { st } = eventStandings(ev, (rows ?? []).map((r) => rowToJump(r)));
  const { data: pilots } = await admin.from('pilots').select('id, name');
  const name = (id: string) => (pilots ?? []).find((p) => p.id === id)?.name ?? id;
  // Participants: the chosen list, or else those with jumps (roster in the previous platform).
  const roster = Array.isArray(ev.roster) && ev.roster.length
    ? (ev.roster as string[]).filter((id) => (pilots ?? []).some((p) => p.id === id))
    : [...new Set((rows ?? []).map((r) => r.pilot_id))];

  let patch: Record<string, unknown>, text: string;
  if (op === 'tiebreak-draw') {
    const task = TASKS[rnd(3)];
    patch = { tiebreak: { task, at: Date.now(), by: who, pilots: topTies(st).flatMap((g) => g.rows.map((r) => r.pilotId)) } };
    text = `Se sorteó la tarea de desempate: ${TASK_LABEL[task]}`;
  } else if (op === 'tiebreak-clear') {
    patch = { tiebreak: null }; text = 'Se quitó el desempate';
  } else if (op === 'team-pick') {
    const team = String(form.get('team') ?? ''), ids = form.getAll('pilot').map(String);
    patch = { team_pick: { ...((ev.team_pick ?? {}) as Record<string, string[]>), [team]: ids } };
    text = `Nominación del equipo ${team}: ${ids.map(name).join(', ') || 'nadie'}`;
  } else if (op === 'roster') {
    const ids = form.getAll('pilot').map(String).filter((id) => (pilots ?? []).some((p) => p.id === id));
    const size = Math.max(1, Math.min(30, Math.round(+(form.get('passSize') ?? 5)) || 5));
    patch = { roster: ids, pass_size: size }; text = `Participantes: ${ids.length}; pilotos por pasada: ${size}`;
  } else if (op === 'task-order-draw') {
    const order = shuffle([...TASKS], rnd);
    patch = { task_order: order }; text = `Se sorteó el orden de las tareas: ${order.map((t) => TASK_LABEL[t]).join(', ')}`; // 5.4.8
  } else if (op === 'order-make' || op === 'order-clear') {
    const round = Math.round(+(form.get('round') ?? 0));
    if (!(round >= 1 && round <= 99)) return { error: 'Ronda inválida.' };
    const order = { ...((ev.exit_order ?? {}) as Record<string, unknown>) };
    if (op === 'order-clear') { delete order[round]; patch = { exit_order: order }; text = `Se borró el orden de salida de la ronda ${round}`; }
    else {
      if (!roster.length) return { error: 'Elegí los participantes primero.' };
      const source = String(form.get('source') ?? '');
      let res: { order: string[]; unranked?: number }, how: string;
      if (round > 1) {
        res = reverseOrder(st.rows, roster, rnd); // 5.5.3
        how = 'Inverso de la clasificación de esta jornada' + (res.unranked ? `; ${res.unranked} sin resultado, sorteados al principio` : '');
      } else if (source && /^e[0-9a-z]{4,40}$/i.test(source)) {
        const [{ data: src }, { data: srcJumps }] = await Promise.all([
          admin.from('events').select('name, tiebreak').eq('id', source).maybeSingle(),
          admin.from('jumps').select('*').eq('event_id', source).returns<JumpRow[]>(),
        ]);
        res = reverseOrder(eventStandings(src ?? { tiebreak: null }, (srcJumps ?? []).map((r) => rowToJump(r))).st.rows, roster, rnd); // 5.5.2
        how = `Inverso de la clasificación de ${src?.name ?? 'otra jornada'}` + (res.unranked ? `; ${res.unranked} sin resultado previo, sorteados al principio` : '');
      } else { res = { order: shuffle(roster, rnd) }; how = 'Sorteo'; }
      order[round] = { ids: res.order, how, at: Date.now(), by: who };
      patch = { exit_order: order }; text = `Orden de salida de la ronda ${round}: ${how}`;
    }
  } else return { error: 'Operación inválida.' };

  const r = await callWrite('set_event_state', { p_event: eventId, p_patch: patch, p_text: text, p_actor: s.userId, p_who: who });
  if (r.error) return { error: r.error };
  revalidatePath(`/admin/events/${eventId}`, 'layout');
  return { saved: true };
}
