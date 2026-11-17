// Verbatim copies of the upload, separation and rescoring logic in legacy/src/app.js (which is not a
// module), with the store calls replaced by in-memory data. Reference for tests/jumps.test.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { legacy as W } from './legacy';

// jumpDoc (legacy/src/app.js), verbatim.
export function jumpDoc(sc: any, meta: any) {
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

const KEEP = ['fileHash', 'fileSize', 'uploadedBy', 'originalSaved', 'laneDecision', 'laneShift', 'sepApply', 'exitPen', 'flagDecision', 'void', 'reviews', 'notes', 'penManual'];
const jumpId = (j: any) => j.pilotId + '-' + j.task + '-' + j.round;
function evCfg(ev: any) { const c: any = {}; for (const k in W.DEFAULT_CFG) c[k] = W.DEFAULT_CFG[k]; for (const j in (ev.cfg || {})) c[j] = ev.cfg[j]; return c; }

/** checkSeparation: returns the stored jumps after the new one `j` is saved. `store` maps jid → doc. */
export function checkSeparation(ev: any, j: any, store: Map<string, any>, getTrack: (jid: string) => any) {
  const cfg = evCfg(ev), jid = jumpId(j);
  const others = [...store.values()].filter((o) => o.task === j.task && o.round === j.round && o.pilotId !== j.pilotId && o.ok);
  const mine = getTrack(jid); if (!mine) return;
  let best: any = null;
  for (let i = 0; i < others.length; i++) {
    const o = others[i], tr = getTrack(jumpId(o)); if (!tr) continue;
    const m = W.minSeparation(mine, j, tr, o); if (!m) continue;
    if (!best || m.d3 < best.d3) best = { d3: m.d3, withId: o.pilotId };
    if (o.sepMin == null || m.d3 < o.sepMin) {
      const upd = Object.assign({}, o, { sepMin: m.d3, sepWith: j.pilotId, sepViolation: m.d3 < cfg.separation });
      store.set(jumpId(o), upd);
    }
  }
  const mineDoc = Object.assign({}, j, best ? { sepMin: best.d3, sepWith: best.withId, sepViolation: best.d3 < cfg.separation } : { sepMin: null, sepWith: null, sepViolation: false });
  store.set(jid, mineDoc);
}

/** recalcEvent, synchronous. */
export function recalcEvent(ev: any, jumps: any[], getTrack: (jid: string) => any) {
  const cfg = evCfg(ev);
  let done = 0;
  for (let i = 0; i < jumps.length; i++) {
    const o = jumps[i], jid = jumpId(o), tr = getTrack(jid);
    if (!tr) continue;
    const ref = ev.lane && ev.refs && o.refIdx != null ? ev.refs[o.refIdx] : null;
    const sc = W.scoreJump(tr, Object.assign({}, cfg, { valDelay: 9 + (+o.laneShift || 0) }), ref);
    const nj: any = jumpDoc(sc, { pilotId: o.pilotId, task: o.task, round: o.round, refIdx: o.refIdx, penManual: o.penManual, device: o.device, fileName: o.fileName, uploadedAt: o.uploadedAt });
    KEEP.forEach((k) => { if (o[k] !== undefined) nj[k] = o[k]; });
    if (!sc.ok) nj.flags = [{ code: 'error', level: 'warn', text: sc.error }];
    jumps[i] = nj; done++;
  }
  const slots: Record<string, any[]> = {};
  jumps.forEach((j) => { if (j.ok) (slots[j.task + '|' + j.round] = slots[j.task + '|' + j.round] || []).push(j); });
  if (ev.sepCheck) {
    for (const key in slots) {
      const g = slots[key];
      for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
        const ta = getTrack(jumpId(g[a])), tb = getTrack(jumpId(g[b]));
        if (!ta || !tb) continue;
        const m = W.minSeparation(ta, g[a], tb, g[b]); if (!m) continue;
        [[g[a], g[b]], [g[b], g[a]]].forEach((p) => {
          if (p[0].sepMin == null || m.d3 < p[0].sepMin) { p[0].sepMin = m.d3; p[0].sepWith = p[1].pilotId; p[0].sepViolation = m.d3 < cfg.separation; }
        });
      }
    }
  }
  return done;
}
