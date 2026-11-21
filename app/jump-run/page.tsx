// Jump run planner (public, static): everything is computed in the browser.
import { Planner } from './planner';

export const metadata = { title: 'Calcular la pasada · Wingsuit Performance', description: 'Pasada perpendicular al viento y a barlovento, con los segundos entre salidas, sobre el mapa satelital.' };

export default function JumpRunPage() {
  return (
    <main>
      <h1>Calcular la pasada</h1>
      <p className="sub">Para armar el día, sea competencia o entrenamiento: con el viento, el avión y la cantidad de salidas, calcula la pasada perpendicular al viento y a barlovento del aterrizaje, y los segundos entre salidas para mantener la separación (FAI 5.5.1 y 5.5.4).</p>
      <p><a className="button secondary" href="/door/index.html">Reloj de puerta (funciona sin internet)</a></p>
      <Planner />
    </main>
  );
}
