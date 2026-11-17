// Stage 2: schema, role-based permissions and the full-backup importer.
// Acceptance criterion (CLAUDE.md): an event exported from the previous platform imports and gives the same standings.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as W from '../lib/engine';
import { rowToEvent, rowToJump, rowToPilot, type EventRow, type JumpRow, type PilotRow, type ReviewRow } from '../lib/data/rows';
import { parseBackup, prepareImport, BackupError, type LegacyBackup, type PreparedImport } from '../lib/import/backup';
import { createTestDb, createUser, type TestDb } from './support/db';
import { parseEventSettings } from '../lib/events/settings';
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

describe('admin writes (events, pilots, user access)', () => {
  const call = async <T = unknown>(fn: string, args: string, params: unknown[]) =>
    (await db.as<{ r: T }>(SERVICE, `select public.${fn}(${args}) as r`, params))[0]?.r;
  const lastLog = async () => (await db.as<{ text: string; actor: string | null; who: string; event_id: string | null }>(SERVICE, `select * from public.audit_log order by id desc limit 1`))[0];

  test('creating and editing an event writes the audit log in the same call', async () => {
    const settings = parseEventSettings({ name: 'Entrenamiento', date: '2026-12-01', dz: 'AVA', units: 'ft', elev: '85', top: '8202', bottom: '4921', lane: '1', sepCheck: '0', refs: 'Norte, -33.01, -60.64', profile: 'fai', reviews: '2', door: 'fd', gpsRule: 'rejump', exitRule: 'rejump', mode: 'competition', rounds: '4' });
    expect(settings.cfg).toEqual({ elev: 26, top: 2500, bottom: 1500, exitMin: 3200, exitMax: 3353 }); // ft → m as the previous platform
    const id = await call<string>('save_event', '$1::jsonb, $2::uuid, $3', [JSON.stringify(settings), admin, 'Admin']);
    expect(id).toMatch(/^e[0-9a-f]{12}$/);
    expect(await lastLog()).toMatchObject({ event_id: id, actor: admin, text: 'Se creó la jornada "Entrenamiento"' });
    const [ev] = await db.as<EventRow>(SERVICE, `select * from public.events where id = $1`, [id]);
    expect(ev).toMatchObject({ mode: 'competition', rounds: 4, units: 'ft', lane: true, sep_check: false, published: false });
    expect(ev.refs).toEqual([{ name: 'Norte', lat: -33.01, lon: -60.64 }]);

    // No change → no log entry
    const before = await lastLog();
    await call('save_event', '$1::jsonb, $2::uuid, $3', [JSON.stringify({ ...settings, id }), admin, 'Admin']);
    expect(await lastLog()).toEqual(before);

    await call('save_event', '$1::jsonb, $2::uuid, $3', [JSON.stringify({ ...settings, id, name: 'Entrenamiento 2', published: true, id_extra: 1 }), admin, 'Admin']);
    const [after] = await db.as<EventRow>(SERVICE, `select * from public.events where id = $1`, [id]);
    expect(after.name).toBe('Entrenamiento 2');
    expect(after.published).toBe(false); // not editable here
    expect((await lastLog()).text).toBe('Se cambiaron los ajustes de la jornada (name)');
  });

  test('scoring settings of an event with jumps only change together with a rescoring; the rest can change', async () => {
    const [ev] = await db.as<EventRow>(SERVICE, `select * from public.events where id = 'eabc123'`);
    await expect(call('save_event', '$1::jsonb, $2::uuid, $3', [JSON.stringify({ id: ev.id, cfg: { ...ev.cfg, elev: 30 } }), admin, 'Admin']))
      .rejects.toThrow(/hay que recalcular/);
    await expect(call('save_event', '$1::jsonb, $2::uuid, $3', [JSON.stringify({ id: ev.id, lane: false }), admin, 'Admin']))
      .rejects.toThrow(/hay que recalcular/);
    await call('save_event', '$1::jsonb, $2::uuid, $3', [JSON.stringify({ id: ev.id, name: 'Copa AVA, fecha 3 (renombrada)' }), admin, 'Admin']);
    expect((await db.as<EventRow>(SERVICE, `select name from public.events where id = 'eabc123'`))[0].name).toBe('Copa AVA, fecha 3 (renombrada)');
  });

  test('deleting: an event or pilot with jumps is refused; otherwise it is archived with the actor', async () => {
    await expect(call('delete_event', `'eabc123', $1::uuid, 'Admin', null`, [admin])).rejects.toThrow(/tiene saltos/);
    await expect(call('delete_pilot', `'pana01', $1::uuid, 'Admin', null`, [admin])).rejects.toThrow(/tiene saltos/);
    const pid = await call<string>('save_pilot', '$1::jsonb, $2::uuid, $3', [JSON.stringify({ name: 'Piloto Nuevo', gender: 'F' }), judge, 'Juez']);
    expect((await lastLog()).text).toBe('Se creó el piloto Piloto Nuevo');
    await call('save_pilot', '$1::jsonb, $2::uuid, $3', [JSON.stringify({ id: pid, team: 'Rosario' }), judge, 'Juez']);
    expect((await lastLog()).text).toBe('Se editó el piloto Piloto Nuevo (team)');
    await call('delete_pilot', `$1, $2::uuid, 'Admin', 'cargado por error'`, [pid, admin]);
    const [a] = await db.as<{ kind: string; key: string; archived_by: string; reason: string }>(SERVICE, `select * from public.archive order by id desc limit 1`);
    expect(a).toMatchObject({ kind: 'pilot', key: pid, archived_by: admin, reason: 'cargado por error' });
    expect((await lastLog()).text).toBe('Se borró el piloto Piloto Nuevo (queda en el archivo)');
  });

  test('user access: role and pilot link, logged; at least one admin; a pilot links to one user', async () => {
    await call('set_user_access', `$1::uuid, 'judge', null, 'Juez Uno', $2::uuid, 'Admin'`, [pilotWithoutRecord, admin]);
    expect((await db.as<{ role: string; display_name: string }>(SERVICE, `select role, display_name from public.profiles where id = $1`, [pilotWithoutRecord]))[0])
      .toEqual({ role: 'judge', display_name: 'Juez Uno' });
    expect((await lastLog()).text).toBe('Se cambió el acceso de Juez Uno: rol judge, sin piloto vinculado');
    await expect(call('set_user_access', `$1::uuid, 'pilot', 'pana01', 'X', $2::uuid, 'Admin'`, [pilotWithoutRecord, admin])).rejects.toThrow(/ya está vinculado/);
    await expect(call('set_user_access', `$1::uuid, 'judge', null, 'Admin', $1::uuid, 'Admin'`, [admin])).rejects.toThrow(/al menos un organizador/);
  });

  test('none of the write functions can be called from the browser', async () => {
    for (const who of [ANON, { role: 'authenticated', uid: admin } as const]) {
      await expect(db.run(who, `select public.save_event('{}'::jsonb, null, 'x')`)).rejects.toThrow(/permission denied/);
      await expect(db.run(who, `select public.save_pilot('{}'::jsonb, null, 'x')`)).rejects.toThrow(/permission denied/);
      await expect(db.run(who, `select public.set_user_access($1::uuid, 'admin', null, '', null, 'x')`, [admin])).rejects.toThrow(/permission denied/);
      await expect(db.run(who, `select public.delete_event('x', null, 'x', null)`)).rejects.toThrow(/permission denied/);
    }
  });

  test('jump counts per event follow RLS', async () => {
    expect(await db.as(ANON, `select * from public.event_jump_counts`)).toEqual([]);
    const rows = await db.as<{ event_id: string; jumps: number }>({ role: 'authenticated', uid: admin }, `select * from public.event_jump_counts where event_id = 'eabc123'`);
    expect(rows).toEqual([{ event_id: 'eabc123', jumps: backup.jumps.length }]);
  });
});

