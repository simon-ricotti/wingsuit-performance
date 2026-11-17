'use client';
import { useActionState } from 'react';
import type { FormState } from '@/lib/admin/write';
import { setTaskValidation } from './actions';

export interface Slot { key: string; label: string; done: number; live: number; voided: number; validatedBy: string | null }

function SlotRow({ event, s }: { event: string; s: Slot }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setTaskValidation, {});
  const ready = s.live > 0 && s.done === s.live;
  return (
    <form action={action} className="slot">
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="slot" value={s.key} />
      <input type="hidden" name="validate" value={s.validatedBy == null ? '1' : '0'} />
      <b>{s.label}</b>
      <span className="small muted">{s.done} de {s.live} revisados{s.voided ? `, ${s.voided} anulado${s.voided > 1 ? 's' : ''}` : ''}</span>
      {s.validatedBy != null
        ? <><span className="pill good">Validada por {s.validatedBy || 'sin nombre'}</span><button type="submit" disabled={pending}>Reabrir</button></>
        : <><span className="pill warn">Provisoria</span><button type="submit" disabled={pending || !ready} title={ready ? undefined : 'Faltan saltos por revisar'}>Validar tarea</button></>}
      <span aria-live="polite">{state.error && <span className="error small">{state.error}</span>}</span>
    </form>
  );
}

export function TaskValidation({ event, slots }: { event: string; slots: Slot[] }) {
  return (
    <section className="stack">
      <h2>Validación de tareas</h2>
      <p className="sub small">Una tarea se valida cuando todos sus saltos están revisados (FAI 5.4.2). Hasta entonces, sus resultados son provisorios.</p>
      <div className="slots">{slots.map((s) => <SlotRow key={s.key} event={event} s={s} />)}</div>
    </section>
  );
}
