'use client';
// Replay of a pass: legacy/src/replay.js (2D views and live board) and a copy of replay3d.js (three.js r128, window planes as wide as every flyer)
// mounted as they are. They read the engine from window.WSP and their data from window.WSApp.
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as engine from '@/lib/engine';
import type { JumpRecord, PackedTrack, RefPoint, ScoreConfig, Task } from '@/lib/engine';
import { TASK_UNIT } from '@/lib/jumps/score';
import { fmt } from '@/lib/standings/views';
import { SatMap, type MapTrack } from '@/app/ui/sat-map';
import { Celebration } from './celebration';

export interface ReplayItem { jump: JumpRecord; packed: PackedTrack; name: string; color: string; ref: RefPoint | null }

type Legacy = { Replay: { mount(): Promise<void>; toggle(): void; restart(): void; setSpeed(s: number): void; stop(): void; _R: { t: number; tMax: number } }; Replay3D?: { setMode(m: string): void } };
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

function loadThree(): Promise<void> {
  if ((window as unknown as { THREE?: unknown }).THREE) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = THREE_URL;
    s.crossOrigin = 'anonymous';
    // Without three.js the page keeps the 2D views (replay3d.js shows its own message).
    s.onload = s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

export function ReplayView({ items, task, cfg, altFt }: { items: ReplayItem[]; task: Task; cfg: ScoreConfig; altFt: boolean }) {
  // If the GPS did not record the exit or the window entry (signal lost in the plane), the track starts after them and
  // the replay could not place that flyer: it shows still at its first recorded point until the data starts.
  const tracks = useMemo(() => items.map((it) => {
    const p = engine.unpackTrack(it.packed), times = [it.jump.tExit, it.jump.tVal, it.jump.tTop].filter((t): t is number => typeof t === 'number');
    const t0 = Math.min(...times);
    return p.length && t0 < p[0].t ? { pts: [{ ...p[0], t: t0 }, ...p], late: typeof it.jump.tTop === 'number' && it.jump.tTop < p[0].t } : { pts: p, late: false };
  }), [items]);
  const pts = useMemo(() => tracks.map((t) => t.pts), [tracks]);
  const late = items.filter((_, i) => tracks[i].late).map((it) => it.name);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [sync, setSync] = useState('window');
  const [plan, setPlan] = useState('race');
  const [speed, setSpeed] = useState(4);
  const [cam, setCam] = useState('auto');
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  // Each pilot's lane as the engine measures it: from the start of validation to their point (2.2, 5.6.2).
  const mapTracks = useMemo<MapTrack[]>(() => items.map((it, i) => {
    const tVal = num(it.jump.tVal), start = tVal != null ? engine.pointAtTime(pts[i], tVal) : null;
    return { name: it.name, color: it.color, pts: pts[i], tTop: num(it.jump.tTop), tBot: num(it.jump.tBot), lane: start && it.ref ? { start, ref: it.ref } : null };
  }).filter((t, i) => !off[items[i].jump.pilotId]), [items, pts, off]);

  // Rebuilds the replay when the pilots shown, the sync or the positions change (as the previous platform does).
  useEffect(() => {
    const w = window as unknown as Legacy & { WSP: typeof engine; WSApp: unknown };
    let cancelled = false;
    w.WSP = engine;
    w.WSApp = {
      fmt, UNIT: TASK_UNIT,
      S: {
        replayItems: async () => ({
          items: items.map((it, i) => ({ jump: it.jump, pts: pts[i], name: it.name, color: it.color, ref: it.ref })).filter((it) => !off[it.jump.pilotId]),
          task, cfg, sync, plan, speed, cam, altFt,
        }),
      },
    };
    (async () => {
      await loadThree();
      await import('@/app/admin/events/[id]/replay/replay3d.js');
      await import('@/app/admin/events/[id]/replay/replay.js');
      if (!cancelled) await w.Replay.mount();
    })();
    return () => { cancelled = true; w.Replay?.stop(); };
    // speed and cam are applied live below, without rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pts, off, sync, plan, task, cfg, altFt]);

  // When the playback reaches the end, the board shows "Gana …": celebrate it once per arrival.
  const [won, setWon] = useState<{ text: string; color: string } | null>(null);
  const closeWon = useCallback(() => setWon(null), []);
  useEffect(() => {
    const board = document.getElementById('rp-board');
    if (!board) return;
    let shown = false;
    const mo = new MutationObserver(() => {
      const w = board.querySelector('.winner'), r = (window as unknown as Legacy).Replay?._R;
      if (!w) { shown = false; return; }
      if (shown || !r || r.t < r.tMax) return;
      shown = true;
      const first = board.querySelector<HTMLElement>('.lb');
      setWon({ text: w.textContent ?? '', color: first?.style.getPropertyValue('--c') || 'var(--brand)' });
    });
    mo.observe(board, { childList: true });
    return () => mo.disconnect();
  }, []);

  const R = () => (window as unknown as Legacy).Replay;
  const fullscreen = () => {
    const el = document.getElementById('rp-stage');
    if (document.fullscreenElement) document.exitFullscreen(); else el?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="stack">
      <div className="row">
        {items.map((it) => (
          <label key={it.jump.pilotId} className="chk" style={{ '--c': it.color } as React.CSSProperties}>
            <input type="checkbox" checked={!off[it.jump.pilotId]} onChange={(e) => setOff({ ...off, [it.jump.pilotId]: !e.target.checked })} />
            <i aria-hidden="true" />{it.name}
          </label>
        ))}
      </div>
      {late.length > 0 && <p className="sub small" role="status">{late.join(', ')}: el GPS no grabó la entrada a la ventana; se muestra quieto en su primer punto hasta que empiezan los datos.</p>}
      <div id="rp-stage" className="stack">
        {won && <Celebration text={won.text} color={won.color} onClose={closeWon} />}
        <div className="replay">
          <div className="view3d" id="rp-3d">
            <canvas id="cv3d" aria-label="Vista 3D de la tanda" />
            <div id="rp-labels" />
            <p className="no3d-msg">Este navegador no puede mostrar la vista 3D. Abajo tenés el perfil y la vista desde arriba.</p>
            <span className="hint3d">Arrastrá para girar · rueda para acercar</span>
          </div>
          <div className="board" id="rp-board" aria-live="off" />
        </div>
        <div className="card row ctrl">
          <button type="button" id="rp-play" onClick={() => R().toggle()}>Reproducir</button>
          <button type="button" onClick={() => R().restart()}>Reiniciar</button>
          <span className="clock" id="rp-clock">0,0 s</span>
          <input type="range" id="rp-seek" min={0} max={1000} defaultValue={0} aria-label="Posición" />
          <div className="seg" role="group" aria-label="Velocidad">
            {[1, 2, 4, 8].map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} onClick={() => { setSpeed(s); R().setSpeed(s); }}>×{s}</button>
            ))}
          </div>
          <button type="button" onClick={fullscreen}>Pantalla completa</button>
          <label className="field">Cámara
            <select value={cam} onChange={(e) => { setCam(e.target.value); (window as unknown as Legacy).Replay3D?.setMode(e.target.value); }}>
              <option value="auto">Automática</option><option value="behind">Desde atrás</option><option value="side">De costado</option><option value="top">Desde arriba</option>
            </select>
          </label>
          <label className="field">Sincronizar
            <select value={sync} onChange={(e) => setSync(e.target.value)}>
              <option value="window">Entrada a la ventana</option><option value="exit">Salida del avión</option><option value="real">Hora real del GPS</option>
            </select>
          </label>
          <label className="field">Posiciones
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="race">Carrera: carriles superpuestos</option><option value="real">Posición real (norte arriba)</option>
            </select>
          </label>
        </div>
      </div>
      <div className="twoup">
        <canvas id="cvProfile" aria-label="Perfil del vuelo" />
        <canvas id="cvPlan" aria-label="Vista desde arriba" />
      </div>
      <h3>Sobre el terreno</h3>
      <SatMap tracks={mapTracks} refs={[...new Map(items.filter((it) => it.ref).map((it) => [`${it.ref!.lat},${it.ref!.lon}`, it.ref!])).values()]} laneWidth={cfg.laneWidth} height={480} />
      <p className="sub small">{items.some((it) => it.ref)
        ? `Cada color es un piloto (la ventana, más gruesa). Franjas de su carril: ${cfg.laneWidth} m (celeste), −10 % (amarilla), −20 % (naranja) y −50 % (roja), FAI 5.6.2.`
        : 'Sin puntos de referencia asignados no hay carriles para mostrar: se ven solo los tracks.'}</p>
    </div>
  );
}