describe('jump upload and rescoring', () => {
  const E = 'eabc123';
  const call = async <T = unknown>(fn: string, args: string, params: unknown[]) =>
    (await db.as<{ r: T }>(SERVICE, `select public.${fn}(${args}) as r`, params))[0]?.r;
  const logs = async (n: number) => (await db.as<{ text: string; jump_key: string | null }>(SERVICE, `select text, jump_key from public.audit_log order by id desc limit ${n}`)).reverse();
  const jump = async (pilot: string, task: string, round: number) =>
    (await db.as<JumpRow>(SERVICE, `select * from public.jumps where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [E, pilot, task, round]))[0];
  const trackOf = async (pilot: string, task: string, round: number) =>
    (await db.as<{ packed: unknown }>(SERVICE, `select packed from public.tracks where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [E, pilot, task, round]))[0]?.packed;
  const file = (name: string) => ({ storage_path: `${E}/x/${'a'.repeat(64)}.gz`, sha256: 'a'.repeat(64), size: 10, name, uploaded_at: NOW });
  const saveJump = (row: object, track: unknown, f: object | null, sep: object[] = []) =>
    call<{ replaced: boolean }>('save_jump', '$1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5::uuid, $6', [JSON.stringify(row), JSON.stringify(track), JSON.stringify(f), JSON.stringify(sep), judge, 'Juez Uno']);

  test('a new jump is saved with its track, file and log entry', async () => {
    const src = await jump('pana01', 'time', 1);
    const row = { ...src, round: 4, file_name: 'TRACK.CSV', extra: {}, lane_decision: null };
    expect(await saveJump(row, await trackOf('pana01', 'time', 1), file('TRACK.CSV'))).toEqual({ replaced: false });
    const saved = await jump('pana01', 'time', 4);
    expect(saved.time).toBe(src.time);
    expect(await trackOf('pana01', 'time', 4)).toBeTruthy();
    expect((await db.as(SERVICE, `select 1 from public.files where event_id = $1 and pilot_id = 'pana01' and task = 'time' and round = 4`, [E]))).toHaveLength(1);
    expect(await logs(1)).toEqual([{ text: 'Se cargó el salto de Ana Gómez, Tiempo R4 (TRACK.CSV)', jump_key: 'pana01-time-4' }]);
  });

  test('replacing archives the previous jump (track, file, reviews), starts clean and reopens a validated task', async () => {
    const before = await jump('pana01', 'time', 1);
    const reviewsBefore = await db.as(SERVICE, `select * from public.reviews where event_id = $1 and pilot_id = 'pana01' and task = 'time' and round = 1`, [E]);
    const row = { ...before, distance: 1234.5, lane_decision: null, notes: null, void: null, extra: {}, file_name: 'nuevo.csv' };
    expect(await saveJump(row, { v: 1 }, file('nuevo.csv'))).toEqual({ replaced: true });

    const [a] = await db.as<{ kind: string; key: string; deleted: boolean; reason: string; archived_by: string; data: { jump: JumpRow; track: unknown; reviews: unknown[] } }>(SERVICE, `select * from public.archive order by id desc limit 1`);
    expect(a).toMatchObject({ kind: 'jump', key: 'pana01-time-1', deleted: false, reason: 'Reemplazado por un archivo nuevo', archived_by: judge });
    expect(a.data.jump.distance).toBe(before.distance);
    expect(a.data.reviews).toHaveLength(reviewsBefore.length);
    const after = await jump('pana01', 'time', 1);
    expect(after).toMatchObject({ distance: 1234.5, file_name: 'nuevo.csv', notes: null });
    expect(await db.as(SERVICE, `select 1 from public.reviews where event_id = $1 and pilot_id = 'pana01' and task = 'time' and round = 1`, [E])).toEqual([]);
    expect(await trackOf('pana01', 'time', 1)).toEqual({ v: 1 });
    const [ev] = await db.as<EventRow>(SERVICE, `select validated from public.events where id = $1`, [E]);
    expect(ev.validated).not.toHaveProperty('time|1');
    expect(await logs(2)).toEqual([
      { text: 'Se reemplazó el salto de Ana Gómez, Tiempo R1; el anterior quedó archivado', jump_key: 'pana01-time-1' },
      { text: 'Se reabrió la tarea Tiempo R1 porque cambió un salto', jump_key: 'pana01-time-1' },
    ]);
  });

  test('separation updates only bring other jumps closer, never farther', async () => {
    const other = await jump('pbru02', 'time', 1);
    const row = { ...(await jump('pana01', 'time', 1)), extra: {} };
    await saveJump(row, { v: 1 }, null, [
      { pilot_id: 'pbru02', task: 'time', round: 1, sep_min: 99, sep_with: 'pana01', sep_violation: true },
      { pilot_id: 'pcar03', task: 'time', round: 1, sep_min: 1e9, sep_with: 'pana01', sep_violation: false },
    ]);
    expect(await jump('pbru02', 'time', 1)).toMatchObject({ sep_min: other.sep_min == null || 99 < other.sep_min ? 99 : other.sep_min });
    const pc = await jump('pcar03', 'time', 1);
    if (pc.sep_min != null) expect(pc.sep_min).not.toBe(1e9);
  });

  test('rescoring applies only if no jump changed meanwhile, and logs what changed', async () => {
    const rows = await db.as<JumpRow>(SERVICE, `select * from public.jumps where event_id = $1`, [E]);
    const scores = rows.map((r) => ({ event_id: E, pilot_id: r.pilot_id, task: r.task, round: r.round, expected_updated_at: r.updated_at,
      ok: r.ok, time: r.time, distance: r.distance, speed: r.pilot_id === 'pcar03' ? r.speed + 1 : r.speed, exit_agl: r.exit_agl, t_exit: r.t_exit, t_val: r.t_val,
      t_top: r.t_top, t_bot: r.t_bot, t_deploy: r.t_deploy, hz: r.hz, sep_max: r.sep_max, flags: r.flags, lane_dev: r.lane_dev,
      lane_outside: r.lane_outside, lane_pen: r.lane_pen, sep_min: r.sep_min, sep_with: r.sep_with, sep_violation: r.sep_violation }));
    const stale = scores.map((x, i) => (i === 0 ? { ...x, expected_updated_at: '2000-01-01T00:00:00Z' } : x));
    await expect(call('apply_scores', `$1, $2::jsonb, $3::uuid, 'Admin', 'x'`, [E, JSON.stringify(stale), admin])).rejects.toThrow(/mientras se recalculaba/);
    await expect(call('apply_scores', `$1, $2::jsonb, $3::uuid, 'Admin', 'x'`, [E, JSON.stringify(scores.slice(1)), admin])).rejects.toThrow(/mientras se recalculaba/);
    expect(await call('apply_scores', `$1, $2::jsonb, $3::uuid, 'Admin', 'Se recalcularon N saltos'`, [E, JSON.stringify(scores), admin])).toBe(rows.length);
    const [l] = await db.as<{ text: string; data: { changed: { key: string }[] } }>(SERVICE, `select * from public.audit_log order by id desc limit 1`);
    expect(l.text).toBe('Se recalcularon N saltos');
    expect(l.data.changed.map((c) => c.key).sort()).toEqual(rows.filter((r) => r.pilot_id === 'pcar03').map((r) => `pcar03-${r.task}-${r.round}`).sort());
  });

  test('changing scoring settings on an event with jumps requires the rescored jumps, and saves both', async () => {
    const [ev] = await db.as<EventRow>(SERVICE, `select * from public.events where id = $1`, [E]);
    const next = { id: E, cfg: { ...ev.cfg, elev: 5 } };
    await expect(call('save_event', '$1::jsonb, $2::uuid, $3', [JSON.stringify(next), admin, 'Admin'])).rejects.toThrow(/hay que recalcular/);
    const rows = await db.as<JumpRow>(SERVICE, `select * from public.jumps where event_id = $1`, [E]);
    const scores = rows.map((r) => ({ ...r, expected_updated_at: r.updated_at, time: r.time + 0.5 }));
    await call('save_event', '$1::jsonb, $2::uuid, $3, $4::jsonb', [JSON.stringify(next), admin, 'Admin', JSON.stringify(scores)]);
    expect((await db.as<EventRow>(SERVICE, `select cfg from public.events where id = $1`, [E]))[0].cfg).toMatchObject({ elev: 5 });
    expect((await jump('pbru02', 'time', 2)).time).toBe(rows.find((r) => r.pilot_id === 'pbru02' && r.task === 'time' && r.round === 2)!.time + 0.5);
    expect((await logs(2)).map((l) => l.text)).toEqual(['Se cambiaron los ajustes de la jornada (cfg)', `Se recalcularon ${rows.length} saltos con los ajustes nuevos`]);
  });

  test('upload and rescoring functions cannot be called from the browser', async () => {
    for (const who of [ANON, { role: 'authenticated', uid: admin } as const]) {
      await expect(db.run(who, `select public.save_jump('{}'::jsonb, '{}'::jsonb, null, null, null, 'x')`)).rejects.toThrow(/permission denied/);
      await expect(db.run(who, `select public.apply_scores('x', '[]'::jsonb, null, 'x', 'x')`)).rejects.toThrow(/permission denied/);
    }
  });
});

