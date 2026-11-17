// Conversion between the previous platform's documents (camelCase, as lib/engine uses them) and
// Postgres rows (snake_case). Anything without a column goes to `extra`, so a round trip loses nothing.
import type { JumpRecord } from '../engine';

// ---------- previous platform documents ----------
export interface LegacyPilot {
  id: string;
  name: string;
  suit?: string;
  gender?: string;
  team?: string;
  createdAt?: number;
  [k: string]: unknown;
}

export interface LegacyEvent {
  id: string;
  name: string;
  date?: string;
  dz?: string;
  mode?: 'libre' | 'comp';
  rounds?: number;
  teamSize?: number;
  units?: 'm' | 'ft';
  lane?: boolean;
  sepCheck?: boolean;
  refs?: { name: string; lat: number; lon: number }[];
  cfg?: Record<string, number>;
  judging?: Record<string, unknown>;
  validated?: Record<string, unknown>;
  tiebreak?: { task: string; [k: string]: unknown } | null;
  taskOrder?: unknown;
  order?: unknown;
  passSize?: number;
  roster?: unknown;
  teamPick?: unknown;
  createdAt?: number;
  [k: string]: unknown;
}

export interface LegacyReview { name?: string; uid?: string | null; at?: number }

export interface LegacyJump extends JumpRecord {
  reviews?: LegacyReview[];
}

// ---------- rows ----------
export interface PilotRow {
  id: string; name: string; suit: string; gender: 'F' | ''; team: string;
  extra: Record<string, unknown>; created_at: string; updated_at: string;
}

export interface EventRow {
  id: string; name: string; date: string | null; dz: string; mode: EventMode; rounds: number; team_size: number;
  units: 'm' | 'ft'; lane: boolean; sep_check: boolean; refs: unknown[]; cfg: Record<string, unknown>;
  judging: Record<string, unknown>; validated: Record<string, unknown>; tiebreak: unknown; task_order: unknown;
  exit_order: unknown; pass_size: number | null; roster: unknown; team_pick: unknown; published: boolean; pilot_uploads: boolean;
  extra: Record<string, unknown>; created_at: string; updated_at: string;
}

export type EventMode = 'free' | 'competition';

export interface JumpKey { event_id: string; pilot_id: string; task: string; round: number }

export interface JumpRow extends JumpKey {
  ok: boolean; time: number; distance: number; speed: number;
  exit_agl: number | null; t_exit: number | null; t_val: number | null; t_top: number | null; t_bot: number | null; t_deploy: number | null;
  hz: number | null; sep_max: number | null; flags: unknown[]; ref_idx: number | null;
  lane_dev: number | null; lane_outside: number | null; lane_pen: number;
  sep_min: number | null; sep_with: string | null; sep_violation: boolean;
  pen_manual: number | null; lane_decision: number | null; lane_shift: number | null; sep_apply: boolean | null;
  exit_pen: number | null; flag_decision: string | null; void: boolean | null; notes: string | null;
  device: string; file_name: string; file_hash: string | null; file_size: number | null; uploaded_by: string | null;
  uploaded_at: string | null; original_saved: boolean | null;
  extra: Record<string, unknown>; created_at: string; updated_at: string;
}

export interface ReviewRow extends JumpKey { reviewer_name: string; legacy_uid: string | null; at: string }

// ---------- helpers ----------
const iso = (ms: unknown, fallback: string): string => (typeof ms === 'number' && isFinite(ms) ? new Date(ms).toISOString() : fallback);
const ms = (v: string | null | undefined): number | null => (v == null ? null : Date.parse(v));
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = +(v as number);
  return isFinite(n) ? n : null;
};
const boolOrNull = (v: unknown): boolean | null => (v == null ? null : !!v);

function splitExtra<T extends object>(doc: T, known: readonly string[]): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (known.includes(k) || k.startsWith('_') || v === undefined) continue;
    extra[k] = v;
  }
  return extra;
}

export const jumpKeyString = (j: { pilotId?: string; pilot_id?: string; task: string; round: number | string }) =>
  `${j.pilotId ?? j.pilot_id}-${j.task}-${j.round}`;

// ---------- pilots ----------
const PILOT_KNOWN = ['id', 'name', 'suit', 'gender', 'team', 'createdAt'] as const;

