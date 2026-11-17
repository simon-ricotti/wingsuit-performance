// Server side of jump upload and rescoring. Always called after assertRole; uses the secret-key client.
import 'server-only';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { packTrack, parseTrack, scoreJump, trimTrack, unpackTrack, type JumpRecord, type PackedTrack, type TrackPoint } from '../engine';
import { jumpToRow, rowToJump, type EventRow, type JumpRow, type ReviewRow } from '../data/rows';
import { createAdminClient } from '../supabase/admin';
import { altitudeIn } from '../events/settings';
import { eventConfig, jumpDoc, recalcJumps, scoreColumns, separationOnUpload, uploadRef } from './score';

export const ORIGINALS = 'originals';
/** Browser uploads land here (gzip) and are moved to their final, content-addressed path once scored. */
export const INCOMING = /^incoming\/[0-9a-f-]{36}\.gz$/;
const MAX_RAW_BYTES = 60 * 1024 * 1024;

export class JumpError extends Error {}

export async function loadEvent(id: string): Promise<EventRow | null> {
  const { data } = await createAdminClient().from('events').select('*').eq('id', id).maybeSingle<EventRow>();
  return data;
}

/** Jumps of an event (optionally one task and round) with their tracks, as engine records. */
export async function loadJumpsWithTracks(eventId: string, slot?: { task: string; round: number }) {
  const admin = createAdminClient();
  let qj = admin.from('jumps').select('*').eq('event_id', eventId);
  let qt = admin.from('tracks').select('pilot_id, task, round, packed').eq('event_id', eventId);
  if (slot) { qj = qj.eq('task', slot.task).eq('round', slot.round); qt = qt.eq('task', slot.task).eq('round', slot.round); }
  const [{ data: rows, error: e1 }, { data: tracks, error: e2 }] = await Promise.all([qj.returns<JumpRow[]>(), qt]);
  if (e1 || e2) throw new Error('No pude leer los saltos de la jornada.');
  const packed = new Map((tracks ?? []).map((t) => [`${t.pilot_id}-${t.task}-${t.round}`, t.packed as PackedTrack]));
  const cache = new Map<string, TrackPoint[] | null>();
  const key = (j: { pilotId: string; task: string; round: number | string }) => `${j.pilotId}-${j.task}-${j.round}`;
  const trackOf = (j: JumpRecord): TrackPoint[] | null => {
    const k = key(j);
    if (!cache.has(k)) { const p = packed.get(k); cache.set(k, p ? unpackTrack(p) : null); }
    return cache.get(k)!;
  };
  return { rows: rows ?? [], jumps: (rows ?? []).map((r) => rowToJump(r, [] as ReviewRow[])), trackOf };
}

/**
 * Rescoring payload for apply_scores / save_event: every jump of the event with the updated_at it was
 * computed from. `ev` carries the settings to score with (the new ones when settings change).
 */
export async function rescorePayload(ev: Pick<EventRow, 'id' | 'cfg' | 'lane' | 'refs' | 'sep_check'>) {
  const { rows, jumps, trackOf } = await loadJumpsWithTracks(ev.id);
  const { jumps: out, done } = recalcJumps(ev, jumps, trackOf);
  const scores = out.map((j, i) => ({
    event_id: ev.id, pilot_id: rows[i].pilot_id, task: rows[i].task, round: rows[i].round,
    expected_updated_at: rows[i].updated_at, ...scoreColumns(j),
  }));
  return { scores, done, total: rows.length };
}

export interface UploadInput {
  event: EventRow; pilotId: string; task: string; round: number; refIdx: number | null;
  incomingPath: string; fileName: string; uploadedBy: string;
}

/** Downloads the uploaded file, scores it and prepares everything save_jump needs. */
export async function prepareUpload(input: UploadInput) {
  const { event: ev } = input;
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from(ORIGINALS).download(input.incomingPath);
  if (error || !blob) throw new JumpError('No encuentro el archivo subido. Probá de nuevo.');
  const gz = Buffer.from(await blob.arrayBuffer());
  let raw: Buffer;
  try { raw = gunzipSync(gz, { maxOutputLength: MAX_RAW_BYTES }); } catch { throw new JumpError('El archivo llegó dañado o es demasiado grande. Probá de nuevo.'); }
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const text = new TextDecoder().decode(raw);

  let parsed;
  try { parsed = parseTrack(text, input.fileName); } catch (e) { throw new JumpError((e as Error).message); }
  const { ref, refIdx } = uploadRef(ev, input.refIdx);
  const cfg = eventConfig(ev);
  const sc = scoreJump(parsed.pts, cfg, ref);
  if (!sc.ok) {
    const ft = ev.units === 'ft';
    throw new JumpError(`${sc.error} Revisá que sea el archivo correcto y la elevación del DZ (${altitudeIn(cfg.elev, ft) || '–'} ${ft ? 'ft' : 'm'}).`);
  }

  const doc = jumpDoc(sc, {
    pilotId: input.pilotId, task: input.task, round: input.round, refIdx, device: parsed.device, fileName: input.fileName,
    fileHash: sha256, fileSize: raw.byteLength, uploadedBy: input.uploadedBy,
  });
  doc.originalSaved = true;
  const myTrack = trimTrack(parsed.pts, sc);
  const packed = packTrack(myTrack);

  // 5.6.3: separation against the other jumps of the same task and round.
  let sepUpdates: ReturnType<typeof separationOnUpload>['updates'] = [];
  if (ev.sep_check) {
    const { jumps, trackOf } = await loadJumpsWithTracks(ev.id, { task: input.task, round: input.round });
    // The new jump is compared with its trimmed, packed track, as the previous platform does after saving.
    const sep = separationOnUpload(ev, doc, unpackTrack(packed), jumps.map((j) => ({ jump: j, track: trackOf(j) })));
    Object.assign(doc, sep.mine);
    sepUpdates = sep.updates;
  }

  const jid = `${input.pilotId}-${input.task}-${input.round}`;
  const storagePath = `${ev.id}/${jid}/${sha256}.gz`;
  const now = new Date().toISOString();
  return {
    doc,
    row: jumpToRow(doc, ev.id, now),
    packed,
    file: { storage_path: storagePath, sha256, size: raw.byteLength, name: input.fileName, uploaded_at: now },
    sep: sepUpdates.map((u) => ({ pilot_id: u.pilotId, task: u.task, round: u.round, sep_min: u.sepMin, sep_with: u.sepWith, sep_violation: u.sepViolation })),
    storagePath,
  };
}

/** Moves the uploaded file to its final path (content-addressed: an identical file may already be there). */
export async function keepOriginal(incomingPath: string, storagePath: string) {
  const bucket = createAdminClient().storage.from(ORIGINALS);
  const { error } = await bucket.move(incomingPath, storagePath);
  if (error) {
    const { data } = await bucket.list(storagePath.slice(0, storagePath.lastIndexOf('/')), { search: storagePath.slice(storagePath.lastIndexOf('/') + 1) });
    if (!data?.length) throw new JumpError('No pude guardar el archivo original. No se guardó el salto.');
    await bucket.remove([incomingPath]);
  }
}

export async function discardIncoming(incomingPath: string) {
  await createAdminClient().storage.from(ORIGINALS).remove([incomingPath]).catch(() => {});
}
