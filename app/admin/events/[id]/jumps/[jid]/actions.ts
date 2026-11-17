'use server';
// Judge review of one jump: decisions, lane start correction, signatures and delete
// (saveDecision, laneRecalc, signReview, clear-reviews and del-jump in legacy/src/app.js).
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertRole } from '@/lib/auth/session';
import { actorName, callWrite, type FormState } from '@/lib/admin/write';
import { createAdminClient } from '@/lib/supabase/admin';
import { rowToJump, type EventRow, type JumpRow, type ReviewRow } from '@/lib/data/rows';
import { scoreJump, unpackTrack, type PackedTrack } from '@/lib/engine';
import { eventConfig, roundLabel, TASK_LABEL } from '@/lib/jumps/score';
import { fmt, pendingDecisions } from '@/lib/standings/views';

const JID = /^(p[0-9a-z]{4,40})-(time|distance|speed)-(\d{1,3})$/i;

/** Session check plus the jump being reviewed, its event and the pilot's name. */
async function load(form: FormData) {
  const s = await assertRole('admin', 'judge');
  const eventId = String(form.get('event') ?? ''), m = JID.exec(String(form.get('jump') ?? ''));
  if (!m || !/^e[0-9a-z]{4,40}$/i.test(eventId)) throw new Error('Salto inválido.');
  const [, pilot, task, r] = m, round = +r;
  const admin = createAdminClient();
  const [{ data: ev }, { data: row }, { data: reviews }, { data: p }] = await Promise.all([
    admin.from('events').select('*').eq('id', eventId).maybeSingle<EventRow>(),
    admin.from('jumps').select('*').eq('event_id', eventId).eq('pilot_id', pilot).eq('task', task).eq('round', round).maybeSingle<JumpRow>(),
    admin.from('reviews').select('pilot_id, task, round, reviewer_name, legacy_uid, at').eq('event_id', eventId).eq('pilot_id', pilot).eq('task', task).eq('round', round).returns<ReviewRow[]>(),
    admin.from('pilots').select('name').eq('id', pilot).maybeSingle(),
  ]);
  if (!ev || !row) throw new Error('El salto no existe (puede que lo hayan reemplazado o borrado).');
  const key = { p_event: eventId, p_pilot: pilot, p_task: task, p_round: round };
  const what = `${p?.name ?? pilot}, ${TASK_LABEL[task as keyof typeof TASK_LABEL]} ${roundLabel(round)}`;
  return { s, ev, row, j: rowToJump(row, reviews ?? []), key, what, path: `/admin/events/${eventId}` };
}

async function run(form: FormData, fn: (ctx: Awaited<ReturnType<typeof load>>) => Promise<FormState | void>): Promise<FormState> {
  let ctx;
  try { ctx = await load(form); } catch (e) { return { error: (e as Error).message }; }
  const r = await fn(ctx);
  revalidatePath(ctx.path, 'layout');
  return r ?? { saved: true };
}

export async function saveDecisions(_prev: FormState, form: FormData): Promise<FormState> {
  return run(form, async ({ s, j, key, what }) => {
    const set: Record<string, unknown> = {}, changed: string[] = [];
    const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');
    const put = (col: string, cur: unknown, v: unknown, label: string) => { if (!same(cur, v)) { set[col] = v; changed.push(label); } };
    const f = form.get('flag');
    if (f !== null) {
      put('flag_decision', j.flagDecision, f || null, 'GPS o salida: ' + (f === 'rejump' ? 're-salto' : f === 'accept' ? 'validado' : 'pendiente'));
      if ('flag_decision' in set) set.void = f === 'rejump'; // 5.7.4: a granted rejump voids this jump
    }
    const l = form.get('lane');
    if (l !== null) put('lane_decision', j.laneDecision, l === '' ? null : +l, 'carril: ' + (l === '' ? 'propuesta' : l + ' %'));
    const sp = form.get('sep');
    if (sp !== null) put('sep_apply', j.sepApply, sp === '' ? null : sp === 'yes', 'separación: ' + (sp === 'yes' ? 'aplicar cero' : sp === 'no' ? 'no aplicar' : 'pendiente'));
    const ex = form.get('exit');
    if (ex !== null && +ex !== (+(j.exitPen as number) || 0)) { set.exit_pen = +ex; changed.push('salida: ' + ex + ' %'); }
    const m = form.get('manual');
    if (m !== null) put('pen_manual', j.penManual, m === '' ? null : +m, 'penalidad a mano: ' + (m === '' ? 'no' : m + ' %'));
    const nt = String(form.get('notes') ?? '');
    if (nt !== String(j.notes ?? '')) { set.notes = nt; changed.push('notas'); }
    if (!changed.length) return { saved: true };
    const clear = ((j.reviews as unknown[]) ?? []).length > 0 && changed.some((c) => c !== 'notas');
    const r = await callWrite('update_jump', { ...key, p_set: set, p_clear_reviews: clear, p_text: `Decisión sobre ${what}: ${changed.join('; ')}`, p_actor: s.userId, p_who: actorName(s) });
    return r.error ? { error: r.error } : { saved: true };
  });
}

