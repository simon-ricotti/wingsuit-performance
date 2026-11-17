// Minimal page: lists the parameters the engine (lib/engine) scores with, each with its FAI 2026
// rule article. The real screens arrive in stage 4. UI text is in Rioplatense Spanish.
import { DEFAULT_CFG } from '@/lib/engine';

const num = (n: number) => n.toLocaleString('es-AR');

const ROWS: [string, string, string][] = [
  ['Ventana de competencia', `${num(DEFAULT_CFG.top)} a ${num(DEFAULT_CFG.bottom)} m sobre la elevación del DZ, primer cruce de cada límite`, '2.2'],
  ['Inicio de la validación', `${DEFAULT_CFG.valDelay} s después de llegar a ${DEFAULT_CFG.valVs} m/s de velocidad vertical`, '2.2'],
  ['Fin de la validación', `${DEFAULT_CFG.valBelow} m debajo de la ventana`, '2.2'],
  ['Carril designado', `${num(DEFAULT_CFG.laneWidth)} m de ancho, centrado en la recta al punto de referencia`, '2.2'],
  ['Fuera del carril', 'menos de 150 m: −10 %; de 150 a 300 m: −20 %; más de 300 m: −50 % la primera vez, cero las siguientes', '5.6.2'],
  ['Separación entre competidores', `menos de ${DEFAULT_CFG.separation} m: cero en ese salto`, '5.6.3'],
  ['Precisión del GPS', `SEP menor a ${DEFAULT_CFG.sepLimit} m y al menos ${DEFAULT_CFG.minHz} Hz`, '3.1.1, 5.7.4'],
  ['Altura de salida', `entre ${num(DEFAULT_CFG.exitMin)} y ${num(DEFAULT_CFG.exitMax)} m`, '5.4.5, 5.4.6'],
  ['Puntaje', '% del mejor de la ronda, promedio por tarea, suma de las tres tareas; medios hacia arriba', '5.10'],
];

export default function Home() {
  return (
    <main>
      <h1>Wingsuit Performance</h1>
      <p className="sub">Puntaje FAI ISC Wingsuit Flying 2026 · DZ AVA (Alvear, Rosario). En construcción.</p>
      <table>
        <thead><tr><th>Regla</th><th>Valor</th><th>Art.</th></tr></thead>
        <tbody>
          {ROWS.map(([k, v, a]) => (
            <tr key={k}><td>{k}</td><td>{v}</td><td className="art">{a}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
