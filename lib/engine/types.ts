// Tipos del motor de puntaje. Los nombres de campo son los mismos que guarda la versión vieja
// (legacy/src/engine.js), para que las copias JSON exportadas se importen sin traducir.

export type Task = 'time' | 'distance' | 'speed';

/** Punto de GPS ya normalizado. `t` en segundos UNIX, `alt` en m MSL, `vD` en m/s (positivo hacia abajo). */
export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  vD: number;
  /** SEP50 estimado (m) a partir de hAcc/vAcc; null si el archivo no informa exactitud. */
  sep: number | null;
}

/** Punto interpolado (no lleva `sep`). */
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

/** Lo que llega desde la jornada: cualquier campo puede faltar o venir como texto. */
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

/** Track compacto (v1): deltas enteros separados por coma. */
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
 * Salto tal como lo guarda la jornada. `standings` y `effectivePenalties` agregan los campos
 * con guion bajo (`_pen`, `_result`, ...) sobre el mismo objeto, igual que la versión vieja.
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
