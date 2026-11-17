'use client';
// Form for one competition-state change (tiebreak, nomination, participants, orders): see eventState.
import { useActionState, type ReactNode } from 'react';
import type { FormState } from '@/lib/admin/write';
import { eventState } from './actions';

export function StateForm({ event, op, hidden = {}, children, submit, busy = 'Guardando…', className = 'row' }:
  { event: string; op: string; hidden?: Record<string, string | number>; children?: ReactNode; submit: string; busy?: string; className?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(eventState, {});
  return (
    <form action={action} className={className}>
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="op" value={op} />
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button type="submit" disabled={pending}>{pending ? busy : submit}</button>
      <span aria-live="polite">{state.error && <span className="error small">{state.error}</span>}</span>
    </form>
  );
}
