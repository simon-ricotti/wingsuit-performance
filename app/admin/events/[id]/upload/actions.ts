'use server';
// Jump upload: 1) the browser compresses the GPS file and uploads it to Storage with a signed URL
// (no request-size limits on Vercel); 2) the server reads it, scores it with the engine (official
// score: it does not trust the browser preview), keeps the original and saves everything in one transaction.
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { assertRole } from '@/lib/auth/session';
import { actorName, callWrite } from '@/lib/admin/write';
import { createAdminClient } from '@/lib/supabase/admin';
import { TASKS, type JumpRecord } from '@/lib/engine';
import { discardIncoming, INCOMING, JumpError, keepOriginal, loadEvent, ORIGINALS, prepareUpload } from '@/lib/jumps/server';
import { TASK_LABEL } from '@/lib/jumps/score';

const MAX_GZ_BYTES = 20 * 1024 * 1024;

export type UploadTicket = { path: string; token: string } | { error: string };

export async function requestJumpUpload(size: number): Promise<UploadTicket> {
  try {
    await assertRole('admin', 'judge', 'pilot');
    if (!(size > 0 && size <= MAX_GZ_BYTES)) return { error: 'El archivo es demasiado grande.' };
    const { data, error } = await createAdminClient().storage.from(ORIGINALS).createSignedUploadUrl(`incoming/${randomUUID()}.gz`);
    if (error || !data) return { error: 'No pude preparar la subida. Probá de nuevo.' };
    return { path: data.path, token: data.token };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface SaveJumpInput {
  eventId: string; pilotId: string; newPilotName?: string; task: string; round: number; refIdx: number | null;
  incomingPath: string; fileName: string;
}

export type SaveJumpResult = { ok: true; jump: JumpRecord; replaced: boolean; pilotId: string } | { ok: false; error: string };

export async function saveJump(input: SaveJumpInput): Promise<SaveJumpResult> {
  if (!INCOMING.test(input.incomingPath)) return { ok: false, error: 'Ruta de archivo inválida.' };
  try {
    const s = await assertRole('admin', 'judge', 'pilot');
    const ev = await loadEvent(input.eventId);
    if (!ev) throw new JumpError('La jornada no existe.');
    // Stage 6: a pilot uploads only their own jumps, and only where the organizer allows it.
    if (s.role === 'pilot') {
      if (!s.pilotId) throw new JumpError('Tu usuario no está vinculado a una ficha de piloto. Pedíselo al organizador.');
      if (!ev.pilot_uploads) throw new JumpError('En esta jornada los saltos los cargan los jueces.');
      if (input.pilotId !== s.pilotId) throw new JumpError('Solo podés cargar tus propios saltos.');
    }
    const task = input.task;
    const round = Math.round(+input.round);
    if (!(TASKS as readonly string[]).includes(task)) throw new JumpError('Elegí la tarea.');
    const tiebreak = (ev.tiebreak as { task?: string } | null)?.task ?? null;
    if (round === 0) {
      if (!tiebreak) throw new JumpError('La ronda tiene que ser un número a partir de 1.');
      if (task !== tiebreak) throw new JumpError(`El salto de desempate es de ${TASK_LABEL[tiebreak as keyof typeof TASK_LABEL].toLowerCase()}.`);
    } else if (!(round >= 1 && round <= (ev.mode === 'competition' ? ev.rounds : 99))) {
      throw new JumpError(ev.mode === 'competition' ? `La ronda tiene que estar entre 1 y ${ev.rounds}.` : 'La ronda tiene que ser un número a partir de 1.');
    }

    let pilotId = input.pilotId;
    if (pilotId === '__new') {
      const name = (input.newPilotName ?? '').trim();
      if (!name) throw new JumpError('Poné el nombre del piloto nuevo.');
      const r = await callWrite<string>('save_pilot', { p_pilot: { name }, p_actor: s.userId, p_who: actorName(s) });
      if (r.error) throw new JumpError(r.error);
      pilotId = r.data!;
    } else if (!/^p[0-9a-z]{4,40}$/i.test(pilotId)) throw new JumpError('Elegí el piloto.');

    const p = await prepareUpload({
      event: ev, pilotId, task, round, refIdx: input.refIdx, incomingPath: input.incomingPath,
      fileName: input.fileName.slice(0, 200), uploadedBy: actorName(s),
    });
    await keepOriginal(input.incomingPath, p.storagePath);
    const r = await callWrite<{ replaced: boolean }>('save_jump', {
      p_jump: p.row, p_track: p.packed, p_file: p.file, p_sep: p.sep, p_actor: s.userId, p_who: actorName(s),
    });
    if (r.error) return { ok: false, error: r.error };
    revalidatePath(`/admin/events/${ev.id}`);
    revalidatePath('/account');
    return { ok: true, jump: p.doc, replaced: r.data!.replaced, pilotId };
  } catch (e) {
    await discardIncoming(input.incomingPath);
    if (e instanceof JumpError) return { ok: false, error: e.message };
    if (e instanceof Error && /permiso/.test(e.message)) return { ok: false, error: e.message };
    console.error('[saveJump]', e);
    return { ok: false, error: 'Error inesperado. No se guardó el salto.' };
  }
}
