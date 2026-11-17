// Stage 2: schema, role-based permissions and the full-backup importer.
// Acceptance criterion (CLAUDE.md): an event exported from the previous platform imports and gives the same standings.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as W from '../lib/engine';
import { rowToEvent, rowToJump, rowToPilot, type EventRow, type JumpRow, type PilotRow, type ReviewRow } from '../lib/data/rows';
import { parseBackup, prepareImport, BackupError, type LegacyBackup, type PreparedImport } from '../lib/import/backup';
import { createTestDb, createUser, type TestDb } from './support/db';
import { buildLegacyBackup } from './support/legacy-backup';
import { legacy } from './support/legacy';

const SERVICE = { role: 'service_role' } as const;
const ANON = { role: 'anon' } as const;
const NOW = '2026-11-16T22:00:00.000Z';

let db: TestDb;
let backup: LegacyBackup;
let prepared: PreparedImport;
let admin: string, judge: string, pilot: string, pilotWithoutRecord: string;

beforeAll(async () => {
  db = await createTestDb();
  backup = await buildLegacyBackup();
  prepared = prepareImport(parseBackup(JSON.stringify(backup)), { now: NOW, fileName: 'copa-ava-3-full-backup.json' });
  admin = await createUser(db, 'admin');
  judge = await createUser(db, 'judge');
  pilotWithoutRecord = await createUser(db, 'pilot');
  const [r] = await db.as<{ r: Record<string, unknown> }>(SERVICE, `select public.import_backup($1::jsonb, $2::uuid, 'Admin') as r`, [JSON.stringify(prepared.payload), admin]);
  expect(r.r).toMatchObject({ event: 'eabc123', jumps: backup.jumps.length, existingPilots: [] });
  pilot = await createUser(db, 'pilot', 'pana01');
});
afterAll(() => db?.close());

/** Treats "missing field" and "null" alike: on the previous platform both mean "no value". */
function normalize(o: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v != null && k !== 'id' && !k.startsWith('_')) out[k] = v;
  return out;
}

async function readBack(who: { role: 'authenticated'; uid: string } | typeof SERVICE = SERVICE) {
  const [ev] = await db.as<EventRow>(who, `select * from public.events where id = 'eabc123'`);
  const jumps = await db.as<JumpRow>(who, `select * from public.jumps where event_id = 'eabc123'`);
  const reviews = await db.as<ReviewRow>(who, `select event_id, pilot_id, task, round, reviewer_name, legacy_uid, at from public.reviews where event_id = 'eabc123' order by id`);
  const pilots = await db.as<PilotRow>(who, `select * from public.pilots order by id`);
  return { ev, jumps, reviews, pilots };
}

