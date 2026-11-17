'use client';
import { useActionState, useState } from 'react';
import { deleteEvent } from '../../actions';
import type { FormState } from '@/lib/admin/write';

// Two-step delete on the page itself (no browser confirm dialog).
export function DeleteEvent({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteEvent, {});
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="danger" onClick={() => setOpen(true)}>Borrar…</button>;
  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={id} />
      <p>Se borra <b>{name}</b>. Queda una copia en el archivo y el registro en el historial.</p>
      <label className="field">Motivo (opcional)<input name="reason" /></label>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button type="submit" className="danger" disabled={pending}>{pending ? 'Borrando…' : 'Sí, borrar la jornada'}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending}>Cancelar</button>
      </div>
    </form>
  );
}
