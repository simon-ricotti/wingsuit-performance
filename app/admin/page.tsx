import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { ROLE_LABEL } from '@/lib/auth/roles';

export const metadata = { title: 'Administración · Wingsuit Performance' };

export default async function AdminPage() {
  const s = await requireRole('admin', 'judge', 'pilot');
  if (s.role === 'pilot') redirect('/account'); // stage 6: pilots have their own page
  return (
    <main>
      <h1>Hola{s.displayName ? `, ${s.displayName}` : ''}</h1>
      <p className="sub">{s.email} · rol: {ROLE_LABEL[s.role]}</p>
        <ul className="menu">
          <li><Link href="/admin/events">Jornadas</Link></li>
          <li><Link href="/admin/pilots">Pilotos</Link></li>
          <li><Link href="/admin/ranking">Ranking histórico</Link></li>
          <li><Link href="/help">Ayuda</Link></li>
          {s.role === 'admin' && <li><Link href="/admin/users">Usuarios y roles</Link></li>}
          {s.role === 'admin' && <li><Link href="/admin/import">Importar una jornada de la versión anterior</Link></li>}
        </ul>
      {s.pilotId && <p><Link href="/account">Mis saltos como piloto</Link></p>}
      <form action="/auth/logout" method="post"><button type="submit">Salir</button></form>
    </main>
  );
}
