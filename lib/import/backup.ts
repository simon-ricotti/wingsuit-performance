// Importer for the full backup exported by the previous platform (format: wingsuit-performance-backup).
// Turns the backup into rows for public.import_backup() and files for Storage. It writes nothing:
// the caller uploads the files and then calls the function (all or nothing).
// Error and warning messages are shown to the admin, so they are in Spanish.
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { PackedTrack } from '../engine';
import {
  eventToRow, jumpKeyString, jumpToRow, pilotToRow, reviewsToRows,
  type EventRow, type JumpRow, type LegacyEvent, type LegacyJump, type LegacyPilot, type PilotRow, type ReviewRow,
} from '../data/rows';

export const BACKUP_FORMAT = 'wingsuit-performance-backup';

export interface LegacyOriginal { name?: string; size?: number; sha256?: string; enc?: 'gzip' | 'raw'; data: string; at?: number }
export interface LegacyLogEntry { at?: number; who?: string; uid?: string | null; text?: string; jid?: string | null }

export interface LegacyBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt?: string;
  exportedBy?: string | null;
  event: LegacyEvent;
  pilots: LegacyPilot[];
  jumps: LegacyJump[];
  tracks: Record<string, PackedTrack | null>;
  originals?: Record<string, LegacyOriginal | null>;
  log?: LegacyLogEntry[];
}

export interface FileRow { event_id: string; pilot_id: string; task: string; round: number; storage_path: string; sha256: string; size: number; name: string; uploaded_at: string }
export interface TrackRow { event_id: string; pilot_id: string; task: string; round: number; packed: PackedTrack }
export interface LogRow { event_id: string; at: string; who: string; text: string; jump_key: string | null; data: Record<string, unknown> | null }

export interface ImportPayload {
  event: EventRow;
  pilots: PilotRow[];
  jumps: JumpRow[];
  tracks: TrackRow[];
  files: FileRow[];
  reviews: ReviewRow[];
  log: LogRow[];
  source: Record<string, unknown>;
}

export interface Upload { bucket: 'originals'; path: string; bytes: Uint8Array; contentType: 'application/gzip' }

export interface PreparedImport {
  payload: ImportPayload;
  uploads: Upload[];
  /** Warnings shown to the admin; they do not stop the import. */
  warnings: string[];
}

export class BackupError extends Error {}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export function parseBackup(text: string): LegacyBackup {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new BackupError('El archivo no es un JSON válido.'); }
  const b = data as Partial<LegacyBackup>;
  if (!b || b.format !== BACKUP_FORMAT) throw new BackupError('No es una copia completa de Wingsuit Performance (falta "format": "wingsuit-performance-backup").');
  if (b.version !== 1) throw new BackupError(`Versión de copia ${b.version} desconocida (se espera 1).`);
  if (!b.event || !b.event.id) throw new BackupError('La copia no trae la jornada.');
  if (b.event.demo) throw new BackupError('Es la jornada de ejemplo: no se importa.');
  if (!Array.isArray(b.jumps) || !Array.isArray(b.pilots)) throw new BackupError('La copia no trae saltos o pilotos.');
  return b as LegacyBackup;
}

export function prepareImport(backup: LegacyBackup, opts: { now?: string; fileName?: string } = {}): PreparedImport {
  const now = opts.now ?? new Date().toISOString();
  const ev = backup.event, eventId = String(ev.id);
  const warnings: string[] = [];
  const uploads: Upload[] = [];

  const pilotIds = new Set(backup.pilots.map((p) => String(p.id)));
  for (const j of backup.jumps) {
    if (!pilotIds.has(String(j.pilotId))) throw new BackupError(`El salto ${jumpKeyString(j)} es de un piloto que no está en la copia (${j.pilotId}).`);
  }
  const seen = new Set<string>();
  for (const j of backup.jumps) {
    const k = jumpKeyString(j);
    if (seen.has(k)) throw new BackupError(`El salto ${k} aparece dos veces.`);
    seen.add(k);
  }

  const jumps = backup.jumps.map((j) => jumpToRow(j, eventId, now));
  const reviews = backup.jumps.flatMap((j) => reviewsToRows(j, eventId, now));
  const tracks: TrackRow[] = [];
  const files: FileRow[] = [];

  for (const j of backup.jumps) {
    const jid = jumpKeyString(j), key = { event_id: eventId, pilot_id: String(j.pilotId), task: String(j.task), round: Math.round(+j.round) };
    const tr = backup.tracks?.[jid] ?? (j.id ? backup.tracks?.[String(j.id)] : null);
    if (tr) tracks.push({ ...key, packed: tr });
    else warnings.push(`${jid}: la copia no trae el track; el salto no se podrá recalcular ni ver en el replay.`);

    const og = backup.originals?.[jid];
    if (!og) {
      if (j.originalSaved) warnings.push(`${jid}: el salto dice que tenía el archivo original, pero la copia no lo trae.`);
      continue;
    }
    let raw: Uint8Array, gz: Uint8Array;
    try {
      const enc = Buffer.from(og.data, 'base64');
      if (og.enc === 'gzip') { gz = new Uint8Array(enc); raw = new Uint8Array(gunzipSync(enc)); }
      else { raw = new Uint8Array(enc); gz = new Uint8Array(gzipSync(enc, { level: 9 })); }
    } catch {
      warnings.push(`${jid}: el archivo original está dañado y no se importó.`);
      continue;
    }
    const h = sha256(raw);
    if (og.sha256 && og.sha256 !== h) warnings.push(`${jid}: la huella guardada del original no coincide con su contenido.`);
    if (j.fileHash && j.fileHash !== h) warnings.push(`${jid}: el original no coincide con la huella del salto (${String(j.fileHash).slice(0, 12)}…).`);
    const path = `${eventId}/${jid}/${h}.gz`;
    uploads.push({ bucket: 'originals', path, bytes: gz, contentType: 'application/gzip' });
    files.push({ ...key, storage_path: path, sha256: h, size: raw.byteLength, name: String(og.name ?? j.fileName ?? ''), uploaded_at: og.at ? new Date(og.at).toISOString() : now });
  }

  const log: LogRow[] = (backup.log ?? [])
    .filter((l) => l && l.text)
    .map((l) => ({
      event_id: eventId, at: typeof l.at === 'number' ? new Date(l.at).toISOString() : now, who: String(l.who ?? ''),
      text: String(l.text), jump_key: l.jid ?? null, data: l.uid ? { legacyUid: l.uid } : null,
    }));

  return {
    payload: {
      event: eventToRow(ev, now),
      pilots: backup.pilots.map((p) => pilotToRow(p, now)),
      jumps, tracks, files, reviews, log,
      source: { format: backup.format, version: backup.version, exportedAt: backup.exportedAt ?? null, exportedBy: backup.exportedBy ?? null, fileName: opts.fileName ?? null },
    },
    uploads,
    warnings,
  };
}
