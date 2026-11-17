// Data from the 5th FAI Wingsuit Flying World Cup (Prostějov, 2025), Skyderby competition 619.
// Per-jump results come from the scoreboard + /results/{id} (the /results list route no longer exists
// in the current API), and GPS points from /tracks/{trackId}/points.
import type { Task, TrackPoint } from '../../lib/engine';
import { cachedJson, mapLimit } from './cache';

const API = 'https://skyderby.ru/api/v1';
const EVENT_ID = 619;
const DIR = `skyderby-${EVENT_ID}`;

interface ApiRound { id: number; discipline: Task; number: number }
interface ApiEvent {
  name: string;
  place: { msl: number };
  window: { from: number; to: number };
  rounds: ApiRound[];
  competitors: { id: number; name: string }[];
}
interface ApiScoreboard {
  groups: {
    category: { name: string };
    rows: { rank: number; competitorId: number; totalPoints: number; results: { id: number; roundId: number; trackId: number }[] }[];
  }[];
}
interface ApiResult {
  id: number;
  round: { id: number; discipline: Task; number: number };
  competitorId: number;
  trackId: number;
  result: number;
  formattedResult: string;
  penalized: boolean;
  penaltySize: number;
  penaltyReason: string | null;
  exitedAt: string | null;
  referencePoint: { id: number; name: string; latitude: number | string; longitude: number | string } | null;
}
interface ApiPoint {
  gps_time: string;
  latitude: string | number;
  longitude: string | number;
  abs_altitude: number;
  v_speed: number; // km/h, positive downward
  sep50: number | null;
}

export interface WorldCupJump {
  resultId: number;
  trackId: number;
  competitor: string;
  task: Task;
  round: number;
  /** Official result, unrounded and rounded as Skyderby publishes it. */
  official: number;
  officialFormatted: string;
  penaltySize: number;
  penaltyReason: string | null;
  exitedAt: number | null;
  ref: { name: string; lat: number; lon: number } | null;
}

/** Official standings per category, as published on the scoreboard. */
export interface WorldCupGroup {
  category: string;
  rows: { competitor: string; rank: number; totalPoints: number }[];
}

export interface WorldCup2025 {
  name: string;
  groups: WorldCupGroup[];
  elev: number;
  top: number;
  bottom: number;
  jumps: WorldCupJump[];
  points(trackId: number): Promise<TrackPoint[]>;
}

/** Skyderby points → engine TrackPoint (same conversion as the original validation). */
export function toTrackPoints(raw: ApiPoint[]): TrackPoint[] {
  return raw.map((p) => ({
    t: Date.parse(p.gps_time) / 1000,
    lat: +p.latitude,
    lon: +p.longitude,
    alt: +p.abs_altitude,
    vD: +p.v_speed / 3.6,
    sep: p.sep50 == null ? null : +p.sep50,
  }));
}

export async function loadWorldCup2025(): Promise<WorldCup2025> {
  const ev = await cachedJson<ApiEvent>(`${DIR}/event.json`, `${API}/performance_competitions/${EVENT_ID}`);
  const sb = await cachedJson<ApiScoreboard>(`${DIR}/scoreboard.json`, `${API}/performance_competitions/${EVENT_ID}/scoreboard`);
  const names = new Map(ev.competitors.map((c) => [c.id, c.name.trim()]));
  const ids = sb.groups.flatMap((g) => g.rows.flatMap((r) => r.results.map((x) => x.id)));
  const results = await mapLimit(ids, 4, (id) =>
    cachedJson<ApiResult>(`${DIR}/results/${id}.json`, `${API}/performance_competitions/${EVENT_ID}/results/${id}`),
  );
  const jumps: WorldCupJump[] = results.map((r) => ({
    resultId: r.id,
    trackId: r.trackId,
    competitor: names.get(r.competitorId) ?? String(r.competitorId),
    task: r.round.discipline,
    round: r.round.number,
    official: r.result,
    officialFormatted: r.formattedResult,
    penaltySize: r.penaltySize || 0,
    penaltyReason: r.penaltyReason,
    exitedAt: r.exitedAt ? Date.parse(r.exitedAt) / 1000 : null,
    ref: r.referencePoint
      ? { name: r.referencePoint.name, lat: +r.referencePoint.latitude, lon: +r.referencePoint.longitude }
      : null,
  }));
  jumps.sort((a, b) => a.task.localeCompare(b.task) || a.round - b.round || a.competitor.localeCompare(b.competitor));
  return {
    name: ev.name,
    groups: sb.groups.map((g) => ({
      category: g.category.name,
      rows: g.rows.map((r) => ({ competitor: names.get(r.competitorId) ?? String(r.competitorId), rank: r.rank, totalPoints: r.totalPoints })),
    })),
    elev: ev.place.msl,
    top: ev.window.from,
    bottom: ev.window.to,
    jumps,
    async points(trackId: number) {
      const raw = await cachedJson<ApiPoint[]>(
        `${DIR}/tracks/${trackId}.json`,
        `${API}/tracks/${trackId}/points?freq_1_hz=false&trimmed%5Bseconds_before_start%5D=40`,
      );
      return toTrackPoints(raw);
    },
  };
}

/** Downloads everything missing (to warm the cache). */
export async function prefetchWorldCup2025(): Promise<WorldCup2025> {
  const wc = await loadWorldCup2025();
  await mapLimit(wc.jumps, 4, (j) => wc.points(j.trackId));
  return wc;
}
