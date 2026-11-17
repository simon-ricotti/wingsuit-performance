// Scoring a jump for an event, shared by the browser preview and the server (which recomputes and is
// the official score). Ports jumpDoc, checkSeparation and recalcEvent from legacy/src/app.js with the
// same results; tests/jumps.test.ts compares both output by output.
import {
  DEFAULT_CFG, minSeparation, scoreJump,
  type JumpRecord, type RefPoint, type ScoreConfig, type ScoreResult, type TrackPoint,
} from '../engine';
import type { EventRow, JumpRow } from '../data/rows';

export const TASK_LABEL = { time: 'Tiempo', distance: 'Distancia', speed: 'Velocidad' } as const;
export const TASK_UNIT = { time: 's', distance: 'm', speed: 'km/h' } as const;
export const roundLabel = (r: number) => (+r === 0 ? 'Desempate' : 'R' + r);
export const roundName = (r: number) => (+r === 0 ? 'Salto de desempate' : 'Ronda ' + r);

type EventLike = Pick<EventRow, 'cfg' | 'lane' | 'refs' | 'sep_check'>;

/** Event scoring config: FAI defaults overridden by the event (evCfg in the previous platform). */
export function eventConfig(ev: Pick<EventRow, 'cfg'>): ScoreConfig {
  return { ...DEFAULT_CFG, ...(ev.cfg as Partial<ScoreConfig>) };
}

const refsOf = (ev: EventLike) => (ev.refs ?? []) as RefPoint[];

/** Reference point for a new upload: the chosen one (first by default) when the lane is evaluated. */
export function uploadRef(ev: EventLike, refIdx: number | null | undefined): { ref: RefPoint | null; refIdx: number | null } {
  const refs = refsOf(ev);
  if (!ev.lane || !refs.length) return { ref: null, refIdx: null };
  const i = refIdx ?? 0;
  return { ref: refs[i] ?? null, refIdx: i };
}

export interface JumpMeta {
  pilotId: string; task: string; round: number; refIdx?: number | null; penManual?: number | string | null;
  device?: string; fileName?: string; uploadedAt?: number; fileHash?: string | null; fileSize?: number | null; uploadedBy?: string | null;
}

/** Score → stored jump fields (jumpDoc in the previous platform, verbatim). */
export function jumpDoc(sc: ScoreResult, meta: JumpMeta): JumpRecord {
  return {
    pilotId: meta.pilotId, task: meta.task, round: +meta.round, ok: !!sc.ok,
    time: sc.ok ? +sc.time!.toFixed(4) : 0, distance: sc.ok ? +sc.distance!.toFixed(3) : 0, speed: sc.ok ? +sc.speed!.toFixed(4) : 0,
    exitAgl: Math.round(sc.exitAgl as number), tExit: sc.tExit, tVal: sc.tVal, tTop: sc.tTop, tBot: sc.tBot, tDeploy: sc.tDeploy,
    hz: sc.hz, sepMax: sc.sepMax, flags: sc.flags || [],
    refIdx: meta.refIdx == null ? null : meta.refIdx,
    laneDev: sc.lane ? sc.lane.dev : null, laneOutside: sc.lane ? sc.lane.outside : null, lanePen: sc.lane ? sc.lane.penalty : 0,
    sepMin: null, sepWith: null, sepViolation: false,
    penManual: meta.penManual == null ? null : meta.penManual,
    device: meta.device || '', fileName: meta.fileName || '', uploadedAt: meta.uploadedAt || Date.now(),
    fileHash: meta.fileHash || null, fileSize: meta.fileSize || null, uploadedBy: meta.uploadedBy || null,
  } as JumpRecord;
}

/** Fields that survive a recalculation (KEEP in the previous platform). */
export const KEEP = ['fileHash', 'fileSize', 'uploadedBy', 'originalSaved', 'laneDecision', 'laneShift', 'sepApply', 'exitPen',
  'flagDecision', 'void', 'reviews', 'notes', 'penManual'] as const;

export interface SeparationUpdate { pilotId: string; task: string; round: number; sepMin: number; sepWith: string; sepViolation: boolean }

/**
 * Separation (5.6.3) when a jump is uploaded: compares it with the other valid jumps of the same task
 * and round. Returns the new jump's fields and the other jumps that get closer (checkSeparation).
 */
