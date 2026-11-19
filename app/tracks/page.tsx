// Loose tracks outside any event (public, static): replay and metrics computed in the browser.
import { TrackViewer } from './track-viewer';

export const metadata = { title: 'Ver mis tracks · Wingsuit Performance' };

export default function TracksPage() {
  return (
    <main className="wide">
      <h1>Ver mis tracks</h1>
      <p className="sub">Subí uno o más archivos de GPS para ver el vuelo en el mapa, sus métricas con las reglas de la FAI y el replay. No hace falta ingresar.</p>
      <TrackViewer />
    </main>
  );
}
