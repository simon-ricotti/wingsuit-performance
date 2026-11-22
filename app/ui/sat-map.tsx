'use client';
// Satellite map (Leaflet + Esri World Imagery): reference points, planned jump run and tracks with their lane.
// Editing: pass onRefsChange / onJumpRunChange. Geometry in local metres with the engine's projector (2.2).
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { projector, type RefPoint } from '@/lib/engine';
import type { JumpRun } from '@/lib/data/rows';

type LatLon = { lat: number; lon: number };
export interface MapTrack {
  name: string; color: string;
  pts: (LatLon & { t: number })[];
  tTop?: number | null; tBot?: number | null;
  /** Lane of this jump: from the position at the start of validation to the reference point (2.2). */
  lane?: { start: LatLon; ref: RefPoint } | null;
}
interface Props {
  refs?: RefPoint[]; onRefsChange?: (r: RefPoint[]) => void;
  jumpRun?: JumpRun | null; onJumpRunChange?: (j: JumpRun | null) => void;
  tracks?: MapTrack[]; laneWidth?: number; height?: number;
  /** Landing area (jump run planner): a draggable pin when onLandingChange is given. */
  landing?: LatLon | null; onLandingChange?: (p: LatLon) => void;
  /** Metres between exit marks on the jump run (5.5.4: at least 600). */
  exitGap?: number;
  /** Reframe the map when this changes (besides the tracks). */
  fitKey?: string;
}

const AVA: [number, number] = [-33.06, -60.62]; // Alvear, Santa Fe: only the initial view when there is nothing to show
const BANDS: [number, number, string][] = [[0, 0, '#3fc1c9'], [0, 150, '#f0b354'], [150, 300, '#ff7a3d'], [300, 380, '#ff5252']]; // 5.6.2

/** Corridor polygons beside the line a→b: lane (0..half) and the 5.6.2 penalty bands outside it. */
function corridor(a: LatLon, b: LatLon, half: number, withBands: boolean): { poly: [number, number][]; color: string; op: number }[] {
  const pr = projector(a.lat, a.lon), k = pr(a.lat + 1, a.lon + 1); // linear: metres per degree
  const back = (x: number, y: number): [number, number] => [a.lat + y / k[1], a.lon + x / k[0]];
  const r = pr(b.lat, b.lon), L = Math.hypot(r[0], r[1]);
  if (L < 1) return [];
  const nx = -r[1] / L, ny = r[0] / L;
  const strip = (w0: number, w1: number, s: number) => [[0, 0, w0], [0, 0, w1], [r[0], r[1], w1], [r[0], r[1], w0]]
    .map(([x, y, w]) => back(x + nx * w * s, y + ny * w * s));
  const out = [{ poly: strip(-half, half, 1), color: BANDS[0][2], op: 0.22 }];
  if (withBands) for (const [w0, w1, color] of BANDS.slice(1)) for (const s of [1, -1]) out.push({ poly: strip(half + w0, half + w1, s), color, op: 0.2 });
  return out;
}

