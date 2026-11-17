// Scoring engine types. Field names match what the previous platform stores
// (legacy/src/engine.js), so exported JSON backups import without renaming.

export type Task = 'time' | 'distance' | 'speed';

/** Normalized GPS point. `t` in UNIX seconds, `alt` in m MSL, `vD` in m/s (positive downward). */
export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  vD: number;
  /** Estimated SEP50 (m) from hAcc/vAcc; null if the file reports no accuracy. */
  sep: number | null;
}

/** Interpolated point (no `sep`). */
export interface InterpPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  vD: number;
}

export interface ParsedTrack {
  pts: TrackPoint[];
  device: string;
}

export interface ScoreConfig {
  elev: number;
  top: number;
  bottom: number;
  exitMin: number;
  exitMax: number;
  laneWidth: number;
  valDelay: number;
  valVs: number;
  valBelow: number;
  sepLimit: number;
  minHz: number;
  separation: number;
}

/** Config coming from the event: any field may be missing or arrive as text. */
export type ScoreConfigInput = Partial<Record<keyof ScoreConfig, number | string | null | undefined>>;

export interface RefPoint {
  lat: number;
  lon: number;
  name?: string;
}

export type FlagLevel = 'info' | 'warn';
export type FlagCode = 'sin_sep' | 'sep' | 'hz' | 'gap' | 'exit_low' | 'exit_high' | 'exit_gap';

export interface Flag {
  code: FlagCode;
  level: FlagLevel;
  text: string;
}

export interface LaneResult {
  dev: number;
  outside: number;
  penalty: number;
  t: number;
  side: number;
  start: { lat: number; lon: number };
  bearing: number;
  length: number;
}

export interface ScoreResult {
  ok: boolean;
  flags: Flag[];
  cfg: ScoreConfig;
  error?: string;
  tExit?: number;
  exitAgl?: number;
  exitLat?: number;
  exitLon?: number;
  tVal?: number;
  tTop?: number;
  tBot?: number;
  pTop?: { lat: number; lon: number };
  pBot?: { lat: number; lon: number };
  time?: number;
  distance?: number;
  speed?: number;
  hz?: number;
  maxGap?: number;
  sepMax?: number | null;
  tDeploy?: number | null;
  lane?: LaneResult | null;
}

export interface Separation {
  d3: number;
  h: number;
  dz: number;
  t: number;
}

/** Packed track (v1): comma-separated integer deltas. */
export interface PackedTrack {
  v: 1;
  t0: number;
  n: number;
  t: string;
  la: string;
  lo: string;
  al: string;
  vd: string;
  se: string | null;
}

/**
 * Jump as stored by the event. `standings` and `effectivePenalties` add underscore fields
 * (`_pen`, `_result`, ...) on the same object, like the previous platform.
 */
export interface JumpRecord {
  pilotId: string;
  task: string;
  round: number | string;
  ok?: boolean;
  time?: number | string | null;
  distance?: number | string | null;
  speed?: number | string | null;
  tExit?: number | null;
  void?: boolean;
  penManual?: number | string | null;
  laneDecision?: number | string | null;
  lanePen?: number | null;
  laneOutside?: number | null;
  sepViolation?: boolean;
  sepApply?: boolean;
  sepMin?: number | null;
  exitPen?: number | string | null;
  _pen?: number;
  _penWhy?: string;
  _result?: number;
  _best?: number;
  _points?: number;
  _isBest?: boolean;
  [key: string]: unknown;
}

export interface TaskCell {
  points: number;
  cells: Record<string, JumpRecord>;
}

export interface StandingRow {
  pilotId: string;
  tasks: Partial<Record<Task, TaskCell>>;
  total: number;
  jumps: number;
  totalRounded: number;
  tb: number | null;
  rank: number;
}

export interface Standings {
  rows: StandingRow[];
  rounds: Record<Task, number[]>;
  tiebreak: JumpRecord[];
}

export interface StandingsOptions {
  tiebreak?: { task?: string | null } | null;
}
