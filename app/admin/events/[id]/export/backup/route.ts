// Full backup of an event (exportBackup in the previous platform). It can weigh several MB with the
// originals and Vercel caps a response at 4.5 MB, so it is written to Storage and downloaded from a signed URL.
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildBackup, type BackupSource } from '@/lib/import/backup';
import type { EventRow, JumpRow, PilotRow, ReviewRow } from '@/lib/data/rows';
import { slug } from '@/lib/standings/load';

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || (s.role !== 'admin' && s.role !== 'judge')) return NextResponse.json({ error: 'No tenés permiso.' }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: event }, { data: jumps }, { data: reviews }, { data: tracks }, { data: files }, { data: log }] = await Promise.all([
    admin.from('events').select('*').eq('id', id).maybeSingle<EventRow>(),
    admin.from('jumps').select('*').eq('event_id', id).returns<JumpRow[]>(),
    admin.from('reviews').select('pilot_id, task, round, reviewer_name, legacy_uid, at').eq('event_id', id).order('at').returns<ReviewRow[]>(),
    admin.from('tracks').select('pilot_id, task, round, packed').eq('event_id', id),
    admin.from('files').select('*').eq('event_id', id),
    admin.from('audit_log').select('at, who, actor, text, jump_key, data').eq('event_id', id).order('at').order('id'),
  ]);
  if (!event) return NextResponse.json({ error: 'La jornada no existe.' }, { status: 404 });
  const ids = [...new Set((jumps ?? []).map((j) => j.pilot_id))];
  const { data: pilots } = await admin.from('pilots').select('*').in('id', ids.length ? ids : ['-']).returns<PilotRow[]>();

  const originals: BackupSource['originals'] = {};
  const bucket = admin.storage.from('originals');
  for (const f of files ?? []) {
    const { data: blob } = await bucket.download(f.storage_path);
    if (!blob) return NextResponse.json({ error: `No encuentro el archivo original de ${f.pilot_id}-${f.task}-${f.round}. No se armó la copia.` }, { status: 500 });
    originals[`${f.pilot_id}-${f.task}-${f.round}`] = { name: f.name, size: f.size, sha256: f.sha256, gz: new Uint8Array(await blob.arrayBuffer()), at: f.uploaded_at };
  }

  const backup = buildBackup({ event, pilots: pilots ?? [], jumps: jumps ?? [], reviews: reviews ?? [], tracks: tracks ?? [], originals, log: log ?? [], exportedBy: s.displayName || s.email });
  const name = `${slug(event.name)}-copia-completa.json`;
  // Kept in the imports bucket under exports/: also a dated backup of the event.
  const path = `exports/${id}/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const up = await admin.storage.from('imports').upload(path, new Blob([JSON.stringify(backup)], { type: 'application/json' }), { contentType: 'application/json' });
  if (up.error) return NextResponse.json({ error: 'No pude guardar la copia. Probá de nuevo.' }, { status: 500 });
  const { data: signed } = await admin.storage.from('imports').createSignedUrl(path, 300, { download: name });
  if (!signed) return NextResponse.json({ error: 'No pude preparar la descarga. Probá de nuevo.' }, { status: 500 });
  return NextResponse.json({ url: signed.signedUrl });
}