/** Points every `gap` metres along the jump run. */
function exitSlots(j: JumpRun, gap: number): [number, number][] {
  const pr = projector(j.a.lat, j.a.lon), k = pr(j.a.lat + 1, j.a.lon + 1), r = pr(j.b.lat, j.b.lon), L = Math.hypot(r[0], r[1]);
  const n = Math.min(40, Math.floor(L / gap + 1e-6));
  return Array.from({ length: n + 1 }, (_, i) => [j.a.lat + (r[1] * i * gap / L) / k[1], j.a.lon + (r[0] * i * gap / L) / k[0]]);
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function SatMap({ refs = [], onRefsChange, jumpRun = null, onJumpRunChange, tracks = [], laneWidth = 600, height = 420, landing = null, onLandingChange, exitGap = 600, fitKey = '' }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'ref' | 'run'>('ref');
  const [labels, setLabels] = useState(true);
  const pendingA = useRef<LatLon | null>(null);
  // Latest props for the Leaflet click handler (registered once).
  const latest = useRef({ refs, onRefsChange, onJumpRunChange, mode });
  latest.current = { refs, onRefsChange, onJumpRunChange, mode };
  // Mode buttons and hints only where both can be edited (event settings); other pages explain their own tap.
  const editable = !!(onRefsChange && onJumpRunChange);

  useEffect(() => {
    let off = false;
    import('leaflet').then((mod) => {
      if (off || !box.current) return;
      const Lf = mod.default; L.current = Lf;
      const m = Lf.map(box.current, { center: AVA, zoom: 12 });
      Lf.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagen © Esri, Maxar, Earthstar Geographics',
      }).addTo(m);
      layer.current = Lf.layerGroup().addTo(m);
      m.on('click', (e: Leaflet.LeafletMouseEvent) => {
        const { refs: rs, onRefsChange: onR, onJumpRunChange: onJ, mode: md } = latest.current;
        const p = { lat: round6(e.latlng.lat), lon: round6(e.latlng.lng) };
        if (md === 'ref' && onR) onR([...rs, { name: `Punto ${rs.length + 1}`, ...p }]);
        if (md === 'run' && onJ) {
          if (!pendingA.current) { pendingA.current = p; onJ(null); } else { onJ({ a: pendingA.current, b: p }); pendingA.current = null; }
        }
      });
      map.current = m; setReady(true);
    });
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const Lf = L.current, m = map.current, g = layer.current;
    if (!ready || !Lf || !m || !g) return;
    g.clearLayers();
    const bounds: [number, number][] = [];
    // Labels without a box (text with shadow); hidden ones show on hover or tap.
    const tip = () => ({ permanent: labels, direction: 'right' as const, offset: [10, -14] as [number, number], className: 'maplabel' });
    // Tapping a point copies its coordinates (for the door clock or a message).
    const copy = (lat: number, lon: number) => {
      const txt = `${round6(lat)}, ${round6(lon)}`;
      // The coordinates always show; "Copiado" only if the browser let it copy.
      const pop = Lf.popup({ closeButton: false, offset: [0, -8] }).setLatLng([lat, lon]).setContent(txt).openOn(m);
      navigator.clipboard?.writeText(txt).then(() => pop.setContent(`Copiado: ${txt}`), () => {});
      setTimeout(() => m.closePopup(pop), 2500);
    };
    const half = laneWidth / 2;

    for (const t of tracks) {
      if (t.lane) for (const c of corridor(t.lane.start, t.lane.ref, half, true)) Lf.polygon(c.poly, { stroke: false, fillColor: c.color, fillOpacity: c.op, interactive: false }).addTo(g);
      const all = t.pts.map((p) => [p.lat, p.lon] as [number, number]);
      bounds.push(...all);
      Lf.polyline(all, { color: '#fff', weight: 2, opacity: 0.7 }).addTo(g);
      if (t.tTop != null && t.tBot != null) {
        const win = t.pts.filter((p) => p.t >= t.tTop! && p.t <= t.tBot!).map((p) => [p.lat, p.lon] as [number, number]);
        Lf.polyline(win, { color: t.color, weight: 4 }).addTo(g).bindTooltip(t.name);
      }
      if (all.length) Lf.circleMarker(all[0], { radius: 4, color: '#fff', fillColor: t.color, fillOpacity: 1 }).addTo(g).bindTooltip(`${t.name}: inicio del track`);
    }

    let slots: [number, number][] = [];
    if (jumpRun) {
      // Planning aid: exit N flies to point N (cycling when there are more exits than points). Approximate lanes from
      // the exit; the real lane starts at the validation (2.2).
      slots = exitSlots(jumpRun, exitGap);
      const mid = { lat: (jumpRun.a.lat + jumpRun.b.lat) / 2, lon: (jumpRun.a.lon + jumpRun.b.lon) / 2 };
      if (refs.length) slots.forEach(([lat, lon], i) => {
        for (const c of corridor({ lat, lon }, refs[i % refs.length], half, false)) Lf.polygon(c.poly, { stroke: false, fillColor: c.color, fillOpacity: 0.12, interactive: false }).addTo(g);
      });
      // Direction of the jump run (a → b): arrowheads along the line and its heading.
      const pr = projector(jumpRun.a.lat, jumpRun.a.lon), k = pr(jumpRun.a.lat + 1, jumpRun.a.lon + 1), rb = pr(jumpRun.b.lat, jumpRun.b.lon);
      const len = Math.hypot(rb[0], rb[1]);
      const hdg = Math.round(((Math.atan2(rb[0], rb[1]) * 180 / Math.PI) + 360) % 360);
      Lf.polyline([[jumpRun.a.lat, jumpRun.a.lon], [jumpRun.b.lat, jumpRun.b.lon]], { color: '#fff', weight: 3, dashArray: '8 6' }).addTo(g).bindTooltip(`Pasada, rumbo ${String(hdg).padStart(3, '0')}°`);
      if (len > 1) {
        const ux = rb[0] / len, uy = rb[1] / len, back = (x: number, y: number): [number, number] => [jumpRun.a.lat + y / k[1], jumpRun.a.lon + x / k[0]];
        const size = Math.min(320, Math.max(120, len / 8));
        // One between exits 1 and 2 (the start of the run) and one past the end.
        for (const along of [Math.min(exitGap / 2, len / 2) + size / 2, len + size]) {
          const tx = ux * along, ty = uy * along;
          Lf.polygon([back(tx, ty), back(tx - ux * size - uy * size * 0.55, ty - uy * size + ux * size * 0.55), back(tx - ux * size + uy * size * 0.55, ty - uy * size - ux * size * 0.55)],
            { color: '#fff', weight: 1, fillColor: '#fff', fillOpacity: 0.95, interactive: false }).addTo(g);
        }
      }
      slots.forEach((s, i) => {
        const to = refs.length ? ` → ${refs[i % refs.length].name || `Punto ${(i % refs.length) + 1}`}` : '';
        const c = Lf.circleMarker(s, { radius: i === 0 ? 8 : 5, color: '#701968', weight: i === 0 ? 3 : 2, fillColor: '#fff', fillOpacity: 1, bubblingMouseEvents: false }).addTo(g);
        c.bindTooltip(i === 0 ? 'Salida 1' : `Salida ${i + 1}${to}`, i === 0 ? tip() : { className: 'maplabel' });
        c.on('click', () => copy(s[0], s[1]));
      });
      if (landing) Lf.polyline([[mid.lat, mid.lon], [landing.lat, landing.lon]], { color: '#fff', weight: 1, opacity: 0.8, dashArray: '2 6', interactive: false }).addTo(g);
      bounds.push([jumpRun.a.lat, jumpRun.a.lon], [jumpRun.b.lat, jumpRun.b.lon]);
    }

    refs.forEach((r, i) => {
      const label = r.name || `Punto ${i + 1}`;
      const mk = Lf.marker([r.lat, r.lon], { icon: Lf.divIcon({ className: 'refpin', iconSize: [18, 18] }), draggable: !!onRefsChange, title: label, keyboard: true }).addTo(g);
      // Horizontal distance from its exit (exit N → point N), updated while dragging.
      const text = (lat: number, lon: number) => {
        if (!slots[i]) return label;
        const q = projector(slots[i][0], slots[i][1])(lat, lon);
        return `${label} · ${(Math.hypot(q[0], q[1]) / 1000).toFixed(1).replace('.', ',')} km de la salida ${i + 1}`;
      };
      mk.on('drag', () => { const p = mk.getLatLng(); mk.setTooltipContent(text(p.lat, p.lng)); });
      mk.bindTooltip(text(r.lat, r.lon), tip());
      mk.on('click', () => copy(r.lat, r.lon));
      if (onRefsChange) mk.on('dragend', () => {
        const p = mk.getLatLng();
        onRefsChange(refs.map((x, k) => (k === i ? { ...x, lat: round6(p.lat), lon: round6(p.lng) } : x)));
      });
      bounds.push([r.lat, r.lon]);
    });

    if (landing) {
      const mk = Lf.marker([landing.lat, landing.lon], { icon: Lf.divIcon({ className: 'refpin landpin', iconSize: [18, 18] }), draggable: !!onLandingChange, title: 'Aterrizaje', keyboard: true }).addTo(g);
      mk.bindTooltip('Aterrizaje', tip());
      mk.on('click', () => copy(landing.lat, landing.lon));
      if (onLandingChange) mk.on('dragend', () => { const p = mk.getLatLng(); onLandingChange({ lat: round6(p.lat), lon: round6(p.lng) }); });
      bounds.push([landing.lat, landing.lon]);
    }

    // Frame what there is when the map opens or the tracks change, not while the user edits points.
    const key = tracks.map((t) => t.name).join('|') + '#' + fitKey;
    if (fitted.current !== key && bounds.length) m.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    fitted.current = key;
  }, [ready, refs, jumpRun, tracks, laneWidth, onRefsChange, landing, onLandingChange, exitGap, fitKey, labels]);

  return (
    <div className="stack">
      {editable && (
        <div className="row">
          <div className="seg" role="group" aria-label="Qué marca un toque en el mapa">
            <button type="button" aria-pressed={mode === 'ref'} onClick={() => setMode('ref')}>Agregar punto</button>
            <button type="button" aria-pressed={mode === 'run'} onClick={() => { setMode('run'); pendingA.current = null; }}>Marcar la pasada</button>
          </div>
          {jumpRun && <button type="button" className="secondary" onClick={() => onJumpRunChange!(null)}>Borrar la pasada</button>}
        </div>
      )}
      {editable && (
        <p className="sub small">{mode === 'ref'
          ? 'Tocá el mapa para agregar un punto de referencia; arrastralo para moverlo. El nombre y el borrado se editan en la lista.'
          : 'Tocá dónde empieza la pasada y después dónde termina. Los círculos marcan una salida cada 600 m (5.5.4).'}</p>
      )}
      {(refs.length > 0 || landing || jumpRun) && (
        <div className="row">
          <button type="button" className="secondary" aria-pressed={!labels} onClick={() => setLabels((v) => !v)}>{labels ? 'Ocultar nombres' : 'Mostrar nombres'}</button>
          <span className="sub small">Tocá un punto o una salida para copiar sus coordenadas.</span>
        </div>
      )}
      <div ref={box} className="satmap" style={{ height }} role="region" aria-label="Mapa satelital" />
    </div>
  );
}
