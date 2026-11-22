'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { saveEvent } from './actions';
import { DOOR_LABELS, JUDGING_PROFILES, metresToFeet, parseRefs, toMetres, type EventFormValues, type Judging } from '@/lib/events/settings';
import type { RefPoint } from '@/lib/engine';
import { SatMap } from '@/app/ui/sat-map';
import { PLAN_KEY } from '@/app/jump-run/planner';
import type { JumpRun } from '@/lib/data/rows';
import type { FormState } from '@/lib/admin/write';

const ALT_FIELDS = ['elev', 'top', 'bottom', 'exitMin', 'exitMax'] as const;

export function EventForm({ initial, jumps }: { initial: EventFormValues; jumps: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEvent, {});
  const [units, setUnits] = useState(initial.units);
  const [alts, setAlts] = useState(() => Object.fromEntries(ALT_FIELDS.map((k) => [k, initial[k]])) as Record<(typeof ALT_FIELDS)[number], string>);
  const [judging, setJudging] = useState<Judging>(initial.judging);
  const [refsText, setRefsText] = useState(initial.refs);
  const [jumpRun, setJumpRun] = useState(initial.jumpRun);
  const [laneWidth, setLaneWidth] = useState(initial.laneWidth);
  const laneM = Number(laneWidth) >= 100 ? Number(laneWidth) : 600; // for the map while it is being typed
  // The list is the source of truth; while a line is half typed the map keeps the last valid points.
  const lastRefs = useRef<RefPoint[]>([]);
  const mapRefs = useMemo(() => { try { lastRefs.current = parseRefs(refsText); } catch { /* keep last */ } return lastRefs.current; }, [refsText]);
  const fromMap = (r: RefPoint[]) => setRefsText(r.map((x) => `${x.name}, ${x.lat}, ${x.lon}`).join('\n'));
  const u = units === 'ft' ? 'ft' : 'm';
  // The last plan from /jump-run in this browser, if any.
  const [fit, setFit] = useState(0); // reframe the map after bringing the plan in
  const [plan, setPlan] = useState<{ jumpRun: JumpRun | null; refs: RefPoint[] } | null>(null);
  useEffect(() => { try { const p = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null'); if (p?.jumpRun) setPlan(p); } catch { /* none */ } }, []);

  // Switching units converts the typed altitudes, as the previous platform does.
  function changeUnits(next: 'm' | 'ft') {
    setAlts((a) => Object.fromEntries(ALT_FIELDS.map((k) => {
      const v = parseFloat(a[k].replace(',', '.'));
      if (!isFinite(v)) return [k, a[k]];
      const m = toMetres(v, units === 'ft');
      return [k, String(next === 'ft' ? metresToFeet(m) : m)];
    })) as typeof alts);
    setUnits(next);
  }

  function changeProfile(p: Judging['profile']) {
    setJudging((j) => (p === 'custom' ? { ...j, profile: p } : { ...JUDGING_PROFILES[p], profile: p }));
  }
  const setJ = <K extends keyof Judging>(k: K, v: Judging[K]) => setJudging((j) => ({ ...j, [k]: v, profile: 'custom' }));

  const alt = (k: (typeof ALT_FIELDS)[number], label: string) => (
    <label className="field">{label} ({u}{k === 'elev' ? ' sobre el nivel del mar' : ' AGL'})
      <input name={k} inputMode="decimal" value={alts[k]} onChange={(e) => setAlts({ ...alts, [k]: e.target.value })}
        required={k === 'elev'} />
    </label>
  );

  return (
    <form action={action} className="stack">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid">
        <label className="field">Nombre<input name="name" defaultValue={initial.name} required /></label>
        <label className="field">Fecha<input name="date" type="date" defaultValue={initial.date} /></label>
        <label className="field">Zona de salto<input name="dz" defaultValue={initial.dz} placeholder="AVA, Alvear" /></label>
        <label className="field">Modo
          <select name="mode" defaultValue={initial.mode}>
            <option value="free">Libre: se carga cualquier salto</option>
            <option value="competition">Competencia: rondas fijas de 3 tareas</option>
          </select>
        </label>
        <label className="field">Rondas (modo competencia)<input name="rounds" inputMode="numeric" defaultValue={initial.rounds} /></label>
        <label className="field">Integrantes por equipo (FAI 8.4: 3)<input name="teamSize" inputMode="numeric" defaultValue={initial.teamSize} /></label>
        <Select name="pilotUploads" label="Carga de saltos por los pilotos" initial={initial.pilotUploads ? '1' : '0'}
          options={[['0', 'Solo jueces y organizador'], ['1', 'Cada piloto puede cargar los suyos']]} />
      </div>

      <h2>Puntaje</h2>
      {jumps > 0 && (
        <p className="note">La jornada tiene {jumps} saltos: si cambiás la elevación, la ventana, la salida, el carril, la separación o los
          puntos de referencia, al guardar se recalculan todos con los ajustes nuevos (queda en el historial).</p>
      )}
      <div className="grid">
        <label className="field">Unidad de las alturas
          <select name="units" value={units} onChange={(e) => changeUnits(e.target.value as 'm' | 'ft')}>
            <option value="m">Metros</option>
            <option value="ft">Pies</option>
          </select>
        </label>
        {alt('elev', 'Elevación del DZ')}
        {alt('top', 'Ventana: límite superior')}
        {alt('bottom', 'Ventana: límite inferior')}
        {alt('exitMin', 'Salida mínima')}
        {alt('exitMax', 'Salida máxima')}
        <Select name="lane" label="Carril designado" initial={initial.lane ? '1' : '0'}
          options={[['1', 'Aplicar penalidades de carril'], ['0', 'No evaluar carril']]} />
        <label className="field">Ancho del carril (m, FAI: 600)
          <input name="laneWidth" inputMode="numeric" value={laneWidth} onChange={(e) => setLaneWidth(e.target.value)} />
        </label>
        <Select name="sepCheck" label="Separación entre competidores" initial={initial.sepCheck ? '1' : '0'}
          options={[['1', 'Cero si pasan a menos de 150 m'], ['0', 'No evaluar']]} />
      </div>
      <label className="field">Puntos de referencia en tierra, uno por línea: nombre, latitud, longitud
        <textarea name="refs" rows={3} value={refsText} onChange={(e) => setRefsText(e.target.value)} placeholder="Norte, -33.0124, -60.6400" />
      </label>
      <input type="hidden" name="jumpRun" value={jumpRun ? [jumpRun.a.lat, jumpRun.a.lon, jumpRun.b.lat, jumpRun.b.lon].join(',') : ''} />
      <div className="row">
        {plan && <button type="button" className="secondary" onClick={() => { setJumpRun(plan.jumpRun); setFit((f) => f + 1); }}>Usar la pasada del planificador</button>}
        {plan && plan.refs.length > 0 && <button type="button" className="secondary" onClick={() => { fromMap(plan.refs); setFit((f) => f + 1); }}>Usar sus {plan.refs.length} puntos</button>}
        <Link href="/jump-run" className="small">Calcular la pasada con el viento</Link>
      </div>
      <SatMap refs={mapRefs} onRefsChange={fromMap} jumpRun={jumpRun} onJumpRunChange={setJumpRun} laneWidth={laneM} fitKey={String(fit)} />
      <p className="sub small">La pasada es solo para planificar: no cambia el puntaje. Las franjas celestes muestran un carril aproximado de {laneM} m desde cada salida a su punto (la salida 1 al punto 1, la 2 al 2, y así); el carril real de cada salto empieza al inicio de la validación (FAI 2.2).</p>
      <p className="sub small">Las penalidades de carril son las de la FAI (5.6.2), medidas desde el borde del carril: hasta 150 m afuera −10 %, de 150 a 300 m −20 % y más de 300 m −50 %. Con un carril de {laneM} m: sin penalidad hasta {laneM / 2} m del eje, −10 % hasta {laneM / 2 + 150} m, −20 % hasta {laneM / 2 + 300} m y −50 % más allá.</p>
      <p className="sub small">La elevación del DZ define la altura sobre el suelo (FAI 2.1 y 2.2). Los valores por defecto son los del reglamento
        FAI 2026. La unidad elegida se usa para cargar y mostrar las alturas de esta jornada; los resultados siguen en segundos, metros y km/h.</p>

      <h2>Juzgamiento</h2>
      <div className="grid">
        <label className="field">Perfil
          <select name="profile" value={judging.profile} onChange={(e) => changeProfile(e.target.value as Judging['profile'])}>
            <option value="arg">{JUDGING_PROFILES.arg.label}</option>
            <option value="fai">{JUDGING_PROFILES.fai.label}</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label className="field">Revisiones para validar un salto
          <select name="reviews" value={judging.reviews} onChange={(e) => setJ('reviews', +e.target.value as 1 | 2)}>
            <option value="1">Una (un juez)</option>
            <option value="2">Dos (dos jueces, como FAI 7.1.2)</option>
          </select>
        </label>
        <label className="field">Control de salidas
          <select name="door" value={judging.door} onChange={(e) => setJ('door', e.target.value as Judging['door'])}>
            {Object.entries(DOOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">GPS de menos de 5 Hz o SEP de 10 m o más
          <select name="gpsRule" value={judging.gpsRule} onChange={(e) => setJ('gpsRule', e.target.value as Judging['gpsRule'])}>
            <option value="rejump">El juez decide: validar o re-salto (FAI)</option>
            <option value="warn">Solo aviso, se puntúa igual</option>
          </select>
        </label>
        <label className="field">Salida fuera del rango permitido
          <select name="exitRule" value={judging.exitRule} onChange={(e) => setJ('exitRule', e.target.value as Judging['exitRule'])}>
            <option value="rejump">El juez decide: validar o re-salto (FAI)</option>
            <option value="warn">Solo aviso, se puntúa igual</option>
          </select>
        </label>
      </div>

      {state.error && <p className="error">{state.error}</p>}
      {state.saved && !pending && <p className="ok">Cambios guardados{state.rescored ? ` y ${state.rescored} saltos recalculados` : ''}.</p>}
      <div className="row"><button type="submit" disabled={pending}>{pending ? 'Guardando…' : initial.id ? 'Guardar cambios' : 'Crear jornada'}</button></div>
    </form>
  );
}

function Select({ name, label, initial, options }: { name: string; label: string; initial: string; options: [string, string][] }) {
  return (
    <label className="field">{label}
      <select name={name} defaultValue={initial}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}
