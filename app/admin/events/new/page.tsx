import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { formValuesOf } from '@/lib/events/settings';
import { EventForm } from '../event-form';

export const metadata = { title: 'Nueva jornada · Wingsuit Performance' };

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }); // YYYY-MM-DD

export default async function NewEventPage() {
  await requireRole('admin');
  return (
    <main>
      <p><Link className="back" href="/admin/events">← Jornadas</Link></p>
      <h1>Nueva jornada</h1>
      <EventForm initial={formValuesOf(null, today())} jumps={0} />
    </main>
  );
}
