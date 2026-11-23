'use client';
// Jump run planner, in the browser (nothing is saved on the server). 5.5.1: the jump run is perpendicular to the wind
// and upwind of the landing area; 5.5.4: at least 600 m between exits, announced as seconds between exits.
// The last plan stays in this browser so the event settings can bring it in.
import { useEffect, useMemo, useState } from 'react';
import { projector, type RefPoint } from '@/lib/engine';
import type { JumpRun } from '@/lib/data/rows';
import { SatMap } from '@/app/ui/sat-map';

type LatLon = { lat: number; lon: number };
export const PLAN_KEY = 'wsp:jump-run-plan';
const AVA: LatLon = { lat: -33.06, lon: -60.62 }; // Alvear, Santa Fe
const KT = 0.514444; // m/s per knot
const GROUND_MAX = 11; // m/s, FAI Sporting Code Section 5, 1.3.3
const RAD = Math.PI / 180;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const n = (s: string) => parseFloat(s.replace(',', '.'));
// Shortest distance between segments p1–p2 and q1–q2 (metres in a local projection); 0 if they cross.
type XY = [number, number];
function segPoint(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function segDist(p1: XY, p2: XY, q1: XY, q2: XY) {
  const side = (a: XY, b: XY, c: XY) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  if (side(p1, p2, q1) * side(p1, p2, q2) < 0 && side(q1, q2, p1) * side(q1, q2, p2) < 0) return 0;
  return Math.min(segPoint(p1, q1, q2), segPoint(p2, q1, q2), segPoint(q1, p1, p2), segPoint(q2, p1, p2));
}
const deg = (d: number) => `${String(Math.round(((d % 360) + 360) % 360) || 360).padStart(3, '0')}°`;

interface Inputs { windFrom: string; windKt: string; tasKt: string; exits: string; gap: string; glide: string; upwind: string; lane: string; side: 1 | -1 }
// Upwind distance from the glide: from the exit to the window (2500 m) the flyer dives to build speed (counted as
// no distance), then glides (horizontal / height, ~2.5) down to the opening (~3500 ft): 2.5 × 1433 m ≈ 3600 m.
const WINDOW_TOP = 2500, OPEN_M = 3500 * 0.3048;
const upwindOf = (glide: string) => { const g = n(glide); return isFinite(g) && g > 0 ? String(Math.round((g * (WINDOW_TOP - OPEN_M)) / 100) * 100) : ''; };
const DEFAULTS: Inputs = { windFrom: '90', windKt: '15', tasKt: '80', exits: '6', gap: '600', glide: '2,5', upwind: upwindOf('2,5'), lane: '600', side: 1 };
const OLD_DEFAULTS = ['1500', '5500']; // earlier defaults (too far): move saved plans to the new one

interface Hour { time: string; w700: [number, number]; w850: [number, number]; w10: [number, number]; gust: number }

export function Planner() {
  const [landing, setLanding] = useState<LatLon>(AVA);
  const [refs, setRefs] = useState<RefPoint[]>([]);
  const [inp, setInp] = useState<Inputs>(DEFAULTS);
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [wx, setWx] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof Inputs, v: string) => setInp((x) => ({ ...x, [k]: v }));

  // Per-viewer convenience: restore the last plan (may be unavailable in private windows).
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null');
      if (p?.landing) setLanding(p.landing);
      if (Array.isArray(p?.refs)) setRefs(p.refs);
      if (p?.inputs) setInp({ ...DEFAULTS, ...p.inputs, ...(OLD_DEFAULTS.includes(p.inputs.upwind) ? { upwind: DEFAULTS.upwind } : {}) });
    } catch { /* start fresh */ }
    setLoaded(true);
  }, []);

  const plan = useMemo(() => {
    const from = n(inp.windFrom), w = n(inp.windKt), tas = n(inp.tasKt), exits = Math.round(n(inp.exits)), gap = n(inp.gap), up = n(inp.upwind);
    if (![from, w, tas, exits, gap, up].every(isFinite) || exits < 1 || gap <= 0) return { error: 'Completá todos los datos con números.' };
    if (w >= tas) return { error: 'Con ese viento el avión no puede volar la pasada cruzada: revisá las velocidades.' };
    const pr = projector(landing.lat, landing.lon), k = pr(landing.lat + 1, landing.lon + 1);
    const back = (x: number, y: number): LatLon => ({ lat: round6(landing.lat + y / k[1]), lon: round6(landing.lon + x / k[0]) });
    const ux = Math.sin(from * RAD), uy = Math.cos(from * RAD); // towards where the wind comes from
    const heading = from + 90 * inp.side; // 5.5.1: perpendicular to the wind
    const hx = Math.sin(heading * RAD), hy = Math.cos(heading * RAD);
    const cx = ux * up, cy = uy * up, half = ((exits - 1) * gap) / 2;
    const run: JumpRun = { a: back(cx - hx * half, cy - hy * half), b: back(cx + hx * half, cy + hy * half) };
    // Flying a track across the wind, the plane crabs: ground speed = √(TAS² − W²).
    const gs = Math.sqrt(tas * tas - w * w) * KT;
    const secs = Math.ceil(gap / gs); // rounded up so the separation is never under `gap`
    const ex = Array.from({ length: exits }, (_, j) => [cx - hx * half + hx * gap * j, cy - hy * half + hy * gap * j] as [number, number]);
    // Exit N flies to point N (as the map draws it): distance from that exit.
    const refDist = refs.map((r, j) => {
      if (j >= exits) return null;
      const q = pr(r.lat, r.lon);
      return Math.hypot(q[0] - ex[j][0], q[1] - ex[j][1]);
    });
    // Suggested points: each exit moved downwind by the upwind distance (parallel lanes, one per exit, across the landing).
    const suggested: RefPoint[] = ex.map(([x, y], j) => ({ name: `Punto ${j + 1}`, ...back(x - ux * up, y - uy * up) }));
    // Clearance between the lanes of consecutive exits (exit → its point, `lane` m wide): negative = they overlap.
    const lane = n(inp.lane);
    const seps = refs.length && lane > 0 ? ex.slice(1).map((_, j) => {
      const a = refs[j % refs.length], b = refs[(j + 1) % refs.length], qa = pr(a.lat, a.lon), qb = pr(b.lat, b.lon);
      return Math.round(segDist(ex[j], qa, ex[j + 1], qb) - lane);
    }) : [];
    return { run, heading, gs, secs, length: half * 2, gap, refDist, suggested, seps };
  }, [inp, landing, refs]);

  // Save after every change, once the stored plan was read.
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(PLAN_KEY, JSON.stringify({ landing, refs, inputs: inp, jumpRun: 'run' in plan ? plan.run : null })); } catch { /* not available */ }
  }, [loaded, landing, refs, inp, plan]);

  async function forecast() {
    setWx('loading');
    try {
      const q = new URLSearchParams({
        latitude: String(landing.lat), longitude: String(landing.lon), wind_speed_unit: 'kn', timezone: 'auto', forecast_days: '2',
        hourly: 'wind_speed_700hPa,wind_direction_700hPa,wind_speed_850hPa,wind_direction_850hPa,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      });
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
      if (!r.ok) throw new Error();
      const data = await r.json(), h = data.hourly;
      // Times come in the DZ's local time: compare with the current hour there (keeping the hour that just started).
      const now = new Date(Date.now() + data.utc_offset_seconds * 1000 - 3600e3).toISOString().slice(0, 13);
      const rows: Hour[] = h.time.map((t: string, i: number) => ({
        time: t, w700: [h.wind_direction_700hPa[i], h.wind_speed_700hPa[i]], w850: [h.wind_direction_850hPa[i], h.wind_speed_850hPa[i]],
        w10: [h.wind_direction_10m[i], h.wind_speed_10m[i]], gust: h.wind_gusts_10m[i],
      }));
      const start = Math.max(0, rows.findIndex((x) => x.time.slice(0, 13) >= now));
      setHours(rows.slice(start, start + 14)); setWx('idle');
    } catch { setWx('error'); }
  }

  const pickHour = (h: Hour) => setInp((x) => ({ ...x, windFrom: String(Math.round(h.w700[0])), windKt: String(Math.round(h.w700[1])) }));
  const wind = ([d, s]: [number, number]) => `${deg(d)} ${Math.round(s)} kt`;
  const field = (k: keyof Inputs, label: string, unit: string) => (
    <label className="field">{label} ({unit})
      <input inputMode="decimal" value={inp[k] as string} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <div className="stack">
      <h2>Viento</h2>
      <div className="grid">
        {field('windFrom', 'Viene de', '°')}
        {field('windKt', 'Velocidad a la altura de salida', 'kt')}
      </div>
      <div className="row">
        <button type="button" className="secondary" onClick={forecast} disabled={wx === 'loading'}>{wx === 'loading' ? 'Buscando…' : 'Traer el pronóstico'}</button>
        <span className="sub small">Pronóstico de Open-Meteo para el aterrizaje marcado. Confirmalo con el piloto antes de subir.</span>
      </div>
      {wx === 'error' && <p className="error" role="alert">No se pudo traer el pronóstico. Cargá el viento a mano.</p>}
      {hours && (
        <div className="scroll-x">
          <table className="standings">
            <thead><tr><th>Hora</th><th>~3000 m</th><th>~1500 m</th><th>Suelo (ráfagas)</th><th></th></tr></thead>
            <tbody>{hours.map((h) => (
              <tr key={h.time}>
                <td>{h.time.slice(8, 10)}/{h.time.slice(5, 7)} {h.time.slice(11, 16)}</td>
                <td>{wind(h.w700)}</td><td>{wind(h.w850)}</td>
                <td className={Math.max(h.w10[1], h.gust) * KT > GROUND_MAX ? 'pen' : undefined}>{wind(h.w10)} ({Math.round(h.gust)})</td>
                <td><button type="button" className="secondary" onClick={() => pickHour(h)}>Usar</button></td>
              </tr>
            ))}</tbody>
          </table>
          <p className="sub small">Se usa el viento de ~3000 m (700 hPa), el de la altura de salida. En rojo: el viento o las ráfagas en el suelo pasan de 11 m/s (21 kt), el máximo de la FAI (Código Deportivo, Sección 5, 1.3.3).</p>
        </div>
      )}

      <h2>Avión y salidas</h2>
      <div className="grid">
        {field('tasKt', 'Velocidad del avión en la pasada', 'kt')}
        {field('exits', 'Salidas en la pasada', 'pilotos')}
        {field('gap', 'Separación entre salidas, mínimo 600', 'm')}
        <label className="field">Planeo en la ventana (distancia / altura)
          <input inputMode="decimal" value={inp.glide} onChange={(e) => { const glide = e.target.value; setInp((x) => ({ ...x, glide, upwind: upwindOf(glide) || x.upwind })); }} />
        </label>
        {field('upwind', 'Centro de la pasada a barlovento del aterrizaje', 'm')}
        {field('lane', 'Ancho del carril', 'm')}
      </div>
      <p className="sub small">La distancia a barlovento sale del planeo: de la salida a la ventana (2500 m) se pica para tomar velocidad y casi no se avanza; desde ahí se planea hasta la apertura (~3500 ft). Con 2,5 da {upwindOf('2,5')} m. Al cambiar el planeo se recalcula; también la podés ajustar a mano.</p>
      {n(inp.gap) < 600 && <p className="error" role="alert">La FAI pide al menos 600 m entre salidas (5.5.4).</p>}
      <div className="seg" role="group" aria-label="Sentido de la pasada">
        {([1, -1] as const).map((s) => (
          <button key={s} type="button" aria-pressed={inp.side === s} onClick={() => setInp((x) => ({ ...x, side: s }))}>Rumbo {deg(n(inp.windFrom) + 90 * s)}</button>
        ))}
      </div>

      {'error' in plan ? <p className="error" role="alert">{plan.error}</p> : (
        <div className="kpis records">
          <div className="kpi main"><span className="small muted">Rumbo de la pasada</span><span className="v">{deg(plan.heading)}</span><span className="small muted">perpendicular al viento (5.5.1)</span></div>
          <div className="kpi main"><span className="small muted">Entre salidas</span><span className="v">{plan.secs} s</span><span className="small muted">a {Math.round(plan.gs / KT)} kt sobre el suelo, {plan.gap} m (5.5.4)</span></div>
          <div className="kpi main"><span className="small muted">Largo de la pasada</span><span className="v">{(plan.length / 1000).toFixed(1).replace('.', ',')} km</span><span className="small muted">centro a {inp.upwind} m a barlovento</span></div>
        </div>
      )}
      {plan.run && (
        <div className="row">
          {/* The installed clock (iPhone) does not share this browser's storage: the point goes by copy and paste. */}
          <button type="button" className="secondary" onClick={() => {
            navigator.clipboard?.writeText(`${plan.run.a.lat}, ${plan.run.a.lon}, ${plan.gap}, ${Math.round(plan.gs / KT)}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }, () => {});
          }}>{copied ? 'Copiado' : 'Copiar para el reloj'}</button>
          <span className="sub small">Copia el punto de la salida 1, la separación y el ground speed ({plan.run.a.lat}, {plan.run.a.lon}, {plan.gap} m, {Math.round(plan.gs / KT)} kt). En el <a href="/door/index.html">Reloj de puerta</a>, tocá «Pegar lo copiado en Pasada».</span>
        </div>
      )}

      <h2>Mapa</h2>
      <p className="sub small">Arrastrá el cuadrado naranja al área de aterrizaje. Tocá el mapa para agregar puntos de referencia y arrastralos para moverlos. Los círculos son las salidas: la salida 1 va al punto 1, la 2 al punto 2, y así (si hay más salidas que puntos, se vuelve a empezar). Las franjas celestes son el carril de cada salida hasta su punto, del ancho que cargaste.</p>
      {plan.suggested && (
        <div className="row">
          <button type="button" className="secondary" onClick={() => setRefs(plan.suggested!)}>{refs.length ? 'Reemplazar por los puntos sugeridos' : 'Sugerir puntos'}</button>
          <span className="sub small">Un punto por salida, corrido a sotavento {inp.upwind} m (la distancia a barlovento): carriles paralelos que cruzan el aterrizaje. Después movelos a gusto.</span>
        </div>
      )}
      <SatMap refs={refs} onRefsChange={setRefs} jumpRun={'run' in plan ? plan.run : null} landing={landing} onLandingChange={setLanding} exitGap={'gap' in plan ? plan.gap : 600} height={480}
        laneWidth={n(inp.lane) >= 100 ? n(inp.lane) : 600}
        fitKey={`${inp.windFrom}|${inp.side}|${inp.upwind}|${inp.exits}`} />
      {refs.length > 0 && (
        <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
          {refs.map((r, i) => (
            <li key={i} className="row">
              <input aria-label={`Nombre del punto ${i + 1}`} value={r.name ?? ''} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ maxWidth: 160 }} />
              <span className="small muted">{plan.refDist?.[i] != null ? `Salida ${i + 1}: a ${(plan.refDist[i]! / 1000).toFixed(1).replace('.', ',')} km` : 'Sin salida asignada'}</span>
              <button type="button" className="secondary" onClick={() => setRefs(refs.filter((_, j) => j !== i))}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {plan.seps && plan.seps.length > 0 && (
        <div className="stack">
          <h3>Separación entre carriles</h3>
          <ul>{plan.seps.map((d, j) => (
            <li key={j} className={d < 0 ? 'pen' : undefined}>Salidas {j + 1} y {j + 2}: {d < 0 ? `se superponen ${-d} m` : d === 0 ? 'se tocan (0 m entre los bordes)' : `${d} m entre los bordes`}</li>
          ))}</ul>
          <p className="sub small">Entre los bordes de los carriles de {inp.lane} m, de cada salida a su punto. Si se superponen, separá los puntos o las salidas.</p>
        </div>
      )}
      <p className="sub small">Es una ayuda para planificar: no cambia el puntaje. El plan queda guardado en este navegador; para usarlo en una jornada, abrí sus ajustes y tocá «Usar la pasada del planificador».</p>
    </div>
  );
}
