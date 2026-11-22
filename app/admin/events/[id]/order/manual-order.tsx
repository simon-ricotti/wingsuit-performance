'use client';
// Exit order typed by hand (not the FAI procedure): big up/down buttons, saved as "Manual (no oficial)".
import { useActionState, useState } from 'react';
import type { FormState } from '@/lib/admin/write';
import { eventState } from '../actions';

export function ManualOrder({ event, round, initial, names }: { event: string; round: number; initial: string[]; names: Record<string, string> }) {
  const [ids, setIds] = useState(initial);
  const [state, action, pending] = useActionState<FormState, FormData>(eventState, {});
  const move = (i: number, d: number) => setIds((a) => {
    const b = a.slice(), k = i + d;
    if (k < 0 || k >= b.length) return a;
    [b[i], b[k]] = [b[k], b[i]];
    return b;
  });
  return (
    <form action={action} className="stack">
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="op" value="order-set" />
      <input type="hidden" name="round" value={round} />
      <input type="hidden" name="ids" value={ids.join(',')} />
      <ol className="manual-order">
        {ids.map((id, i) => (
          <li key={id}>
            <span>{names[id] ?? id}</span>
            <button type="button" className="secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir a ${names[id] ?? id}`}>▲</button>
            <button type="button" className="secondary" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label={`Bajar a ${names[id] ?? id}`}>▼</button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar este orden'}</button>
        <span aria-live="polite">{state.error && <span className="error small">{state.error}</span>}</span>
      </div>
    </form>
  );
}

/** Point of one pilot in one task: a select that saves on change (5.5.5). */
export function RefPick({ event, round, task, pilot, value, refs }: { event: string; round: number; task: string; pilot: string; value: number; refs: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(eventState, {});
  return (
    <form action={action} className="refpick">
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="op" value="order-ref" />
      <input type="hidden" name="round" value={round} />
      <input type="hidden" name="task" value={task} />
      <input type="hidden" name="pilot" value={pilot} />
      {/* key: React resets the form after saving; a new key shows the saved value. */}
      <select key={value} name="ref" defaultValue={value} disabled={pending} aria-label="Punto de referencia" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {refs.map((r, i) => <option key={i} value={i}>{r}</option>)}
      </select>
      {state.error && <span className="error small">{state.error}</span>}
    </form>
  );
}
