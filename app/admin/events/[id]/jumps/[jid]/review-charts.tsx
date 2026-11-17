'use client';
// Lane map and vertical speed / GPS accuracy charts: legacy/src/review.js mounted as is.
import { useEffect } from 'react';
import * as engine from '@/lib/engine';
import type { JumpRecord, PackedTrack, RefPoint, ScoreConfig } from '@/lib/engine';

interface Props { eventId: string; jid: string; jump: JumpRecord; cfg: ScoreConfig; refPoint: RefPoint | null; track: PackedTrack | null; laneShift: number }

export function ReviewCharts({ eventId, jid, jump, cfg, refPoint, track, laneShift }: Props) {
  useEffect(() => {
    const w = window as unknown as { WSP: typeof engine; Review?: { mount: (...a: unknown[]) => void } };
    w.WSP = engine;
    let redraw = () => {};
    import('@/legacy/src/review.js').then(() => {
      redraw = () => w.Review!.mount({ id: eventId }, jump, cfg, refPoint, cfg.laneWidth, async () => (track ? engine.unpackTrack(track) : null), jid);
      redraw();
      window.addEventListener('resize', redraw);
    });
    return () => window.removeEventListener('resize', redraw);
  }, [eventId, jid, jump, cfg, refPoint, track]);

  return (
    <div className="rvgrid">
      <div className="stack">
        <h3>Carril y trayectoria</h3>
        <canvas id="rv-map" aria-label="Mapa del salto con el carril" />
        <p className="sub small" id="rv-msg">{refPoint
          ? 'Punto rojo: máximo desvío, medido en ángulo recto al eje. Franjas: dentro del carril, −10 %, −20 % y −50 %.'
          : 'Sin carril: la jornada no lo evalúa o el salto no tiene punto de referencia asignado.'}</p>
      </div>
      <div className="stack">
        <h3>Salida, validación y precisión</h3>
        <canvas id="rv-charts" aria-label="Velocidad vertical y precisión del GPS" />
        <p className="sub small">El carril empieza {String(9 + laneShift).replace('.', ',')} s después de llegar a 10 m/s de caída. Franja celeste: validación; naranja: ventana.</p>
      </div>
    </div>
  );
}