describe('judge review (decisions, signatures, delete, task validation)', () => {
  const E = 'eabc123', K = [E, 'pdan04', 'distance', 2] as const;
  const call = async (fn: string, args: string, params: unknown[]) => db.as(SERVICE, `select public.${fn}(${args}) as r`, params);
  const jump = async () => (await db.as<JumpRow>(SERVICE, `select * from public.jumps where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [...K]))[0];
  const reviewCount = async () => (await db.as(SERVICE, `select 1 from public.reviews where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [...K])).length;
  const lastLog = async () => (await db.as<{ text: string; who: string; data: Record<string, unknown> }>(SERVICE, `select * from public.audit_log order by id desc limit 1`))[0];

  test('signatures use the logged-in user: one per judge, none on a void jump', async () => {
    await db.run(SERVICE, `delete from public.reviews where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [...K]);
    await db.run(SERVICE, `update public.jumps set void = null where event_id = $1 and pilot_id = $2 and task = $3 and round = $4`, [...K]);
    await db.run(SERVICE, `update public.events set validated = validated || '{"distance|2": {"by": "x", "at": 1}}' where id = $1`, [E]);
    await call('sign_review', `$1, $2, $3, $4, 'Juez Uno', 'Revisión firmada por Juez Uno', $5::uuid`, [...K, judge]);
    await expect(call('sign_review', `$1, $2, $3, $4, 'Juez Uno', 'x', $5::uuid`, [...K, judge])).rejects.toThrow(/Ya firmaste/);
    await call('sign_review', `$1, $2, $3, $4, 'Admin', 'Revisión firmada por Admin', $5::uuid`, [...K, admin]);
    expect(await reviewCount()).toBe(2);
    const [rv] = await db.as<{ reviewer: string }>(SERVICE, `select reviewer from public.reviews where event_id = $1 and pilot_id = $2 and task = $3 and round = $4 order by id limit 1`, [...K]);
    expect(rv.reviewer).toBe(judge);
    expect((await db.as<EventRow>(SERVICE, `select validated from public.events where id = $1`, [E]))[0].validated).not.toHaveProperty('distance|2');
  });

  test('a decision changes only allowed columns, clears signatures when asked and logs before/after', async () => {
    const before = await jump();
    await call('update_jump', `$1, $2, $3, $4, $5::jsonb, true, 'Decisión sobre X: carril: 20 %', $6::uuid, 'Juez Uno'`,
      [...K, JSON.stringify({ lane_decision: 20, distance: 1, notes: 'ok' }), judge]);
    const after = await jump();
    expect(after).toMatchObject({ lane_decision: 20, notes: 'ok', distance: before.distance });
    expect(await reviewCount()).toBe(0);
    const [dec] = await db.as(SERVICE, `select * from public.audit_log where text like 'Decisión%' order by id desc limit 1`);
    expect(dec).toMatchObject({ text: 'Decisión sobre X: carril: 20 %', who: 'Juez Uno', data: { after: { lane_decision: 20, notes: 'ok' } } });
    expect(((dec as { data: { reviewsRemoved: { reviewer_name: string }[] } }).data.reviewsRemoved).map((x) => x.reviewer_name)).toEqual(['Juez Uno', 'Admin']);
    await call('sign_review', `$1, $2, $3, $4, 'Juez Uno', 'x', $5::uuid`, [...K, judge]);
    await call('update_jump', `$1, $2, $3, $4, '{"void": true, "flag_decision": "rejump"}'::jsonb, false, 'x', $5::uuid, 'Juez Uno'`, [...K, judge]);
    expect(await reviewCount()).toBe(1);
    await expect(call('sign_review', `$1, $2, $3, $4, 'Admin', 'x', $5::uuid`, [...K, admin])).rejects.toThrow(/anulado/);
  });

  test('task validation sets and removes the slot with who validated it', async () => {
    await call('set_task_validation', `$1, 'speed|1', true, 'Se validó la tarea Velocidad R1', $2::uuid, 'Juez Uno'`, [E, judge]);
    expect((await db.as<EventRow>(SERVICE, `select validated from public.events where id = $1`, [E]))[0].validated).toMatchObject({ 'speed|1': { by: 'Juez Uno' } });
    await call('set_task_validation', `$1, 'speed|1', false, 'Se reabrió la tarea Velocidad R1', $2::uuid, 'Juez Uno'`, [E, judge]);
    expect((await db.as<EventRow>(SERVICE, `select validated from public.events where id = $1`, [E]))[0].validated).not.toHaveProperty('speed|1');
    expect((await lastLog()).text).toBe('Se reabrió la tarea Velocidad R1');
  });

  test('deleting a jump archives it with the judge as actor', async () => {
    await call('delete_jump', `$1, $2, $3, $4, 'Se borró el salto de X; quedó archivado', $5::uuid, 'Juez Uno'`, [...K, judge]);
    expect(await jump()).toBeUndefined();
    const [a] = await db.as<{ kind: string; key: string; deleted: boolean; archived_by: string; reason: string }>(SERVICE, `select * from public.archive order by id desc limit 1`);
    expect(a).toMatchObject({ kind: 'jump', key: 'pdan04-distance-2', deleted: true, archived_by: judge, reason: 'Borrado por un juez' });
    await expect(call('delete_jump', `$1, $2, $3, $4, 'x', $5::uuid, 'x'`, [...K, judge])).rejects.toThrow(/no existe/);
  });

  test('review functions cannot be called from the browser', async () => {
    for (const who of [ANON, { role: 'authenticated', uid: judge } as const]) {
      await expect(db.run(who, `select public.sign_review('e', 'p', 'time', 1, 'x', 'x', null)`)).rejects.toThrow(/permission denied/);
      await expect(db.run(who, `select public.update_jump('e', 'p', 'time', 1, '{}'::jsonb, false, 'x', null, 'x')`)).rejects.toThrow(/permission denied/);
      await expect(db.run(who, `select public.delete_jump('e', 'p', 'time', 1, 'x', null, 'x')`)).rejects.toThrow(/permission denied/);
      await expect(db.run(who, `select public.set_task_validation('e', 'time|1', true, 'x', null, 'x')`)).rejects.toThrow(/permission denied/);
    }
  });
});
