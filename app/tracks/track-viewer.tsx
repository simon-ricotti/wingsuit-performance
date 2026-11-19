'use client';
// Loose tracks, outside any event: everything runs in the browser with the same engine (nothing is uploaded).
// To keep a jump in the pilot's history and the ranking, it is uploaded to an open free event from /account.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import * as engine from '@/lib/engine';
import { DEFAULT_CFG, type RefPoint, type Task, type TrackPoint } from '@/lib/engine';
import { jumpDoc, TASK_LABEL } from '@/lib/jumps/score';
import { JumpResult } from '@/app/admin/jumps/jump-result';
import { ReplayView, type ReplayItem } from '@/app/admin/events/[id]/replay/replay-view';
import { SatMap, type MapTrack } from '@/app/ui/sat-map';

// Colors of the replay (one per track).
const COLORS = ['#d9480f', '#0b7f86', '#6f42c1', '#2f6fde', '#c2255c', '#5c7c00', '#a15c00', '#0f7a52', '#7a4b2a', '#495867'];
const MAX_FILES = 10;
const num = (v: unknown) => (typeof v === 'number' ? v : null);

interface Loaded { id: string; name: string; device: string; pts: TrackPoint[] | null; error?: string }

export function TrackViewer() {
  const [files, setFiles] = useState<Loaded[]>([]);
  const [elev, setElev] = useState('26');
  const [task, setTask] = useState<Task>('distance');
  const [ref, setRef] = useState<RefPoint | null>(null);
  const [reading, setReading] = useState(false);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setReading(true);
    const next = await Promise.all([...list].slice(0, MAX_FILES).map(async (f, i): Promise<Loaded> => {
      try {
        const p = engine.parseTrack(await f.text(), f.name);
        return { id: `${Date.now()}-${i}`, name: f.name.replace(/\.[^.]+$/, ''), device: p.device, pts: p.pts };
      } catch (e) {
        return { id: `${Date.now()}-${i}`, name: f.name, device: '', pts: null, error: (e as Error).message };
      }
    }));
    setFiles((cur) => [...cur, ...next].slice(-MAX_FILES));
    setReading(false);
  }

  const elevM = parseFloat(elev.replace(',', '.'));
  const cfg = useMemo(() => ({ ...DEFAULT_CFG, elev: isFinite(elevM) ? elevM : DEFAULT_CFG.elev }), [elevM]);

  // Every track scored as a jump of the chosen task in one round: % of the best, as in a round (5.10.2).
  const scored = useMemo(() => {
    const out = files.map((f, i) => {
      if (!f.pts) return { f, i, error: f.error ?? 'No se pudo leer el archivo.' };
      const sc = engine.scoreJump(f.pts, cfg, ref);
      if (!sc.ok) return { f, i, error: sc.error ?? 'No se pudo puntuar el salto.' };
      const jump = jumpDoc(sc, { pilotId: f.id, task, round: 1, device: f.device, fileName: f.name });
      return { f, i, sc, jump, trimmed: engine.trimTrack(f.pts, sc) };
    });
    engine.standings(out.flatMap((x) => ('jump' in x && x.jump ? [x.jump] : [])));
    return out;
  }, [files, cfg, ref, task]);

  const ok = scored.flatMap((x) => ('jump' in x && x.jump ? [{ ...x, jump: x.jump, sc: x.sc!, trimmed: x.trimmed! }] : []));
  const items = useMemo<ReplayItem[]>(() => ok.map((x) => ({
    jump: x.jump, packed: engine.packTrack(x.trimmed), name: x.f.name, color: COLORS[x.i % COLORS.length], ref,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [scored]);
  const mapTracks = useMemo<MapTrack[]>(() => ok.map((x) => {
    const tVal = num(x.jump.tVal), start = tVal != null ? engine.pointAtTime(x.trimmed, tVal) : null;
    return { name: x.f.name, color: COLORS[x.i % COLORS.length], pts: x.trimmed, tTop: num(x.jump.tTop), tBot: num(x.jump.tBot), lane: start && ref ? { start, ref } : null };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [scored]);

  return (
    <div className="stack">
      <div className="card stack">
        <label className="field">Archivos de GPS (FlySight, FlySight 2, Deep and Steep, GPX, KML o CSV; hasta {MAX_FILES})
          <input type="file" multiple accept=".csv,.CSV,.gpx,.kml,.txt" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
        <div className="grid">
          <label className="field">Elevación del DZ (m sobre el nivel del mar)
            <input inputMode="decimal" value={elev} onChange={(e) => setElev(e.target.value)} />
          </label>
          <label className="field">Tarea para comparar
            <select value={task} onChange={(e) => setTask(e.target.value as Task)}>
              {engine.TASKS.map((t) => <option key={t} value={t}>{TASK_LABEL[t]}</option>)}
            </select>
          </label>
        </div>
        <p className="sub small">La ventana es la de la FAI: de {DEFAULT_CFG.top} a {DEFAULT_CFG.bottom} m sobre la elevación del DZ (2.2). AVA está a 26 m. Los archivos no se suben: se leen y se puntúan en este navegador.</p>
        {reading && <p className="sub small" role="status">Leyendo…</p>}
      </div>

      {files.length > 0 && (
        <>
          <h2>Sobre el terreno</h2>
          <SatMap tracks={mapTracks} refs={ref ? [ref] : []} onRefsChange={(r) => { const last = r[r.length - 1]; setRef(last ? { ...last, name: 'Punto de referencia' } : null); }} laneWidth={cfg.laneWidth} />
          <div className="row">
            <p className="sub small" style={{ margin: 0 }}>{ref
              ? 'Con un punto de referencia se mide el carril de cada salto, como en competencia (2.2, 5.6.2).'
              : 'Opcional: tocá el mapa para poner un punto de referencia y medir el carril de cada salto.'}</p>
            {ref && <button type="button" className="secondary" onClick={() => setRef(null)}>Quitar el punto</button>}
          </div>

          <h2>Métricas</h2>
          {scored.map((x) => (
            <section key={x.f.id} className="card stack">
              <div className="row spread">
                <h3 style={{ margin: 0 }}><span className="chk" style={{ '--c': COLORS[x.i % COLORS.length], minHeight: 0 } as React.CSSProperties}><i aria-hidden="true" />{x.f.name}</span></h3>
                <button type="button" className="secondary" onClick={() => setFiles(files.filter((f) => f.id !== x.f.id))}>Quitar</button>
              </div>
              {'jump' in x && x.jump ? (
                <>
                  <JumpResult jump={x.jump} units="m" exitMin={cfg.exitMin} exitMax={cfg.exitMax} pilotName={() => ''} />
                  {ok.length > 1 && <p className="sub small" style={{ margin: 0 }}>{TASK_LABEL[task]}: {engine.es(+(x.jump._points ?? 0).toFixed(1))} % del mejor de los cargados.</p>}
                </>
              ) : <p className="error">{x.error}</p>}
            </section>
          ))}

          {items.length > 0 && (
            <>
              <h2>Replay</h2>
              <ReplayView key={items.map((it) => it.jump.pilotId).join() + task + (ref ? `${ref.lat},${ref.lon}` : '')} items={items} task={task} cfg={cfg} altFt={false} />
            </>
          )}

          <p className="note">¿Querés que un salto quede en tu historial y cuente para el ranking? Cargalo en una jornada libre abierta desde <Link href="/account">Mi panel</Link>.</p>
        </>
      )}
    </div>
  );
}