/** Moves the lane start (valDelay 9 s ± shift) and rescores only the lane, from the stored track. */
export async function correctLaneStart(_prev: FormState, form: FormData): Promise<FormState> {
  return run(form, async ({ s, ev, j, key, what }) => {
    const sh = parseFloat(String(form.get('shift') ?? '0').replace(',', '.'));
    if (!isFinite(sh) || Math.abs(sh) > 5) return { error: 'La corrección del inicio del carril tiene que estar entre −5 y +5 s.' };
    const { data: tr } = await createAdminClient().from('tracks').select('packed').eq('event_id', key.p_event).eq('pilot_id', key.p_pilot).eq('task', key.p_task).eq('round', key.p_round).maybeSingle();
    const refs = (ev.refs ?? []) as { lat: number; lon: number }[];
    const ref = ev.lane && j.refIdx != null ? refs[j.refIdx as number] : null;
    const sc = tr ? scoreJump(unpackTrack(tr.packed as PackedTrack), { ...eventConfig(ev), valDelay: 9 + sh }, ref) : null;
    if (!sc?.ok || !sc.lane) return { error: 'No pude recalcular el carril de este salto.' };
    const r = await callWrite('update_jump', {
      ...key, p_set: { lane_shift: sh, t_val: sc.tVal, lane_dev: sc.lane.dev, lane_outside: sc.lane.outside, lane_pen: sc.lane.penalty },
      p_clear_reviews: true, p_actor: s.userId, p_who: actorName(s),
      p_text: `Inicio del carril corregido ${sh >= 0 ? '+' : ''}${String(sh).replace('.', ',')} s en ${what}: ${fmt(sc.lane.outside, 0)} m afuera`,
    });
    return r.error ? { error: r.error } : { saved: true };
  });
}

export async function signReview(_prev: FormState, form: FormData): Promise<FormState> {
  return run(form, async ({ s, ev, j, key, what }) => {
    if (pendingDecisions(ev, j).length) return { error: 'Primero tomá las decisiones pendientes.' };
    const name = actorName(s);
    const r = await callWrite('sign_review', { ...key, p_name: name, p_text: `Revisión firmada por ${name}: ${what}`, p_actor: s.userId });
    return r.error ? { error: r.error } : { saved: true };
  });
}

export async function clearReviews(_prev: FormState, form: FormData): Promise<FormState> {
  return run(form, async ({ s, key, what }) => {
    const r = await callWrite('update_jump', { ...key, p_set: {}, p_clear_reviews: true, p_text: `Se borraron las firmas de revisión de ${what}`, p_actor: s.userId, p_who: actorName(s) });
    return r.error ? { error: r.error } : { saved: true };
  });
}

export async function deleteJump(_prev: FormState, form: FormData): Promise<FormState> {
  let path = '';
  const res = await run(form, async ({ s, key, what, path: p }) => {
    path = p;
    const r = await callWrite('delete_jump', { ...key, p_text: `Se borró el salto de ${what}; quedó archivado`, p_actor: s.userId, p_who: actorName(s) });
    return r.error ? { error: r.error } : { saved: true };
  });
  if (res.error || !path) return res;
  redirect(path);
}
