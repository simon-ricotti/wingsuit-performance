'use client';
import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  if (state.sent) return <p>Te mandamos un enlace a <b>{state.sent}</b>. Abrilo desde este mismo navegador para entrar.</p>;
  return (
    <form action={action} className="stack">
      <label className="stack">
        Mail
        <input name="email" type="email" required autoComplete="email" placeholder="nombre@ejemplo.com" />
      </label>
      <button type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Mandarme el enlace'}</button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