export function separationOnUpload(
  ev: Pick<EventRow, 'cfg'>, mine: JumpRecord, myTrack: readonly TrackPoint[],
  others: { jump: JumpRecord; track: readonly TrackPoint[] | null }[],
): { mine: Pick<JumpRecord, 'sepMin' | 'sepWith' | 'sepViolation'>; updates: SeparationUpdate[] } {
  const cfg = eventConfig(ev);
  let best: { d3: number; withId: string } | null = null;
  const updates: SeparationUpdate[] = [];
  for (const { jump: o, track } of others) {
    if (o.task !== mine.task || +o.round !== +mine.round || o.pilotId === mine.pilotId || !o.ok || !track) continue;
    const m = minSeparation(myTrack, mine as unknown as ScoreResult, track, o as unknown as ScoreResult);
    if (!m) continue;
    if (!best || m.d3 < best.d3) best = { d3: m.d3, withId: o.pilotId };
    if (o.sepMin == null || m.d3 < (o.sepMin as number)) {
      updates.push({ pilotId: o.pilotId, task: o.task, round: +o.round, sepMin: m.d3, sepWith: mine.pilotId, sepViolation: m.d3 < cfg.separation });
    }
  }
  return {
    mine: best ? { sepMin: best.d3, sepWith: best.withId, sepViolation: best.d3 < cfg.separation } : { sepMin: null, sepWith: null, sepViolation: false },
    updates,
  };
}

/**
 * Rescores every jump from its stored track with the event's settings (recalcEvent): judge decisions
 * and file data are kept; separation is recomputed per task and round. Jumps without a track stay as they are.
 */
export function recalcJumps(ev: EventLike, jumps: JumpRecord[], trackOf: (j: JumpRecord) => readonly TrackPoint[] | null): { jumps: JumpRecord[]; done: number } {
  const cfg = eventConfig(ev), refs = refsOf(ev);
  let done = 0;
  const out = jumps.map((o) => {
    const tr = trackOf(o);
    if (!tr) return o;
    const ref = ev.lane && o.refIdx != null ? refs[o.refIdx as number] : null;
    const sc = scoreJump(tr, { ...cfg, valDelay: 9 + (+(o.laneShift as number) || 0) }, ref);
    const nj = jumpDoc(sc, {
      pilotId: o.pilotId, task: o.task, round: +o.round, refIdx: o.refIdx as number | null, penManual: o.penManual as number | null,
      device: o.device as string, fileName: o.fileName as string, uploadedAt: o.uploadedAt as number,
    }) as Record<string, unknown>;
    for (const k of KEEP) if (o[k] !== undefined) nj[k] = o[k];
    if (!sc.ok) nj.flags = [{ code: 'error', level: 'warn', text: sc.error }];
    done++;
    return nj as JumpRecord;
  });
  if (ev.sep_check) {
    const slots: Record<string, JumpRecord[]> = {};
    for (const j of out) if (j.ok) (slots[j.task + '|' + j.round] ??= []).push(j);
    for (const g of Object.values(slots)) {
      for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
        const ta = trackOf(g[a]), tb = trackOf(g[b]);
        if (!ta || !tb) continue;
        const m = minSeparation(ta, g[a] as unknown as ScoreResult, tb, g[b] as unknown as ScoreResult);
        if (!m) continue;
        for (const [x, y] of [[g[a], g[b]], [g[b], g[a]]]) {
          if (x.sepMin == null || m.d3 < (x.sepMin as number)) { x.sepMin = m.d3; x.sepWith = y.pilotId; x.sepViolation = m.d3 < cfg.separation; }
        }
      }
    }
  }
  return { jumps: out, done };
}

/** Columns a recalculation replaces (everything the engine computes; decisions and file data stay). */
export const SCORE_COLUMNS = ['ok', 'time', 'distance', 'speed', 'exit_agl', 't_exit', 't_val', 't_top', 't_bot', 't_deploy', 'hz',
  'sep_max', 'flags', 'lane_dev', 'lane_outside', 'lane_pen', 'sep_min', 'sep_with', 'sep_violation'] as const;

const n = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** Engine-computed fields of a jump as row columns. */
export function scoreColumns(j: JumpRecord): Pick<JumpRow, (typeof SCORE_COLUMNS)[number]> {
  return {
    ok: !!j.ok, time: n(j.time) ?? 0, distance: n(j.distance) ?? 0, speed: n(j.speed) ?? 0,
    exit_agl: n(j.exitAgl), t_exit: n(j.tExit), t_val: n(j.tVal), t_top: n(j.tTop), t_bot: n(j.tBot), t_deploy: n(j.tDeploy),
    hz: n(j.hz), sep_max: n(j.sepMax), flags: Array.isArray(j.flags) ? j.flags : [],
    lane_dev: n(j.laneDev), lane_outside: n(j.laneOutside), lane_pen: n(j.lanePen) ?? 0,
    sep_min: n(j.sepMin), sep_with: j.sepWith == null ? null : String(j.sepWith), sep_violation: !!j.sepViolation,
  };
}