export function pilotToRow(p: LegacyPilot, now: string): PilotRow {
  const extra = splitExtra(p, PILOT_KNOWN);
  const g = p.gender ?? '';
  if (g !== 'F' && g !== '') extra.gender = g; // the database only distinguishes F (female standings, 5.1.2)
  return {
    id: String(p.id), name: String(p.name ?? '').trim() || String(p.id), suit: String(p.suit ?? ''), gender: g === 'F' ? 'F' : '',
    team: String(p.team ?? ''), extra, created_at: iso(p.createdAt, now), updated_at: now,
  };
}

export function rowToPilot(r: PilotRow): LegacyPilot {
  return { ...r.extra, id: r.id, name: r.name, suit: r.suit, gender: r.gender, team: r.team, createdAt: Date.parse(r.created_at) };
}

// ---------- events ----------
const EVENT_KNOWN = ['id', 'name', 'date', 'dz', 'mode', 'rounds', 'teamSize', 'units', 'lane', 'sepCheck', 'refs', 'cfg',
  'judging', 'validated', 'tiebreak', 'taskOrder', 'order', 'passSize', 'roster', 'teamPick', 'createdAt', 'published'] as const;

export function eventToRow(e: LegacyEvent, now: string): EventRow {
  const date = typeof e.date === 'string' && /^\d{4}-\d\d-\d\d$/.test(e.date) ? e.date : null;
  const extra = splitExtra(e, EVENT_KNOWN);
  if (e.date && !date) extra.date = e.date;
  return {
    id: String(e.id), name: String(e.name ?? '').trim() || String(e.id), date, dz: String(e.dz ?? ''),
    mode: e.mode === 'comp' ? 'competition' : 'free',
    rounds: Math.max(1, Math.min(12, Math.round(+(e.rounds ?? 3)) || 3)),
    team_size: Math.max(1, Math.min(10, Math.round(+(e.teamSize ?? 3)) || 3)),
    units: e.units === 'ft' ? 'ft' : 'm', lane: !!e.lane, sep_check: !!e.sepCheck,
    refs: Array.isArray(e.refs) ? e.refs : [], cfg: e.cfg ?? {}, judging: e.judging ?? { profile: 'arg' },
    validated: e.validated ?? {}, tiebreak: e.tiebreak ?? null, task_order: e.taskOrder ?? null, exit_order: e.order ?? null,
    pass_size: numOrNull(e.passSize), roster: e.roster ?? null, team_pick: e.teamPick ?? null,
    published: false, pilot_uploads: false, extra, created_at: iso(e.createdAt, now), updated_at: now,
  };
}

export function rowToEvent(r: EventRow): LegacyEvent {
  const e: LegacyEvent = {
    ...r.extra, id: r.id, name: r.name, date: r.date ?? (r.extra.date as string | undefined) ?? '', dz: r.dz, mode: r.mode === 'competition' ? 'comp' : 'libre',
    rounds: r.rounds, teamSize: r.team_size, units: r.units, lane: r.lane, sepCheck: r.sep_check,
    refs: r.refs as LegacyEvent['refs'], cfg: r.cfg as Record<string, number>, judging: r.judging, validated: r.validated,
    createdAt: Date.parse(r.created_at), published: r.published,
  };
  if (r.tiebreak != null) e.tiebreak = r.tiebreak as LegacyEvent['tiebreak'];
  if (r.task_order != null) e.taskOrder = r.task_order;
  if (r.exit_order != null) e.order = r.exit_order;
  if (r.pass_size != null) e.passSize = r.pass_size;
  if (r.roster != null) e.roster = r.roster;
  if (r.team_pick != null) e.teamPick = r.team_pick;
  return e;
}

