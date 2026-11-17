import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';

export const metadata = { title: 'Administración · Wingsuit Performance' };

const ROLE_LABEL = { admin: 'organizador', judge: 'juez', pilot: 'piloto' } as const;

export default async function AdminPage() {
  const s = await requireRole('admin', 'judge', 'pilot');
  return (
    <main>
      <h1>Hola{ s.displayName ? `, ${s.displayName}` : '' }</h1>
      <p className="sub">{s.email} · rol: {ROLE_LABEL[s.role]}</p>
      {s.role === 'admin' && (
        <ul>
          <li><Link href="/admin/import">Importar una jornada de la versión anterior</Link></li>
        </ul>
      )}
      {s.role === 'pilot' && <p>Por ahora no hay nada para pilotos acá: la carga de saltos propios llega en una etapa próxima.</p>}
      <form action="/auth/logout" method="post"><button type="submit">Salir</button></form>
    </main>
  );
}
