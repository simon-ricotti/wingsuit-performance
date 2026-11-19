// "Cómo se puntúa": public and static (served from the CDN), same text as the previous platform.
import Link from 'next/link';

export const metadata = { title: 'Cómo se puntúa · Wingsuit Performance', description: 'Reglas de puntaje FAI 2026 de Wingsuit Performance y decisiones donde el reglamento no define algo.' };

export default function ScoringPage() {
  return (
    <main className="rules">
      <p><Link className="back" href="/">← Inicio</Link></p>
      <h1>Cómo se puntúa</h1>
      <p>El cálculo sigue las Reglas de Competencia de Wingsuit Flying de la FAI (ISC), edición 2026, evento Performance. Entre paréntesis va el artículo.</p>
        <h2>El salto</h2>
        <ul>
          <li><b>Altura:</b> altura del GPS menos la elevación del DZ que carga quien organiza (2.1, 2.2).</li>
          <li><b>Ventana de competencia:</b> de 2500 a 1500 m sobre el suelo. Empieza en el primer cruce del límite superior y termina en el primer cruce del inferior (2.2). El instante exacto se interpola entre las dos muestras del GPS que rodean cada límite.</li>
          <li><b>Tiempo:</b> segundos dentro de la ventana. <b>Distancia:</b> línea recta sobre el suelo entre el punto de entrada y el de salida. <b>Velocidad:</b> esa distancia dividida por ese tiempo, en km/h (5.3).</li>
          <li><b>Salida:</b> entre 3200 y 3353 m (5.4.5, 5.4.6). Fuera de ese rango el salto se puntúa igual y queda marcado con un aviso.</li>
        </ul>
        <h2>Validación y penalidades</h2>
        <ul>
          <li><b>Ventana de validación:</b> empieza 9 s después de que la velocidad vertical llega por primera vez a 10 m/s y termina 20 m por debajo de la ventana (2.2).</li>
          <li><b>Precisión:</b> el GPS debe registrar a 5 Hz o más y cada muestra de la ventana de validación debe tener SEP menor a 10 m (3.1.1, 5.7.4). Si no, el salto queda marcado: en competencia corresponde re-salto.</li>
          <li><b>Carril:</b> 600 m de ancho, centrado en la recta que va desde la posición al inicio de la validación hasta el punto de referencia asignado (2.2). Salirse menos de 150 m resta 10%; entre 150 y 300 m, 20%; más de 300 m, 50% la primera vez y cero las siguientes (5.6.2).</li>
          <li><b>Separación:</b> pasar a menos de 150 m de otro competidor entre el inicio de la validación y la apertura da cero (5.6.3).</li>
        </ul>
        <h2>Puntaje</h2>
        <ul>
          <li>La penalidad se aplica al resultado. Tiempo y velocidad se redondean a un decimal y la distancia a metros enteros; los medios se redondean hacia arriba (5.10.1, 2.1).</li>
          <li>En cada ronda, el mejor resultado de la tarea vale 100% y el resto un porcentaje de ese (5.10.2).</li>
          <li>El puntaje de cada tarea es el promedio de sus rondas voladas; el total es la suma de las tres tareas, redondeado a un decimal (5.10.3 a 5.10.5).</li>
        </ul>
        <h2>Modo competencia y modo libre</h2>
        <p>Los dos puntúan igual. En competencia las rondas son fijas, con una tarea de cada tipo, y se indica qué rondas están completas (5.4.3). En modo libre se carga cualquier salto en la ronda que quieras.</p>
        <h2>Perfiles de juzgamiento y revisión</h2>
        <ul>
          <li><b>FAI estricto:</b> dos jueces revisan cada salto (7.1.2); un GPS de menos de 5 Hz, una muestra con SEP de 10 m o más o una salida fuera de 3200–3353 m piden la decisión del juez: validar o conceder re-salto (3.1.1, 5.4.5, 5.4.6, 5.7.4); las salidas las controla un Flight Director a bordo (4.1.3).</li>
          <li><b>Argentina (club y entrenamiento):</b> una revisión por salto, esos casos se marcan pero se puntúan, y las salidas se controlan con cronómetro y cámara. Cada punto se puede cambiar por jornada, y la jornada muestra siempre en qué difiere del reglamento FAI.</li>
          <li><b>Lo que propone la plataforma y lo que decide el juez:</b> la penalidad de carril es una propuesta. Si el desvío queda a menos de 15 m de un cambio de nivel (300, 450 o 600 m del eje), el juez tiene que confirmarla. El juez también puede corregir el inicio del carril y decide si aplica el cero por separación, si hubo salida fuera de tiempo y si corresponde re-salto.</li>
          <li><b>Validación:</b> una tarea se valida cuando todos sus saltos están revisados (5.4.2). Si después cambia un salto, la tarea vuelve a quedar provisoria.</li>
          <li><b>Registro:</b> cada carga, reemplazo, decisión, firma y validación queda en el historial con fecha y el usuario de quien lo hizo; las firmas de revisión son de usuarios con rol de juez, y dos firmas son siempre de dos usuarios distintos. Un salto reemplazado, por ejemplo por un re-salto, queda archivado.</li>
        </ul>
        <h2>Clasificaciones, desempate y orden de salida</h2>
        <ul>
          <li><b>Clasificaciones:</b> general, por tarea (tiempo, distancia, velocidad), femenina y por equipos (5.1.1, 8.5.1). La femenina usa los mismos puntajes que la general, ordenados entre las pilotos de la categoría (5.1.4, 5.10.9). Un equipo suma el total de sus integrantes (5.10.10); son 3 por equipo y, si hay más, se nominan 3 (8.4). Una clasificación con menos de cuatro participantes no entrega medallas (5.1.2).</li>
          <li><b>Desempate:</b> un empate en los tres primeros puestos se define con un salto de desempate en una tarea sorteada (5.10.6.1). Si sigue empatado, o en cualquier otro puesto, los pilotos comparten el puesto (5.10.6.2, 5.10.6.3).</li>
          <li><b>Orden de salida:</b> el orden de las tareas se sortea (5.4.8). La ronda 1 sale en orden inverso a la clasificación de la última competencia y los que no participaron salen primero, en orden sorteado (5.5.2). Después de la ronda 1 se recalcula con la clasificación de la jornada; después de la ronda 2 es opcional (5.5.3). Entre tareas rotan las pasadas y el orden dentro de cada pasada (5.5.6).</li>
        </ul>
        <h2>Decisiones que el reglamento no fija</h2>
        <ul>
          <li><b>SEP:</b> el reglamento no da fórmula. Se usa la misma que Skyderby, el sistema que puntuó la Copa del Mundo FAI 2025: 0,5127 × (2 × exactitud horizontal + exactitud vertical), con los valores que informa el FlySight.</li>
          <li><b>Separación:</b> el reglamento no aclara si los 150 m son horizontales o en tres dimensiones. Se mide la distancia real en tres dimensiones, sincronizando los tracks por la hora del GPS. Con archivos de teléfono la hora puede no ser exacta.</li>
          <li><b>Apertura:</b> se estima cuando la velocidad total baja de 25 m/s.</li>
          <li><b>Varias penalidades en un salto:</b> se suman, con un máximo de 100 %. El reglamento no dice cómo combinarlas.</li>
          <li><b>Rotación de pasadas:</b> el reglamento pide rotarlas sin decir cómo; la plataforma corre una posición por tarea, tanto las pasadas como los pilotos dentro de cada una.</li>
          <li><b>Integrantes del equipo:</b> en Argentina el equipo es el club o el grupo que figura en el perfil de cada piloto, no la federación nacional.</li>
          <li><b>Ranking:</b> cuentan las jornadas publicadas, de competencia o de entrenamiento, con la ventana FAI de 2500 a 1500 m. Cada salto se puntúa en su jornada, con sus penalidades, y se compara el resultado en segundos, metros o km/h. Los saltos anulados o en cero no cuentan.</li>
          <li><b>Pasada en el mapa:</b> sirve para planificar los puntos de referencia y no puntúa. El carril que cuenta es el del reglamento: desde donde está el piloto al inicio de la validación hasta su punto.</li>
        </ul>
        <p className="sub small">El motor se validó contra la Copa del Mundo FAI 2025: los 333 saltos dan el mismo resultado que el oficial, y la penalidad de carril coincide en el nivel en 330.</p>
    </main>
  );
}
