import { requireRole } from '@/lib/auth/session';
import { ImportForm } from './form';

export const metadata = { title: 'Importar jornada · Wingsuit Performance' };
export const maxDuration = 120;

export default async function ImportPage() {
  await requireRole('admin');
  return (
    <main>
      <h1>Importar una jornada</h1>
      <p className="sub">
        Subí la <b>copia completa</b> que se descarga desde el acta de la versión anterior. Se importan la jornada, los pilotos,
        los saltos con las decisiones de los jueces, los tracks, los archivos originales y el historial. Si algo falla, no se guarda nada.
      </p>
      <ImportForm />
    </main>
  );
}
