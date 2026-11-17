import Link from 'next/link';
import { requireRole, type AppRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { UserRow, type UserItem } from './user-row';

export const metadata = { title: 'Usuarios y roles · Wingsuit Performance' };

export default async function UsersPage() {
  const s = await requireRole('admin');
  // Emails live in auth.users, which only the secret key can read; the role check above comes first.
  const admin = createAdminClient();
  const [{ data: list }, { data: profiles }, { data: pilots }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('profiles').select('id, display_name, role, pilot_id'),
    admin.from('pilots').select('id, name').order('name'),
  ]);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const taken = new Set((profiles ?? []).map((p) => p.pilot_id).filter(Boolean));
  const users: UserItem[] = (list?.users ?? [])
    .filter((u) => byId.has(u.id))
    .map((u) => {
      const p = byId.get(u.id)!;
      return { id: u.id, email: u.email ?? '', lastSignIn: u.last_sign_in_at ?? null, displayName: p.display_name, role: p.role as AppRole, pilotId: p.pilot_id };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
  const pilotOptions = (pilots ?? []).map((p) => ({ id: p.id as string, name: p.name as string, taken: taken.has(p.id) }));

  return (
    <main>
      <p><Link href="/admin">← Administración</Link></p>
      <h1>Usuarios y roles</h1>
      <p className="sub">
        Cualquiera puede entrar con su mail por <b>/login</b> y queda como <b>piloto</b>. Desde acá le das el rol de juez u organizador,
        o lo vinculás con su ficha de piloto. Cada cambio queda en el historial.
      </p>
      <div className="stack">
        {users.map((u) => <UserRow key={u.id} user={u} pilots={pilotOptions} isMe={u.id === s.userId} />)}
      </div>
    </main>
  );
}
