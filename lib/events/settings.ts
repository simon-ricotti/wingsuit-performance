// Event settings form: defaults, judging profiles, unit conversion and validation.
// Mirrors eventForm/readEventForm in legacy/src/app.js. Validation messages are shown to the user (Spanish).
import { DEFAULT_CFG } from '../engine';
import type { EventMode, EventRow, JumpRun } from '../data/rows';

// ---------- units ----------
const FT = 0.3048;
// Equivalences given by the FAI rules (5.4.5 to 5.4.7): 3200 m = 10 500 ft, 3353 m = 11 000 ft, 3048 m = 10 000 ft
const FAI_FT: Record<number, number> = { 3200: 10500, 3353: 11000, 3048: 10000 };
const FAI_M: Record<number, number> = { 10500: 3200, 11000: 3353, 10000: 3048 };

export const metresToFeet = (m: number): number => FAI_FT[m] ?? Math.round(m / FT);

/** Value typed in the event's unit → metres (a whole metre when it round-trips, e.g. 8202 ft = 2500 m). */
export function toMetres(v: number, ft: boolean): number {
  if (!ft) return v;
  if (FAI_M[v]) return FAI_M[v];
  const m = v * FT, r = Math.round(m);
  return Math.round(r / FT) === Math.round(v) ? r : +m.toFixed(2);
}

/** Metres → value shown in the event's unit. */
export const altitudeIn = (m: number | null | undefined, ft: boolean): string =>
  m == null || !isFinite(m) ? '' : String(ft ? metresToFeet(m) : m);

// ---------- judging ----------
export interface Judging { profile: 'arg' | 'fai' | 'custom'; reviews: 1 | 2; door: 'fd' | 'device' | 'none'; gpsRule: 'rejump' | 'warn'; exitRule: 'rejump' | 'warn' }

export const JUDGING_PROFILES = {
  arg: { label: 'Argentina (club y entrenamiento)', reviews: 1, door: 'device', gpsRule: 'warn', exitRule: 'warn' },
  fai: { label: 'FAI estricto', reviews: 2, door: 'fd', gpsRule: 'rejump', exitRule: 'rejump' },
} as const;

export const DOOR_LABELS = { fd: 'Flight Director a bordo', device: 'Dispositivo: cronómetro y cámara', none: 'Sin control de salidas' } as const;

export function judgingOf(raw: Record<string, unknown> | null | undefined): Judging {
  const profile = raw?.profile === 'fai' || raw?.profile === 'custom' ? raw.profile : 'arg';
  const base = JUDGING_PROFILES[profile === 'custom' ? 'arg' : profile];
  return { ...base, ...(raw as object), profile } as Judging;
}

// ---------- form values ----------
/** What the form shows: altitudes already in the event's unit, reference points as text. */
export interface EventFormValues {
  id: string | null;
  name: string; date: string; mode: EventMode; rounds: string; teamSize: string; dz: string; units: 'm' | 'ft';
  elev: string; top: string; bottom: string; exitMin: string; exitMax: string;
  lane: boolean; laneWidth: string; sepCheck: boolean; refs: string; pilotUploads: boolean;
  judging: Judging; jumpRun: JumpRun | null;
}

export function formValuesOf(ev: EventRow | null, today: string): EventFormValues {
  const ft = ev?.units === 'ft';
  const cfg = { ...DEFAULT_CFG, ...((ev?.cfg ?? {}) as Partial<typeof DEFAULT_CFG>) };
  const refs = (ev?.refs ?? []) as { name: string; lat: number; lon: number }[];
  return {
    id: ev?.id ?? null,
    name: ev?.name ?? '', date: ev?.date ?? today, mode: ev?.mode ?? 'free',
    rounds: String(ev?.rounds ?? 3), teamSize: String(ev?.team_size ?? 3), dz: ev?.dz ?? '', units: ev?.units ?? 'm',
    // A new event has no elevation yet: it is required (it defines the height above ground, 2.1 and 2.2).
    elev: ev && (ev.cfg as Record<string, unknown>).elev != null ? altitudeIn(cfg.elev, ft) : '',
    top: altitudeIn(cfg.top, ft), bottom: altitudeIn(cfg.bottom, ft),
    exitMin: altitudeIn(cfg.exitMin, ft), exitMax: altitudeIn(cfg.exitMax, ft),
    lane: ev ? ev.lane : true, laneWidth: String(cfg.laneWidth), sepCheck: ev ? ev.sep_check : true, pilotUploads: ev?.pilot_uploads ?? false,
    refs: refs.map((r) => `${r.name}, ${r.lat}, ${r.lon}`).join('\n'),
    judging: judgingOf(ev?.judging), jumpRun: ev?.jump_run ?? null,
  };
}

