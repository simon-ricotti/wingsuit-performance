'use client';
import { useActionState } from 'react';
import { recalcEvent } from '../actions';
import type { FormState } from '@/lib/admin/write';

export function RecalcButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recalcEvent, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={id} />
      {state.error && <p className="error">{state.error}</p>}
      {state.saved && !pending && <p className="ok">Se recalcularon {state.rescored} saltos.</p>}
      <div className="row"><button type="submit" disabled={pending}>{pending ? 'Recalculando…' : 'Recalcular todos los saltos'}</button></div>
    </form>
  );
}
