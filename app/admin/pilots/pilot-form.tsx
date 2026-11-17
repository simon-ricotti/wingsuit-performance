'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { deletePilot, savePilot } from './actions';
import type { FormState } from '@/lib/admin/write';

export interface PilotValues { id: string | null; name: string; suit: string; gender: 'F' | ''; team: string }

export function PilotForm({ initial }: { initial: PilotValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePilot, {});
  const ref = useRef<HTMLFormElement>(null);
  // A new pilot form clears itself after saving, to add the next one.
  useEffect(() => { if (state.saved && !initial.id) ref.current?.reset(); }, [state, initial.id]);
  return (
    <form ref={ref} action={action} className="stack">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid">
        <label className="field">Nombre<input name="name" defaultValue={initial.name} required /></label>
        <label className="field">Traje<input name="suit" defaultValue={initial.suit} /></label>
        <label className="field">Categoría
          <select name="gender" defaultValue={initial.gender}>
            <option value="">General</option>
            <option value="F">Femenina</option>
          </select>
        </label>
        <label className="field">Equipo o club<input name="team" defaultValue={initial.team} /></label>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {state.saved && !pending && <p className="ok">{initial.id ? 'Cambios guardados.' : 'Piloto agregado.'}</p>}
      <div className="row"><button type="submit" disabled={pending}>{pending ? 'Guardando…' : initial.id ? 'Guardar cambios' : 'Agregar piloto'}</button></div>
    </form>
  );
}

export function DeletePilot({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deletePilot, {});
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="danger" onClick={() => setOpen(true)}>Borrar…</button>;
  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={id} />
      <p>Se borra <b>{name}</b>. Queda una copia en el archivo y el registro en el historial.</p>
      <label className="field">Motivo (opcional)<input name="reason" /></label>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button type="submit" className="danger" disabled={pending}>{pending ? 'Borrando…' : 'Sí, borrar el piloto'}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending}>Cancelar</button>
      </div>
    </form>
  );
}
