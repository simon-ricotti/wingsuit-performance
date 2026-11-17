// Jump upload, separation (5.6.3) and rescoring: same results as the previous platform
// (legacy/src/app.js: jumpDoc, checkSeparation, recalcEvent), output by output.
import { beforeAll, describe, expect, test } from 'vitest';
import * as W from '../lib/engine';
import type { JumpRecord, TrackPoint } from '../lib/engine';
import { eventConfig, jumpDoc, recalcJumps, separationOnUpload, uploadRef } from '../lib/jumps/score';
import { legacy } from './support/legacy';
import * as L from './support/legacy-app';
import { loadFixture } from './support/fixtures';

let base: TrackPoint[];
beforeAll(async () => {
  const pts = W.parseTrack(await loadFixture('flysight.csv')).pts;
  const ground = pts.reduce((m, p) => Math.min(m, p.alt), Infinity);
  base = pts.map((p) => ({ ...p, alt: p.alt - ground }));
});

// Pilots flying the same line with small offsets: some pass closer than 150 m, some do not.
const OFFSETS: [string, number, number, number, number][] = [
  ['pa', 0, 0, 0, 0], ['pb', 0.0006, 0, 20, 0.3], ['pc', 0.004, 0.003, 0, 1], ['pd', -0.0009, 0.0004, -15, 0.6], ['pe', 0.03, 0.03, 0, 0],
];
const trackFor = (i: number, round: number): TrackPoint[] => {
  const [, dLat, dLon, dAlt, dt] = OFFSETS[i];
  return base.map((p) => ({ ...p, lat: p.lat + dLat * round, lon: p.lon + dLon, alt: p.alt + dAlt, t: p.t + dt + round * 7200 }));
};

const EVENT = {
  cfg: { elev: 0, top: 2500, bottom: 1500, exitMin: 3200, exitMax: 3353 }, lane: true, sep_check: true,
  refs: [] as { name: string; lat: number; lon: number }[],
};

describe('upload and separation', () => {
  test('uploading a round jump by jump gives the same stored jumps as the previous platform', () => {
    const sc0 = W.scoreJump(base, EVENT.cfg);
    const ev = { ...EVENT, refs: [{ name: 'Norte', lat: sc0.pBot!.lat + 0.003, lon: sc0.pBot!.lon }, { name: 'Sur', lat: sc0.pBot!.lat - 0.003, lon: sc0.pBot!.lon }] };
    const legacyEv = { cfg: ev.cfg, lane: ev.lane, sepCheck: ev.sep_check, refs: ev.refs };
    const ours = new Map<string, JumpRecord>(), theirs = new Map<string, unknown>();
    const oursTracks = new Map<string, TrackPoint[]>(), theirsTracks = new Map<string, unknown>();
    let n = 0;
    for (const round of [1, 2]) {
      for (const task of ['time', 'speed']) {
        OFFSETS.forEach(([pid], i) => {
          const pts = trackFor(i, round), refIdx = n++ % 2, meta = { pilotId: pid, task, round, device: 'FlySight', fileName: 'TRACK.CSV', uploadedAt: 1, fileHash: 'h', fileSize: 1, uploadedBy: 'Juez' };
          // Ours (lib/jumps/score, as the server does)
          const { ref, refIdx: ri } = uploadRef(ev, refIdx);
          const sc = W.scoreJump(pts, eventConfig(ev), ref);
          const doc = jumpDoc(sc, { ...meta, refIdx: ri });
          const mine = W.unpackTrack(W.packTrack(W.trimTrack(pts, sc)));
          const sep = separationOnUpload(ev, doc, mine, [...ours.values()].map((j) => ({ jump: j, track: oursTracks.get(`${j.pilotId}-${j.task}-${j.round}`) ?? null })));
          for (const u of sep.updates) {
            const k = `${u.pilotId}-${u.task}-${u.round}`;
            ours.set(k, { ...ours.get(k)!, sepMin: u.sepMin, sepWith: u.sepWith, sepViolation: u.sepViolation });
          }
          const jid = `${pid}-${task}-${round}`;
          ours.set(jid, { ...doc, ...sep.mine });
          oursTracks.set(jid, mine);
          // Theirs (doUpload + checkSeparation)
          const lsc = legacy.scoreJump(pts, { ...legacy.DEFAULT_CFG, ...ev.cfg }, ev.refs[refIdx]);
          const lj = L.jumpDoc(lsc, { ...meta, refIdx });
          theirsTracks.set(jid, legacy.unpackTrack(legacy.packTrack(legacy.trimTrack(pts, lsc))));
          theirs.set(jid, lj);
          L.checkSeparation(legacyEv, lj, theirs, (k) => theirsTracks.get(k));
        });
      }
    }
    expect(Object.fromEntries(ours)).toStrictEqual(Object.fromEntries(theirs as Map<string, JumpRecord>));
    // The scenario really exercises separation: violations and jumps far apart.
    const all = [...ours.values()];
    expect(all.some((j) => j.sepViolation)).toBe(true);
    expect(all.some((j) => j.sepMin != null && !j.sepViolation)).toBe(true);
    expect(all.some((j) => (j.lanePen as number) > 0)).toBe(true);
  });
});

describe('rescoring', () => {
  test('recalculating with new settings gives the same as the previous platform, keeping decisions', () => {
    const jumps: JumpRecord[] = [];
    const tracks = new Map<string, TrackPoint[]>();
    OFFSETS.forEach(([pid], i) => {
      for (const task of ['time', 'distance', 'speed']) {
        const pts = trackFor(i, 1), sc = W.scoreJump(pts, EVENT.cfg);
        const j = jumpDoc(sc, { pilotId: pid, task, round: 1, refIdx: i % 2, device: 'FlySight', fileName: 'f.csv', uploadedAt: 5, uploadedBy: 'Juez' });
        if (i === 1) Object.assign(j, { laneShift: 1.5, laneDecision: 20, notes: 'nota', reviews: [{ name: 'Juez', at: 1 }] });
        if (i === 2 && task === 'speed') Object.assign(j, { void: true, penManual: 30 });
        jumps.push(j);
        tracks.set(`${pid}-${task}-1`, W.unpackTrack(W.packTrack(W.trimTrack(pts, sc))));
      }
    });
    jumps.push({ pilotId: 'pz', task: 'time', round: 1, ok: true, time: 80 }); // no track: stays as it is
    const sc0 = W.scoreJump(base, EVENT.cfg);
    for (const ev of [
      { ...EVENT, cfg: { ...EVENT.cfg, elev: 40, top: 2400 }, refs: [{ name: 'A', lat: sc0.pBot!.lat + 0.004, lon: sc0.pBot!.lon }, { name: 'B', lat: sc0.pBot!.lat, lon: sc0.pBot!.lon + 0.005 }] },
      { ...EVENT, sep_check: false, lane: false },
      { ...EVENT, cfg: { elev: 3000 } }, // window above the exit: every jump fails, with the error as a flag
    ]) {
      const get = (j: JumpRecord) => tracks.get(`${j.pilotId}-${j.task}-${j.round}`) ?? null;
      const ours = recalcJumps(ev, structuredClone(jumps), get);
      const theirs = structuredClone(jumps);
      const done = L.recalcEvent({ cfg: ev.cfg, lane: ev.lane, sepCheck: ev.sep_check, refs: ev.refs }, theirs, (k: string) => tracks.get(k));
      expect(ours.done).toBe(done);
      expect(ours.jumps).toStrictEqual(theirs);
    }
  });
});
