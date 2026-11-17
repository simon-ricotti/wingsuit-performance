// Download of the original GPS file as uploaded (stored gzip-compressed in Storage).
import { gunzipSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; jid: string }> }) {
  const { id, jid } = await params;
  const s = await getSession();
  if (!s || (s.role !== 'admin' && s.role !== 'judge')) return new NextResponse('No tenés permiso.', { status: 403 });
  const m = /^(p[0-9a-z]{4,40})-(time|distance|speed)-(\d{1,3})$/i.exec(jid);
  if (!m) return new NextResponse('Salto inválido.', { status: 400 });
  const admin = createAdminClient();
  const { data: f } = await admin.from('files').select('storage_path, name').eq('event_id', id).eq('pilot_id', m[1]).eq('task', m[2]).eq('round', +m[3]).maybeSingle();
  if (!f) return new NextResponse('Este salto no tiene el archivo original guardado.', { status: 404 });
  const { data: blob } = await admin.storage.from('originals').download(f.storage_path);
  if (!blob) return new NextResponse('No encuentro el archivo original.', { status: 404 });
  const raw = gunzipSync(Buffer.from(await blob.arrayBuffer()));
  const name = (f.name || `${jid}.csv`).replace(/[^\w.\- ]/g, '_');
  return new NextResponse(new Uint8Array(raw), {
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' },
  });
}