// ---------- jumps ----------
/** Column ↔ previous platform field. `always`: jumpDoc always writes it (even when null). */
const JUMP_FIELDS: [keyof JumpRow, string, 'num' | 'bool' | 'text' | 'json' | 'ts', 'always' | 'optional'][] = [
  ['exit_agl', 'exitAgl', 'num', 'always'], ['t_exit', 'tExit', 'num', 'always'], ['t_val', 'tVal', 'num', 'always'],
  ['t_top', 'tTop', 'num', 'always'], ['t_bot', 'tBot', 'num', 'always'], ['t_deploy', 'tDeploy', 'num', 'always'],
  ['hz', 'hz', 'num', 'always'], ['sep_max', 'sepMax', 'num', 'always'], ['ref_idx', 'refIdx', 'num', 'always'],
  ['lane_dev', 'laneDev', 'num', 'always'], ['lane_outside', 'laneOutside', 'num', 'always'],
  ['sep_min', 'sepMin', 'num', 'always'], ['sep_with', 'sepWith', 'text', 'always'],
  ['pen_manual', 'penManual', 'num', 'always'], ['file_hash', 'fileHash', 'text', 'always'],
  ['file_size', 'fileSize', 'num', 'always'], ['uploaded_by', 'uploadedBy', 'text', 'always'],
  ['uploaded_at', 'uploadedAt', 'ts', 'always'],
  ['lane_decision', 'laneDecision', 'num', 'optional'], ['lane_shift', 'laneShift', 'num', 'optional'],
  ['sep_apply', 'sepApply', 'bool', 'optional'], ['exit_pen', 'exitPen', 'num', 'optional'],
  ['flag_decision', 'flagDecision', 'text', 'optional'], ['void', 'void', 'bool', 'optional'],
  ['notes', 'notes', 'text', 'optional'], ['original_saved', 'originalSaved', 'bool', 'optional'],
];

const JUMP_KNOWN = ['id', 'pilotId', 'task', 'round', 'ok', 'time', 'distance', 'speed', 'flags', 'lanePen', 'sepViolation',
  'device', 'fileName', 'reviews', ...JUMP_FIELDS.map((f) => f[1])];

export function jumpToRow(j: LegacyJump, eventId: string, now: string): JumpRow {
  const row = {
    event_id: eventId, pilot_id: String(j.pilotId), task: String(j.task), round: Math.round(+j.round),
    ok: !!j.ok, time: +(j.time ?? 0) || 0, distance: +(j.distance ?? 0) || 0, speed: +(j.speed ?? 0) || 0,
    flags: Array.isArray(j.flags) ? j.flags : [], lane_pen: +(j.lanePen ?? 0) || 0, sep_violation: !!j.sepViolation,
    device: String(j.device ?? ''), file_name: String(j.fileName ?? ''),
    extra: splitExtra(j, JUMP_KNOWN), created_at: iso(j.uploadedAt as number | undefined, now), updated_at: now,
  } as Record<string, unknown>;
  for (const [col, field, kind] of JUMP_FIELDS) {
    const v = j[field];
    if (kind === 'num') {
      row[col] = numOrNull(v);
      // A non-numeric value (e.g. stray text) is not lost: it stays in extra.
      if (v != null && v !== '' && row[col] === null) (row.extra as Record<string, unknown>)[field] = v;
    } else if (kind === 'bool') row[col] = boolOrNull(v);
    else if (kind === 'text') row[col] = v == null ? null : String(v);
    else if (kind === 'ts') row[col] = typeof v === 'number' && isFinite(v) ? new Date(v).toISOString() : null;
  }
  return row as unknown as JumpRow;
}

/** Row → jump with the field names used by lib/engine and the previous platform. */
export function rowToJump(r: JumpRow, reviews: ReviewRow[] = []): LegacyJump {
  const j: LegacyJump = {
    ...r.extra, pilotId: r.pilot_id, task: r.task, round: r.round, ok: r.ok, time: r.time, distance: r.distance, speed: r.speed,
    flags: r.flags, lanePen: r.lane_pen, sepViolation: r.sep_violation, device: r.device, fileName: r.file_name,
  };
  for (const [col, field, kind, presence] of JUMP_FIELDS) {
    const v = kind === 'ts' ? ms(r[col] as string | null) : r[col];
    if (v == null && presence === 'optional') continue;
    if (v == null && field in r.extra) continue; // the original non-numeric value is in extra
    j[field] = v;
  }
  const mine = reviews.filter((x) => x.pilot_id === r.pilot_id && x.task === r.task && x.round === r.round);
  if (mine.length) j.reviews = mine.map((x) => ({ name: x.reviewer_name, uid: x.legacy_uid, at: Date.parse(x.at) }));
  return j;
}

export function reviewsToRows(j: LegacyJump, eventId: string, now: string): ReviewRow[] {
  return (j.reviews ?? []).map((rv) => ({
    event_id: eventId, pilot_id: String(j.pilotId), task: String(j.task), round: Math.round(+j.round),
    reviewer_name: String(rv.name ?? ''), legacy_uid: rv.uid == null ? null : String(rv.uid), at: iso(rv.at, now),
  }));
}