describe('full-backup importer', () => {
  test('the test backup covers every case', () => {
    const js = backup.jumps;
    expect(js.length).toBe(47); // 5 pilots × 3 tasks × 3 rounds + 2 tiebreak jumps
    expect(js.some((j) => j.void)).toBe(true);
    expect(js.some((j) => j.laneDecision != null)).toBe(true);
    expect(js.some((j) => j.penManual != null)).toBe(true);
    expect(js.some((j) => j.sepViolation && j.sepApply === false)).toBe(true);
    expect(js.some((j) => j.exitPen)).toBe(true);
    expect(new Set(js.map((j) => j.lanePen)).size).toBeGreaterThanOrEqual(3);
    expect(prepared.uploads.length).toBeGreaterThan(10);
    expect(prepared.warnings).toEqual([]);
  });

  test('same standings as the previous platform (overall, per task, tiebreak and penalties)', async () => {
    const { ev, jumps, reviews } = await readBack();
    const event = rowToEvent(ev);
    const ours = W.standings(jumps.map((r) => rowToJump(r, reviews)), null, { tiebreak: event.tiebreak });
    // As scored() in legacy/src/app.js
    const theirs = legacy.standings(backup.jumps.map((j) => ({ ...j })), null, { tiebreak: backup.event.tiebreak });
    const view = (st: W.Standings) => ({
      rows: st.rows.map((r) => ({
        rank: r.rank, pilotId: r.pilotId, total: r.total, totalRounded: r.totalRounded, tb: r.tb, jumps: r.jumps,
        tasks: Object.fromEntries(Object.entries(r.tasks).map(([t, c]) => [t, {
          points: c!.points,
          cells: Object.fromEntries(Object.entries(c!.cells).map(([round, j]) => [round, [j._result, j._points, j._pen, j._penWhy, j._isBest]])),
        }])),
      })),
      rounds: st.rounds,
      tiebreak: st.tiebreak.map((j) => [j.pilotId, j._result, j._points]).sort(),
    });
    expect(view(ours)).toStrictEqual(view(theirs));
    expect(ours.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  test('every jump round-trips (missing = null), with its reviews', async () => {
    const { jumps, reviews } = await readBack();
    const byKey = new Map(jumps.map((r) => [`${r.pilot_id}-${r.task}-${r.round}`, rowToJump(r, reviews)]));
    expect(byKey.size).toBe(backup.jumps.length);
    for (const j of backup.jumps) {
      expect(normalize(byKey.get(String(j.id))!), String(j.id)).toStrictEqual(normalize(j));
    }
  });

  test('event and pilots round-trip', async () => {
    const { ev, pilots } = await readBack();
    const { published, ...event } = rowToEvent(ev);
    expect(published).toBe(false); // imported events start unpublished
    expect(normalize(event)).toStrictEqual(normalize(backup.event));
    expect(pilots.map(rowToPilot)).toStrictEqual(backup.pilots);
  });

  test('tracks and original files', async () => {
    const tracks = await db.as<{ pilot_id: string; task: string; round: number; packed: unknown }>(SERVICE, `select pilot_id, task, round, packed from public.tracks`);
    expect(tracks).toHaveLength(backup.jumps.length);
    for (const t of tracks) expect(t.packed).toStrictEqual(backup.tracks[`${t.pilot_id}-${t.task}-${t.round}`]);
    // Rescoring from the imported track gives the same as the legacy engine. (The packed track rounds
    // altitude to the centimetre: the result may move in the 4th decimal versus the original file,
    // exactly as on the previous platform; 5.10.1 rounding does not change.)
    for (const t of tracks.slice(0, 5)) {
      const pts = W.unpackTrack(t.packed as W.PackedTrack);
      expect(W.scoreJump(pts, { elev: 0 })).toStrictEqual(legacy.scoreJump(legacy.unpackTrack(t.packed), { elev: 0 }));
      const j = backup.jumps.find((x) => x.id === `${t.pilot_id}-${t.task}-${t.round}`)!;
      const sc = W.scoreJump(pts, { elev: 0 });
      expect(Math.abs(sc[j.task as W.Task]! - (j[j.task] as number))).toBeLessThan(j.task === 'time' ? 0.005 : 0.05);
    }

    const files = await db.as<{ sha256: string; storage_path: string; size: number }>(SERVICE, `select * from public.files`);
    const withOriginal = Object.values(backup.originals!).filter(Boolean);
    expect(files).toHaveLength(withOriginal.length);
    expect(prepared.uploads.map((u) => u.path).sort()).toEqual(files.map((f) => f.storage_path).sort());
    for (const f of files) expect(f.storage_path.endsWith(`/${f.sha256}.gz`)).toBe(true);
  });

  test('audit log: the legacy entries plus the import entry', async () => {
    const log = await db.as<{ text: string; who: string; actor: string | null }>(SERVICE, `select * from public.audit_log where event_id = 'eabc123' order by at, id`);
    expect(log).toHaveLength(backup.log!.length + 1);
    const last = log.find((l) => l.text.startsWith('Se importó'))!;
    expect(last.actor).toBe(admin);
    expect(last.text).toBe(`Se importó la copia completa de la versión anterior (${backup.jumps.length} saltos)`);
  });

  test('does not import over an existing event', async () => {
    await expect(db.as(SERVICE, `select public.import_backup($1::jsonb, null, 'x')`, [JSON.stringify(prepared.payload)]))
      .rejects.toThrow(/ya existe/);
  });

  test('existing pilots are left untouched', async () => {
    const other = structuredClone(backup);
    other.event.id = 'eother'; other.pilots[0].name = 'Another name';
    const p = prepareImport(other, { now: NOW });
    const [r] = await db.as<{ r: { existingPilots: string[]; newPilots: string[] } }>(SERVICE, `select public.import_backup($1::jsonb, null, 'x') as r`, [JSON.stringify(p.payload)]);
    expect(r.r.newPilots).toEqual([]);
    expect(r.r.existingPilots.sort()).toEqual(backup.pilots.map((x) => x.id).sort());
    const [ana] = await db.as<PilotRow>(SERVICE, `select * from public.pilots where id = 'pana01'`);
    expect(ana.name).toBe('Ana Gómez');
  });

  test('invalid backups are rejected with a clear message', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}')).toThrow(/No es una copia completa/);
    expect(() => parseBackup(JSON.stringify({ ...backup, event: { ...backup.event, demo: true } }))).toThrow(/ejemplo/);
    const orphan = structuredClone(backup); orphan.pilots = orphan.pilots.slice(1);
    expect(() => prepareImport(orphan)).toThrow(/piloto que no está/);
    const damaged = structuredClone(backup);
    const jid = Object.keys(damaged.originals!).find((k) => damaged.originals![k])!;
    damaged.originals![jid]!.sha256 = 'f'.repeat(64);
    expect(prepareImport(damaged).warnings.join('\n')).toMatch(/huella guardada del original no coincide/);
  });
});

describe('role-based permissions (RLS)', () => {
  const count = async (who: Parameters<TestDb['as']>[0], table: string) =>
    (await db.as<{ n: number }>(who, `select count(*)::int as n from public.${table}`))[0].n;

  test('unpublished event: hidden from the public and pilots; visible to judges and admins', async () => {
    for (const t of ['events', 'jumps', 'tracks', 'files', 'reviews', 'pilots', 'archive', 'audit_log', 'profiles']) {
      expect(await count(ANON, t), t).toBe(0);
    }
    const me = { role: 'authenticated', uid: pilotWithoutRecord } as const;
    expect(await count(me, 'events')).toBe(0);
    expect(await count(me, 'jumps')).toBe(0);
    expect(await count(me, 'profiles')).toBe(1); // only their own
    for (const uid of [judge, admin]) {
      const who = { role: 'authenticated', uid } as const;
      expect(await count(who, 'events')).toBe(2);
      expect(await count(who, 'jumps')).toBe(backup.jumps.length * 2);
      expect(await count(who, 'audit_log')).toBeGreaterThan(0);
    }
    expect(await count({ role: 'authenticated', uid: judge }, 'profiles')).toBe(1);
    expect(await count({ role: 'authenticated', uid: admin }, 'profiles')).toBe(4);
  });

  test('a pilot linked to a pilot record sees their own record', async () => {
    const me = { role: 'authenticated', uid: pilot } as const;
    expect(await db.as(me, `select id from public.pilots`)).toEqual([{ id: 'pana01' }]);
  });

  test('nobody writes from the browser, not even an admin', async () => {
    for (const who of [ANON, { role: 'authenticated', uid: admin } as const]) {
      await expect(db.run(who, `insert into public.pilots (id, name) values ('px', 'X')`)).rejects.toThrow(/row-level security/);
      const u = await db.run(who, `update public.jumps set distance = 9999`);
      expect(u.affected).toBe(0);
      const d = await db.run(who, `delete from public.jumps`);
      expect(d.affected).toBe(0);
      const p = await db.run(who, `update public.profiles set role = 'admin'`);
      expect(p.affected).toBe(0);
      await expect(db.run(who, `select public.import_backup('{}'::jsonb, null, 'x')`)).rejects.toThrow(/permission denied/);
    }
    expect(await count(SERVICE, 'jumps')).toBe(backup.jumps.length * 2);
  });

  test('published event: the public sees results, pilots and tracks, but not the audit log or archive', async () => {
    await db.run(SERVICE, `update public.events set published = true where id = 'eabc123'`);
    expect(await count(ANON, 'events')).toBe(1);
    expect(await count(ANON, 'jumps')).toBe(backup.jumps.length);
    expect(await count(ANON, 'tracks')).toBe(backup.jumps.length);
    expect(await count(ANON, 'pilots')).toBe(backup.pilots.length);
    expect(await count(ANON, 'archive')).toBe(0);
    expect(await count(ANON, 'audit_log')).toBe(0);
    expect(await count(ANON, 'profiles')).toBe(0);
    await db.run(SERVICE, `update public.events set published = false where id = 'eabc123'`);
  });
});

describe('nothing is deleted without archiving', () => {
  test('deleting a jump archives it with its track, file and reviews', async () => {
    const [j] = await db.as<JumpRow>(SERVICE, `select * from public.jumps j where event_id = 'eother' and exists (select 1 from public.reviews r where (r.event_id, r.pilot_id, r.task, r.round) = (j.event_id, j.pilot_id, j.task, j.round)) and exists (select 1 from public.files f where (f.event_id, f.pilot_id, f.task, f.round) = (j.event_id, j.pilot_id, j.task, j.round)) limit 1`);
    await db.run(SERVICE, `delete from public.jumps where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [j.event_id, j.pilot_id, j.task, j.round]);
    const [a] = await db.as<{ kind: string; key: string; deleted: boolean; data: { jump: JumpRow; track: unknown; file: unknown; reviews: unknown[] } }>(SERVICE, `select * from public.archive order by id desc limit 1`);
    expect(a.kind).toBe('jump');
    expect(a.key).toBe(`${j.pilot_id}-${j.task}-${j.round}`);
    expect(a.deleted).toBe(true);
    expect(a.data.jump.distance).toBe(j.distance);
    expect(a.data.track).toBeTruthy();
    expect(a.data.file).toBeTruthy();
    expect(a.data.reviews.length).toBeGreaterThan(0);
    expect(await db.as(SERVICE, `select 1 from public.tracks where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [j.event_id, j.pilot_id, j.task, j.round])).toEqual([]);
  });

  test('archive and audit log cannot be updated or deleted, not even with the secret key', async () => {
    await expect(db.run(SERVICE, `update public.archive set reason = 'x'`)).rejects.toThrow(/append-only/);
    await expect(db.run(SERVICE, `delete from public.archive`)).rejects.toThrow(/append-only/);
    await expect(db.run(SERVICE, `delete from public.audit_log`)).rejects.toThrow(/append-only/);
  });

  test('a pilot with jumps cannot be deleted', async () => {
    await expect(db.run(SERVICE, `delete from public.pilots where id = 'pana01'`)).rejects.toThrow(/foreign key/);
  });
});
