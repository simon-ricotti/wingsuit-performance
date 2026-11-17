// Builds a full backup as the previous platform would export it (legacy/src/app.js: jumpDoc, doUpload,
// exportBackup), with the legacy engine and real Skyderby tracks, plus every kind of judge decision.
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { LegacyBackup } from '../../lib/import/backup';
import { legacy } from './legacy';
import { loadFixture, type FixtureName } from './fixtures';

// Verbatim copy of jumpDoc (legacy/src/app.js).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jumpDoc(sc: any, meta: any) {
  return {
    pilotId: meta.pilotId, task: meta.task, round: +meta.round, ok: !!sc.ok,
    time: sc.ok ? +sc.time.toFixed(4) : 0, distance: sc.ok ? +sc.distance.toFixed(3) : 0, speed: sc.ok ? +sc.speed.toFixed(4) : 0,
    exitAgl: Math.round(sc.exitAgl), tExit: sc.tExit, tVal: sc.tVal, tTop: sc.tTop, tBot: sc.tBot, tDeploy: sc.tDeploy,
    hz: sc.hz, sepMax: sc.sepMax, flags: sc.flags || [],
    refIdx: meta.refIdx == null ? null : meta.refIdx,
    laneDev: sc.lane ? sc.lane.dev : null, laneOutside: sc.lane ? sc.lane.outside : null, lanePen: sc.lane ? sc.lane.penalty : 0,
    sepMin: null, sepWith: null, sepViolation: false,
    penManual: meta.penManual == null ? null : meta.penManual,
    device: meta.device || '', fileName: meta.fileName || '', uploadedAt: meta.uploadedAt || Date.now(),
    fileHash: meta.fileHash || null, fileSize: meta.fileSize || null, uploadedBy: meta.uploadedBy || null,
  };
}

const PILOTS: [string, string, FixtureName, string, string][] = [
  ['pana01', 'Ana Gómez', 'fs2-track.csv', 'F', 'Rosario'],
  ['pbru02', 'Bruno Díaz', 'cyber_eye.csv', '', 'Rosario'],
  ['pcar03', 'Carla Ruiz', 'distance_3107.csv', 'F', 'Córdoba'],
  ['pdan04', 'Daniel Paz', 'flysight2_2762_noisy_climb.csv', '', 'Córdoba'],
  ['peva05', 'Eva Sosa', 'flysight.csv', 'F', ''],
];

/**
 * Competition event with 3 rounds × 3 tasks, a lane (two reference points), a tiebreak,
 * and judge decisions: manual lane decision, manual penalty, separation, exit, void,
 * GPS validation, reviews, notes and validated tasks. Altitudes are shifted to a common ground (elev 0).
 */
