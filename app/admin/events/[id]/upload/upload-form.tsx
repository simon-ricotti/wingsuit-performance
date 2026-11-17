'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseTrack, scoreJump, TASKS, type JumpRecord } from '@/lib/engine';
import { eventConfig, jumpDoc, roundName, TASK_LABEL, uploadRef } from '@/lib/jumps/score';
import type { EventRow } from '@/lib/data/rows';
import { createClient } from '@/lib/supabase/browser';
import { JumpResult } from '../../../jumps/jump-result';
import { requestJumpUpload, saveJump } from './actions';

type EventInfo = Pick<EventRow, 'id' | 'cfg' | 'lane' | 'refs' | 'sep_check' | 'units' | 'mode' | 'rounds' | 'tiebreak'>;
interface Props {
  event: EventInfo;
  pilots: { id: string; name: string }[];
  existing: { pilotId: string; task: string; round: number; void: boolean }[];
}

async function gzip(file: File): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') throw new Error('Este navegador no puede comprimir el archivo. Usá una versión actual de Chrome, Firefox, Safari o Edge.');
  const bytes = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  // Typed blob: Storage takes the type from the blob itself, and the bucket only accepts gzip.
  return new Blob([bytes], { type: 'application/gzip' });
}

export function UploadForm({ event: ev, pilots: initialPilots, existing }: Props) {
  const router = useRouter();
  const [pilots, setPilots] = useState(initialPilots);
  const [pilotId, setPilotId] = useState('');
  const [newName, setNewName] = useState('');
  const [task, setTask] = useState<string>('time');
  const [round, setRound] = useState(1);
  const [refIdx, setRefIdx] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ jump: JumpRecord } | { error: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ jump: JumpRecord; replaced: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cfg = eventConfig(ev);
  const units = ev.units;
  const refs = (ev.refs ?? []) as { name: string }[];
  const tiebreak = (ev.tiebreak as { task?: string } | null)?.task ?? null;
  const name = (id: string) => pilots.find((p) => p.id === id)?.name ?? id;
  const prev = existing.find((j) => j.pilotId === pilotId && j.task === task && j.round === round);

  // Browser preview with the same engine; the server scores again when saving (official score).
  async function computePreview(f: File | null, opts = { refIdx, task, round, pilotId }) {
    setResult(null); setError(null);
    if (!f) { setPreview(null); return; }
    try {
      const parsed = parseTrack(await f.text(), f.name);
      const { ref, refIdx: ri } = uploadRef(ev, opts.refIdx);
      const sc = scoreJump(parsed.pts, cfg, ref);
      if (!sc.ok) { setPreview({ error: sc.error ?? 'No se pudo puntuar el salto.' }); return; }
      setPreview({ jump: jumpDoc(sc, { pilotId: opts.pilotId, task: opts.task, round: opts.round, refIdx: ri, device: parsed.device, fileName: f.name }) });
    } catch (e) {
      setPreview({ error: (e as Error).message });
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResult(null);
    if (!pilotId || (pilotId === '__new' && !newName.trim())) { setError('Elegí el piloto.'); return; }
    if (!file) { setError('Elegí el archivo del GPS.'); return; }
    try {
      setBusy('Comprimiendo y subiendo el archivo…');
      const gz = await gzip(file);
      const ticket = await requestJumpUpload(gz.size);
      if ('error' in ticket) { setError(ticket.error); return; }
      const up = await createClient().storage.from('originals').uploadToSignedUrl(ticket.path, ticket.token, gz, { contentType: 'application/gzip' });
      if (up.error) { setError('No pude subir el archivo. Revisá la conexión y probá de nuevo.'); return; }
      setBusy('Calculando el puntaje oficial y guardando…');
      const r = await saveJump({ eventId: ev.id, pilotId, newPilotName: newName, task, round, refIdx: ev.lane && refs.length ? refIdx : null, incomingPath: ticket.path, fileName: file.name });
      if (!r.ok) { setError(r.error); return; }
      if (pilotId === '__new') { setPilots([...pilots, { id: r.pilotId, name: newName.trim() }]); setPilotId(r.pilotId); setNewName(''); }
      setResult({ jump: r.jump, replaced: r.replaced });
      setPreview(null); setFile(null);
      (e.target as HTMLFormElement).reset();
      router.refresh(); // updates which slots already have a jump
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const roundOptions = useMemo(() => Array.from({ length: ev.rounds }, (_, i) => i + 1), [ev.rounds]);

  return (
    <div className="stack">
      <form onSubmit={onSave} className="stack">
        <div className="grid">
          <label className="field">Piloto
            <select value={pilotId} onChange={(e) => { setPilotId(e.target.value); computePreview(file, { refIdx, task, round, pilotId: e.target.value }); }}>
              <option value="">Elegí…</option>
              {pilots.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new">+ Piloto nuevo</option>
            </select>
          </label>
          {pilotId === '__new' && <label className="field">Nombre del piloto nuevo<input value={newName} onChange={(e) => setNewName(e.target.value)} /></label>}
          <div className="field">Tarea
            <div className="seg" role="group" aria-label="Tarea">
              {TASKS.map((t) => (
                <button key={t} type="button" aria-pressed={task === t}
                  onClick={() => { setTask(t); computePreview(file, { refIdx, task: t, round, pilotId }); }}>{TASK_LABEL[t]}</button>
              ))}
            </div>
          </div>
          <label className="field">Ronda
            {ev.mode === 'competition' ? (
              <select value={round} onChange={(e) => setRound(+e.target.value)}>
                {roundOptions.map((n) => <option key={n} value={n}>Ronda {n}</option>)}
                {tiebreak && <option value={0}>Salto de desempate ({TASK_LABEL[tiebreak as keyof typeof TASK_LABEL]})</option>}
              </select>
            ) : (
              <input inputMode="numeric" value={round} onChange={(e) => setRound(Math.max(0, Math.round(+e.target.value || 0)))} />
            )}
          </label>
          {ev.lane && refs.length > 0 && (
            <label className="field">Punto de referencia asignado
              <select value={refIdx} onChange={(e) => { setRefIdx(+e.target.value); computePreview(file, { refIdx: +e.target.value, task, round, pilotId }); }}>
                {refs.map((r, i) => <option key={i} value={i}>{r.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="field">Archivo del GPS (FlySight .CSV, FlySight 2 TRACK.CSV, Deep and Steep gps_*.csv, .GPX, .KML u otro CSV con hora, latitud, longitud y altura)
          <input type="file" accept=".csv,.CSV,.gpx,.kml,.txt,text/csv" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); computePreview(f); }} />
        </label>
        {ev.lane && !refs.length && <p className="note warn small">La jornada tiene el carril activado pero no hay puntos de referencia cargados: el carril no se evalúa hasta que los agregues en los ajustes.</p>}
        {prev && <p className="note warn small">{prev.void ? 'Este salto está anulado por re-salto: el archivo nuevo lo reemplaza' : `Este piloto ya tiene un salto de ${TASK_LABEL[task as keyof typeof TASK_LABEL]} en la ronda ${round}. Si cargás otro, lo reemplaza`} y el anterior queda archivado.</p>}

        {preview && 'error' in preview && <p className="error">{preview.error}</p>}
        {preview && 'jump' in preview && (
          <div className="card stack">
            <div className="row spread"><h2>Vista previa</h2><span className="pill warn">No guardado</span></div>
            <JumpResult jump={preview.jump} units={units} exitMin={cfg.exitMin} exitMax={cfg.exitMax} pilotName={name} />
            {ev.sep_check && <p className="sub small">La separación con los demás pilotos de la tanda se calcula al guardar.</p>}
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="row"><button type="submit" disabled={!!busy || !file}>{busy ?? 'Guardar salto'}</button></div>
      </form>

      {result && (
        <div className="card stack">
          <div className="row spread">
            <h2>{name(result.jump.pilotId)} · {TASK_LABEL[result.jump.task as keyof typeof TASK_LABEL]} · {roundName(+result.jump.round)}</h2>
            <span className="pill good">{result.replaced ? 'Guardado (reemplazó al anterior)' : 'Guardado'}</span>
          </div>
          <JumpResult jump={result.jump} units={units} exitMin={cfg.exitMin} exitMax={cfg.exitMax} pilotName={name} />
          <div className="row"><Link href={`/admin/events/${ev.id}`}>Ver los saltos de la jornada</Link></div>
        </div>
      )}
    </div>
  );
}