/** Fields accepted by public.save_event. */
export type EventSettings = Pick<EventRow, 'name' | 'date' | 'dz' | 'mode' | 'rounds' | 'team_size' | 'units' | 'lane' | 'sep_check' | 'refs' | 'cfg' | 'judging' | 'pilot_uploads' | 'jump_run'>;

export class SettingsError extends Error {}

const num = (s: unknown, def: number): number => {
  const n = parseFloat(String(s ?? '').replace(',', '.'));
  return isFinite(n) ? n : def;
};
const clampInt = (s: unknown, def: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(num(s, def))));

export function parseRefs(text: string): { name: string; lat: number; lon: number }[] {
  const refs: { name: string; lat: number; lon: number }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const p = line.split(/[,;\t]/).map((x) => x.trim());
    const lat = parseFloat(p[p.length - 2]), lon = parseFloat(p[p.length - 1]);
    if (p.length < 3 || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new SettingsError(`No entiendo este punto de referencia: "${line}". Usá: nombre, latitud, longitud (grados decimales).`);
    }
    refs.push({ name: p.slice(0, p.length - 2).join(' ') || `Punto ${refs.length + 1}`, lat, lon });
  }
  return refs;
}

/** "lat,lon,lat,lon" from the map (hidden field) → planned jump run, or null. Not scored. */
export function parseJumpRun(text: string | undefined): JumpRun | null {
  const n = (text ?? '').split(',').map(Number);
  if (n.length !== 4 || !n.every(isFinite) || Math.abs(n[0]) > 90 || Math.abs(n[2]) > 90 || Math.abs(n[1]) > 180 || Math.abs(n[3]) > 180) return null;
  return { a: { lat: n[0], lon: n[1] }, b: { lat: n[2], lon: n[3] } };
}

/** Form fields → settings in metres, as readEventForm does. Throws SettingsError with a message for the user. */
export function parseEventSettings(f: Record<string, string | undefined>): EventSettings {
  const ft = f.units === 'ft';
  const dv = (m: number) => (ft ? metresToFeet(m) : m);
  const refs = parseRefs(f.refs ?? '');
  const elev = toMetres(num(f.elev, NaN), ft);
  const top = toMetres(num(f.top, dv(DEFAULT_CFG.top)), ft);
  const bottom = toMetres(num(f.bottom, dv(DEFAULT_CFG.bottom)), ft);
  if (!isFinite(elev)) throw new SettingsError('Falta la elevación del DZ sobre el nivel del mar.');
  if (!(top > bottom)) throw new SettingsError('El límite superior de la ventana tiene que ser mayor que el inferior.');
  const laneWidth = Math.round(num(f.laneWidth, DEFAULT_CFG.laneWidth));
  if (!(laneWidth >= 100 && laneWidth <= 2000)) throw new SettingsError('El ancho del carril tiene que estar entre 100 y 2000 m.');
  const name = (f.name ?? '').trim();
  if (!name) throw new SettingsError('Poné un nombre para la jornada.');
  const date = /^\d{4}-\d\d-\d\d$/.test(f.date ?? '') ? f.date! : null;
  const profile = f.profile === 'fai' || f.profile === 'custom' ? f.profile : 'arg';
  const pick = <T extends string>(v: string | undefined, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def);
  return {
    name, date, dz: (f.dz ?? '').trim(), mode: f.mode === 'competition' ? 'competition' : 'free',
    rounds: clampInt(f.rounds, 3, 1, 12), team_size: clampInt(f.teamSize, 3, 1, 10), units: ft ? 'ft' : 'm',
    lane: f.lane === '1', sep_check: f.sepCheck === '1', refs, pilot_uploads: f.pilotUploads === '1', jump_run: parseJumpRun(f.jumpRun),
    cfg: {
      elev, top, bottom,
      exitMin: toMetres(num(f.exitMin, dv(DEFAULT_CFG.exitMin)), ft),
      exitMax: toMetres(num(f.exitMax, dv(DEFAULT_CFG.exitMax)), ft),
      // Lane width in metres (FAI 2.2: 600). Stored only when it differs, so saving an FAI event does not change its cfg.
      // The penalty bands stay as in 5.6.2, measured from the lane edge.
      ...(laneWidth !== DEFAULT_CFG.laneWidth ? { laneWidth } : {}),
    },
    judging: {
      profile,
      reviews: f.reviews === '2' ? 2 : 1,
      door: pick(f.door, ['fd', 'device', 'none'] as const, 'device'),
      gpsRule: pick(f.gpsRule, ['rejump', 'warn'] as const, 'warn'),
      exitRule: pick(f.exitRule, ['rejump', 'warn'] as const, 'warn'),
    },
  };
}

