'use client';
import { useActionState } from 'react';
import { setUserAccess } from './actions';
import { ROLE_LABEL, ROLES } from '@/lib/auth/roles';
import type { AppRole } from '@/lib/auth/session';
import type { FormState } from '@/lib/admin/write';

export interface UserItem { id: string; email: string; lastSignIn: string | null; displayName: string; role: AppRole; pilotId: string | null }

export function UserRow({ user, pilots, isMe }: { user: UserItem; pilots: { id: string; name: string; taken: boolean }[]; isMe: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setUserAccess, {});
  return (
    <form action={action} className="card stack">
      <input type="hidden" name="user" value={user.id} />
      <div className="row spread">
        <b>{user.email}{isMe && ' (vos)'}</b>
        <span className="sub small">{user.lastSignIn ? `Último ingreso: ${new Date(user.lastSignIn).toLocaleDateString('es-AR')}` : 'Nunca ingresó'}</span>
      </div>
      <div className="grid">
        <label className="field">Nombre (se usa en las firmas y el historial)<input name="displayName" defaultValue={user.displayName} /></label>
        <label className="field">Rol
          <select name="role" defaultValue={user.role}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="field">Piloto vinculado
          <select name="pilot" defaultValue={user.pilotId ?? ''}>
            <option value="">Ninguno</option>
            {pilots.map((p) => <option key={p.id} value={p.id} disabled={p.taken && p.id !== user.pilotId}>{p.name}{p.taken && p.id !== user.pilotId ? ' (ya vinculado)' : ''}</option>)}
          </select>
        </label>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {state.saved && !pending && <p className="ok">Guardado.</p>}
      <div className="row"><button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  );
}
