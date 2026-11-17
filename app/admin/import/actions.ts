'use server';
// Import of a full backup exported by the previous platform.
// 1) The browser uploads the JSON straight to Storage with a signed URL (Vercel caps a request body
//    at 4.5 MB and a backup with originals can be larger). 2) The server downloads it, converts it,
//    uploads the originals and calls import_backup (all or nothing). Messages are shown to the admin (Spanish).
import { randomUUID } from 'node:crypto';
import { assertRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { BackupError, parseBackup, prepareImport } from '@/lib/import/backup';

const MAX_BYTES = 100 * 1024 * 1024;

export type UploadTicket = { path: string; token: string } | { error: string };

export async function requestUpload(fileName: string, size: number): Promise<UploadTicket> {
  try {
    await assertRole('admin');
    if (!/\.json$/i.test(fileName)) return { error: 'Elegí el archivo .json de la copia completa.' };
    if (!(size > 0 && size <= MAX_BYTES)) return { error: 'El archivo es demasiado grande (máximo 100 MB).' };
    const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.json`;
    const { data, error } = await createAdminClient().storage.from('imports').createSignedUploadUrl(path);
    if (error || !data) return { error: 'No pude preparar la subida. Probá de nuevo.' };
    return { path: data.path, token: data.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export type ImportResult =
  | { ok: true; eventId: string; eventName: string; jumps: number; newPilots: number; existingPilots: number; originals: number; warnings: string[] }
  | { ok: false; error: string };

export async function runImport(path: string, fileName: string): Promise<ImportResult> {
  try {
    const s = await assertRole('admin');
    if (!/^\d{4}-\d\d-\d\d\/[0-9a-f-]{36}\.json$/.test(path)) return { ok: false, error: 'Ruta de archivo inválida.' };
    const admin = createAdminClient();
    const { data: blob, error: dlErr } = await admin.storage.from('imports').download(path);
    if (dlErr || !blob) return { ok: false, error: 'No encuentro el archivo subido.' };

    const prepared = prepareImport(parseBackup(await blob.text()), { fileName });
    const { event } = prepared.payload;
    const { data: exists } = await admin.from('events').select('id').eq('id', event.id).maybeSingle();
    if (exists) return { ok: false, error: `La jornada "${event.name}" ya está en la base: no se importa encima.` };

    // Originals go first. The path contains the SHA-256, so uploading the same file twice is harmless.
    for (const u of prepared.uploads) {
      const { error } = await admin.storage.from(u.bucket).upload(u.path, u.bytes, { contentType: u.contentType, upsert: true });
      if (error) return { ok: false, error: `No pude guardar el archivo original ${u.path}. No se importó nada.` };
    }

    const { data, error } = await admin.rpc('import_backup', { payload: prepared.payload, p_actor: s.userId, p_who: s.email });
    if (error) return { ok: false, error: `La base rechazó la importación: ${error.message}` };
    const r = data as { jumps: number; newPilots: string[]; existingPilots: string[] };
    return {
      ok: true, eventId: event.id, eventName: event.name, jumps: r.jumps, newPilots: r.newPilots.length,
      existingPilots: r.existingPilots.length, originals: prepared.uploads.length, warnings: prepared.warnings,
    };
  } catch (e) {
    if (e instanceof BackupError) return { ok: false, error: e.message };
    return { ok: false, error: 'Error inesperado al importar. No se guardó nada en la base.' };
  }
}