// ---------- summary lines (acta, CSV) ----------
type EventSummary = Pick<EventRow, 'cfg' | 'units' | 'lane' | 'sep_check' | 'mode' | 'rounds' | 'judging'>;

/** "Ventana 2500–1500 m AGL · DZ a 26 m · carril 600 m" (cfgLine in the previous platform). */
export function cfgLine(ev: EventSummary): string {
  const c = { ...DEFAULT_CFG, ...(ev.cfg as Partial<typeof DEFAULT_CFG>) }, ft = ev.units === 'ft', u = ft ? 'ft' : 'm';
  const v = (m: number) => (ft ? String(metresToFeet(m)) : String(Math.round(m)));
  return `Ventana ${v(c.top)}–${v(c.bottom)} ${u} AGL · DZ a ${v(c.elev)} ${u}${ev.lane ? ` · carril ${c.laneWidth} m` : ''}`;
}

export const judgingLabel = (J: Judging) => (J.profile === 'custom' ? 'Personalizado' : JUDGING_PROFILES[J.profile].label);

/** Differences with the FAI 2026 rules for this event (profileDiffs in the previous platform). */
export function profileDiffs(ev: EventSummary): string[] {
  const J = judgingOf(ev.judging), F = JUDGING_PROFILES.fai, c = { ...DEFAULT_CFG, ...(ev.cfg as Partial<typeof DEFAULT_CFG>) }, out: string[] = [];
  if (J.reviews !== F.reviews) out.push(`${J.reviews} revisión por salto (FAI: 2 jueces)`);
  if (J.door !== F.door) out.push('salidas: ' + DOOR_LABELS[J.door].toLowerCase());
  if (J.gpsRule !== F.gpsRule) out.push('GPS de menos de 5 Hz o SEP alto: aviso, no re-salto');
  if (J.exitRule !== F.exitRule) out.push('salida fuera de 3200–3353 m: aviso, no re-salto');
  if (Math.abs(c.top - 2500) > 1 || Math.abs(c.bottom - 1500) > 1) out.push(`ventana ${Math.round(c.top)}–${Math.round(c.bottom)} m`);
  if (Math.abs(c.exitMin - 3200) > 1 || Math.abs(c.exitMax - 3353) > 1) out.push(`salida ${Math.round(c.exitMin)}–${Math.round(c.exitMax)} m`);
  if (!ev.lane) out.push('sin carril');
  else if (c.laneWidth !== DEFAULT_CFG.laneWidth) out.push(`carril de ${c.laneWidth} m (FAI: ${DEFAULT_CFG.laneWidth} m)`);
  if (!ev.sep_check) out.push('sin control de separación');
  if (ev.mode === 'competition' && ev.rounds !== 3) out.push(`${ev.rounds} ronda${ev.rounds === 1 ? '' : 's'} (FAI: 3)`);
  return out;
}