export async function buildLegacyBackup(): Promise<LegacyBackup> {
  const t0 = Date.UTC(2026, 9, 18, 13, 0, 0);
  const pilots = PILOTS.map(([id, name, , gender, team], i) => ({ id, name, suit: 'Traje ' + (i + 1), gender, team, createdAt: t0 - 86400000 * (i + 1) }));
  const jumps: Record<string, unknown>[] = [];
  const tracks: Record<string, unknown> = {};
  const originals: Record<string, unknown> = {};
  const log: Record<string, unknown>[] = [];
  let refs: { name: string; lat: number; lon: number }[] = [];
  let k = 0;

  for (const [pid, name, fixture] of PILOTS) {
    const text = await loadFixture(fixture);
    const bytes = Buffer.from(text, 'utf8');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const tr = legacy.parseTrack(text, fixture);
    let ground = Infinity;
    for (const p of tr.pts) if (p.alt < ground) ground = p.alt;
    for (const p of tr.pts) p.alt -= ground;
    const base = legacy.scoreJump(tr.pts, { elev: 0 });
    if (!base.ok) throw new Error(fixture + ': ' + base.error);
    if (!refs.length) {
      // Two reference points on either side of the first pilot's line.
      refs = [{ name: 'Norte', lat: base.pBot.lat + 0.004, lon: base.pBot.lon }, { name: 'Sur', lat: base.pBot.lat - 0.004, lon: base.pBot.lon }];
    }
    for (const task of ['time', 'distance', 'speed']) {
      for (let round = 0; round <= 3; round++) {
        if (round === 0 && (task !== 'speed' || !['pana01', 'pcar03'].includes(pid))) continue; // speed tiebreak
        k++;
        // Each jump gets its "own" reference point: the pilot's window end shifted per round.
        const ref = { lat: base.pBot.lat + (round - 1.5) * 0.0025 * (k % 3 - 1), lon: base.pBot.lon + 0.0015 * (k % 2) };
        const refIdx = k % 2;
        const sc = legacy.scoreJump(tr.pts, { elev: 0 }, ref);
        const j: Record<string, unknown> = jumpDoc(sc, {
          pilotId: pid, task, round, refIdx, device: tr.device, fileName: fixture, fileHash: hash, fileSize: bytes.byteLength,
          uploadedBy: 'Juez Uno', uploadedAt: t0 + k * 60000,
        });
        // Different times per pass (the 2nd-time >300 m penalty depends on exit order).
        for (const f of ['tExit', 'tVal', 'tTop', 'tBot', 'tDeploy']) if (typeof j[f] === 'number') (j[f] as number) += round * 7200 + ['time', 'distance', 'speed'].indexOf(task) * 2400;
        const jid = `${pid}-${task}-${round}`;
        j.id = jid;
        // Judge decisions, spread around
        if (k % 7 === 0) j.laneDecision = 20;
        if (k % 11 === 0) j.laneDecision = null;
        if (k % 13 === 0) j.penManual = 30;
        if (k % 5 === 0) { j.sepViolation = true; j.sepMin = 120; j.sepWith = 'pbru02'; }
        if (k % 10 === 0) j.sepApply = false;
        if (k % 9 === 0) j.exitPen = 50;
        if (k % 17 === 0) j.void = true;
        if (k % 4 === 0) j.flagDecision = 'accept';
        if (k % 6 === 0) j.laneShift = 1.5;
        if (k % 8 === 0) j.notes = 'Revisado con el video de la puerta';
        if (k % 3 === 0) j.reviews = [{ name: 'Juez Uno', uid: 'u-claude-1', at: t0 + k * 60000 + 30000 }];
        if (k % 12 === 0) (j.reviews as unknown[] ?? (j.reviews = [])).push({ name: 'Juez Dos', uid: 'u-claude-2', at: t0 + k * 60000 + 45000 });
        if (k % 15 === 0) j.campoNuevo = { something: 'the new platform does not know' };
        const packed = legacy.packTrack(legacy.trimTrack(tr.pts, sc));
        tracks[jid] = JSON.parse(JSON.stringify(packed));
        if (k % 2 === 1) {
          j.originalSaved = true;
          originals[jid] = { name: fixture, size: bytes.byteLength, sha256: hash, enc: 'gzip', data: gzipSync(bytes).toString('base64'), at: t0 + k * 60000 };
        } else if (k % 4 === 0) {
          j.originalSaved = false;
          originals[jid] = null;
        }
        jumps.push(JSON.parse(JSON.stringify(j))); // like Store.set: undefined values disappear
        log.push({ id: `${t0 + k}-x`, at: t0 + k * 60000, who: 'Juez Uno', uid: 'u-claude-1', text: `Se cargó el salto de ${name}`, jid });
      }
    }
  }

  const event = {
    id: 'eabc123', name: 'Copa AVA, fecha 3', date: '2026-10-18', dz: 'AVA, Alvear', mode: 'comp', rounds: 3, teamSize: 2,
    lane: true, sepCheck: true, refs, units: 'ft',
    judging: { profile: 'arg', reviews: 1, door: 'device', gpsRule: 'warn', exitRule: 'warn' },
    cfg: { elev: 0, top: 2500, bottom: 1500, exitMin: 3200, exitMax: 3353 },
    createdAt: t0 - 3600000,
    validated: { 'time|1': { by: 'Juez Uno', at: t0 + 999 } },
    tiebreak: { task: 'speed', at: t0 + 5000, by: 'Juez Uno', pilots: ['pana01', 'pcar03'] },
    taskOrder: ['time', 'distance', 'speed'],
    order: { 1: { ids: ['pana01', 'pbru02', 'pcar03', 'pdan04', 'peva05'], how: 'sorteo', at: t0, by: 'Juez Uno' } },
    passSize: 3, roster: ['pana01', 'pbru02', 'pcar03', 'pdan04', 'peva05'], teamPick: { Rosario: ['pana01', 'pbru02'] },
  };

  return {
    format: 'wingsuit-performance-backup', version: 1, exportedAt: new Date(t0 + 86400000).toISOString(), exportedBy: 'Juez Uno',
    event: JSON.parse(JSON.stringify(event)), pilots, jumps, tracks, originals, log,
  } as unknown as LegacyBackup;
}
