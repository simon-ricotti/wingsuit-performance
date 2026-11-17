// Datos de la 5.ª Copa del Mundo FAI de Wingsuit Flying (Prostějov, 2025), competencia 619 de Skyderby.
// Los resultados por salto salen del scoreboard + /results/{id} (la ruta /results de la lista no existe
// en la API actual), y los puntos de GPS de /tracks/{trackId}/points.
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
  v_speed: number; // km/h, positivo hacia abajo
  sep50: number | null;
}

export interface CopaJump {
  resultId: number;
  trackId: number;
  competitor: string;
  task: Task;
  round: number;
  /** Resultado oficial sin redondear y redondeado como lo publica Skyderby. */
  official: number;
  officialFormatted: string;
  penaltySize: number;
  penaltyReason: string | null;
  exitedAt: number | null;
  ref: { name: string; lat: number; lon: number } | null;
}

/** Clasificación oficial por categoría, como la publica el scoreboard. */
export interface CopaGroup {
  category: string;
  rows: { competitor: string; rank: number; totalPoints: number }[];
}

export interface Copa2025 {
  name: string;
  groups: CopaGroup[];
  elev: number;
  top: number;
  bottom: number;
  jumps: CopaJump[];
  points(trackId: number): Promise<TrackPoint[]>;
}

/** Puntos de Skyderby → TrackPoint del motor (misma conversión que la validación original). */
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

export async function loadCopa2025(): Promise<Copa2025> {
  const ev = await cachedJson<ApiEvent>(`${DIR}/event.json`, `${API}/performance_competitions/${EVENT_ID}`);
  const sb = await cachedJson<ApiScoreboard>(`${DIR}/scoreboard.json`, `${API}/performance_competitions/${EVENT_ID}/scoreboard`);
  const names = new Map(ev.competitors.map((c) => [c.id, c.name.trim()]));
  const ids = sb.groups.flatMap((g) => g.rows.flatMap((r) => r.results.map((x) => x.id)));
  const results = await mapLimit(ids, 4, (id) =>
    cachedJson<ApiResult>(`${DIR}/results/${id}.json`, `${API}/performance_competitions/${EVENT_ID}/results/${id}`),
  );
  const jumps: CopaJump[] = results.map((r) => ({
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

/** Descarga todo lo que falta (para precargar la caché). */
export async function prefetchCopa2025(): Promise<Copa2025> {
  const copa = await loadCopa2025();
  await mapLimit(copa.jumps, 4, (j) => copa.points(j.trackId));
  return copa;
}
