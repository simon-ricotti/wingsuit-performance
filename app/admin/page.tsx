import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { ROLE_LABEL } from '@/lib/auth/roles';

export const metadata = { title: 'Administración · Wingsuit Performance' };

export default async function AdminPage() {
  const s = await requireRole('admin', 'judge', 'pilot');
  return (
    <main>
      <h1>Hola{s.displayName ? `, ${s.displayName}` : ''}</h1>
      <p className="sub">{s.email} · rol: {ROLE_LABEL[s.role]}</p>
      {s.role !== 'pilot' && (
        <ul className="menu">
          <li><Link href="/admin/events">Jornadas</Link></li>
          <li><Link href="/admin/pilots">Pilotos</Link></li>
          <li><Link href="/admin/ranking">Ranking histórico</Link></li>
          {s.role === 'admin' && <li><Link href="/admin/users">Usuarios y roles</Link></li>}
          {s.role === 'admin' && <li><Link href="/admin/import">Importar una jornada de la versión anterior</Link></li>}
        </ul>
      )}
      {s.role === 'pilot' && <p>Por ahora no hay nada para pilotos acá: la carga de saltos propios llega en una etapa próxima.</p>}
      <form action="/auth/logout" method="post"><button type="submit">Salir</button></form>
    </main>
  );
}
