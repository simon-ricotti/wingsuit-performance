'use client';
import { useActionState, useState } from 'react';
import type { FormState } from '@/lib/admin/write';
import { clearReviews, correctLaneStart, deleteJump, saveDecisions, signReview } from './actions';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const Hidden = ({ event, jump }: { event: string; jump: string }) => (<><input type="hidden" name="event" value={event} /><input type="hidden" name="jump" value={jump} /></>);

function Feedback({ state, pending, ok }: { state: FormState; pending: boolean; ok: string }) {
  return (
    <div aria-live="polite">
      {state.error && <p className="error">{state.error}</p>}
      {state.saved && !pending && <p className="ok">{ok}</p>}
    </div>
  );
}

function useForm(action: Action) { return useActionState<FormState, FormData>(action, {}); }

export interface DecisionValues {
  flagged: boolean; flagLabel: string; flag: string;
  lane: { show: boolean; label: string; value: string; shift: string; refs: string[]; refIdx: string };
  sep: { show: boolean; label: string; value: string };
  exit: { show: boolean; label: string; value: string };
  manual: string; notes: string;
}

export function DecisionsForm({ event, jump, v }: { event: string; jump: string; v: DecisionValues }) {
  const [state, action, pending] = useForm(saveDecisions);
  const [laneState, laneAction, lanePending] = useForm(correctLaneStart);
  return (
    <div className="stack">
      <form action={action} className="stack">
        <Hidden event={event} jump={jump} />
        <div className="grid">
          {v.flagged && (
            <label className="field">GPS o salida fuera de norma
              <select name="flag" defaultValue={v.flag}>
                <option value="">{v.flagLabel}</option>
                <option value="accept">Validar el salto</option>
                <option value="rejump">Conceder re-salto (anula este salto)</option>
              </select>
            </label>
          )}
          {v.lane.show && (
            <label className="field">{v.lane.label}
              <select name="lane" defaultValue={v.lane.value}>
                <option value="">Usar la propuesta</option>
                {[0, 10, 20, 50].map((n) => <option key={n} value={n}>{n ? `${n} %` : 'Sin penalidad'}</option>)}
              </select>
            </label>
          )}
          {v.sep.show && (
            <label className="field">{v.sep.label}
              <select name="sep" defaultValue={v.sep.value}>
                <option value="">Pendiente (se aplica el cero)</option>
                <option value="yes">Aplicar el cero a este piloto</option>
                <option value="no">No aplicar a este piloto</option>
              </select>
            </label>
          )}
          {v.exit.show && (
            <label className="field">{v.exit.label}
              <select name="exit" defaultValue={v.exit.value}>
                <option value="0">Sin observaciones</option>
                <option value="50">Fuera de tiempo, sin justificar: −50 %</option>
                <option value="100">Reincidencia: −100 %</option>
              </select>
            </label>
          )}
          <label className="field">Penalidad total fijada a mano
            <select name="manual" defaultValue={v.manual}>
              <option value="">No: usar las decisiones</option>
              {[0, 10, 20, 50, 100].map((n) => <option key={n} value={n}>{n === 100 ? 'Cero' : n ? `${n} %` : 'Sin penalidad'}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Notas del juez<textarea name="notes" rows={2} defaultValue={v.notes} /></label>
        <Feedback state={state} pending={pending} ok="Decisiones guardadas." />
        <div className="row">
          <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar decisiones'}</button>
          <span className="sub small">Si cambiás una decisión, se borran las firmas de revisión de este salto.</span>
        </div>
      </form>
      {(v.lane.show || v.lane.refs.length > 0) && (
        <form action={laneAction} className="stack">
          <Hidden event={event} jump={jump} />
          <div className="row">
            {v.lane.refs.length > 0 && (
              <label className="field">Punto de referencia asignado (5.5.5)
                <select name="ref" defaultValue={v.lane.refIdx}>
                  {v.lane.refIdx === '' && <option value="">Sin asignar</option>}
                  {v.lane.refs.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </label>
            )}
            <label className="field">Corrección del inicio del carril (s, entre −5 y +5)
              <input name="shift" inputMode="decimal" defaultValue={v.lane.shift} style={{ width: 90 }} autoComplete="off" />
            </label>
            <button type="submit" disabled={lanePending}>{lanePending ? 'Recalculando…' : 'Recalcular carril'}</button>
          </div>
          <Feedback state={laneState} pending={lanePending} ok="Carril recalculado." />
        </form>
      )}
    </div>
  );
}

export function SignForms({ event, jump, canSign, hasReviews }: { event: string; jump: string; canSign: boolean; hasReviews: boolean }) {
  const [state, action, pending] = useForm(signReview);
  const [cState, cAction, cPending] = useForm(clearReviews);
  return (
    <div className="stack">
      <div className="row">
        <form action={action}><Hidden event={event} jump={jump} />
          <button type="submit" disabled={pending || !canSign}>{pending ? 'Firmando…' : 'Firmar revisión'}</button></form>
        {hasReviews && <form action={cAction}><Hidden event={event} jump={jump} />
          <button type="submit" className="secondary" disabled={cPending}>{cPending ? 'Borrando…' : 'Borrar firmas'}</button></form>}
      </div>
      <Feedback state={state} pending={pending} ok="Revisión firmada." />
      <Feedback state={cState} pending={cPending} ok="Firmas borradas." />
    </div>
  );
}

export function DeleteJump({ event, jump }: { event: string; jump: string }) {
  const [state, action, pending] = useForm(deleteJump);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="danger" onClick={() => setOpen(true)}>Borrar salto…</button>;
  return (
    <form action={action} className="row">
      <Hidden event={event} jump={jump} />
      <span>Se borra el salto. Queda en el archivo con su track y su original.</span>
      <button type="submit" className="danger" disabled={pending}>{pending ? 'Borrando…' : 'Sí, borrar este salto'}</button>
      <button type="button" onClick={() => setOpen(false)} disabled={pending}>Cancelar</button>
      <Feedback state={state} pending={pending} ok="" />
    </form>
  );
}

/** Compares a file's SHA-256 with the stored one, in the browser (nothing is uploaded). */
export function VerifyFile({ hash }: { hash: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function check(f: File | undefined) {
    if (!f) return;
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
    setMsg(h === hash
      ? { ok: true, text: `${f.name} es idéntico al archivo de este salto.` }
      : { ok: false, text: `${f.name} no coincide: su huella es ${h.slice(0, 16)}…, la del salto ${hash.slice(0, 16)}…` });
  }
  return (
    <div className="stack">
      <label className="field">Verificar un archivo (se compara su huella, no se sube)
        <input type="file" accept=".csv,.CSV,.gpx,.kml,.txt" onChange={(e) => check(e.target.files?.[0])} />
      </label>
      <p aria-live="polite" className={msg ? (msg.ok ? 'ok' : 'error') : ''}>{msg?.text}</p>
    </div>
  );
}
