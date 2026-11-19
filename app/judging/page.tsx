// "Reglamento para jueces": what a judge needs to know of the FAI 2026 rules to judge a Performance
// competition, each rule with its article, and where it shows up in the system. Source: docs/fai-2026-rules-summary.md.
// Public and static (CDN).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { JumpFlow, JumpProfile, LaneFromAbove, PassRotation, ScoringSteps } from './figures';

export const metadata = { title: 'Reglamento para jueces · Wingsuit Performance', description: 'Lo que hay que saber del reglamento FAI 2026 de Wingsuit Performance para juzgar, con los artículos y cómo apoyarse en el sistema.' };

const InSystem = ({ children }: { children: ReactNode }) => <p className="note small"><b>En el sistema:</b> {children}</p>;

export default function JudgingPage() {
  return (
    <main className="rules help">
      <p><Link className="back" href="/">← Inicio</Link> · <Link href="/help">Ayuda</Link> · <Link href="/scoring">Cómo se puntúa</Link></p>
      <h1>Reglamento para jueces</h1>
      <p>Lo que hay que saber para juzgar una competencia de Wingsuit Performance según las <b>Reglas de Competencia de Wingsuit Flying de la FAI, edición 2026</b>. Entre paréntesis va el artículo. Es un resumen: ante cualquier duda vale el <a href="https://www.dfv.aero/downloads/2026_ISC_CR_WS.pdf">texto oficial de la FAI</a>.</p>
      <nav aria-label="Secciones" className="row small">
        <a href="#disciplina">La disciplina</a> · <a href="#definiciones">Definiciones</a> · <a href="#equipo">Equipo</a> · <a href="#salto">Salto y salida</a> · <a href="#penalidades">Penalidades</a> · <a href="#resaltos">Re-saltos y ceros</a> · <a href="#puntaje">Puntaje</a> · <a href="#jueces">Jueces</a> · <a href="#control">Juez y sistema</a> · <a href="#ava">En AVA</a>
      </nav>

      <h2 id="disciplina">La disciplina</h2>
      <p>Gana quien suma más puntos en tres tareas individuales, cada una en un salto distinto con el mismo traje, medidas por GPS dentro de una ventana vertical de 1000 m: de 2500 a 1500 m sobre el suelo.</p>
      <table className="rules-t">
        <thead><tr><th>Tarea</th><th>Objetivo</th><th>Resultado</th></tr></thead>
        <tbody>
          <tr><td><b>Tiempo</b></td><td>Caer lo más lento posible</td><td>Segundos dentro de la ventana (1 decimal)</td></tr>
          <tr><td><b>Distancia</b></td><td>Volar lo más lejos posible</td><td>Distancia en línea recta sobre el suelo entre la entrada y la salida de la ventana (m enteros)</td></tr>
          <tr><td><b>Velocidad</b></td><td>Volar lo más rápido posible sobre el suelo</td><td>Esa distancia dividida por ese tiempo (km/h, 1 decimal)</td></tr>
        </tbody>
      </table>
      <ul>
        <li><b>Formato:</b> 3 rondas, cada una con una tarea de tiempo, una de distancia y una de velocidad: 9 saltos (5.4.1).</li>
        <li><b>Validez:</b> una tarea es válida cuando el Juez Principal valida sus resultados; una ronda, cuando tiene las tres tareas válidas; la competencia necesita al menos una tarea válida (5.4.2 a 5.4.4).</li>
        <li><b>Medición:</b> todo sale del registro del GPS (PLD). No hay jueces mirando el vuelo: la evaluación es técnica, sobre los datos.</li>
      </ul>
      <InSystem>el modo <i>Competencia</i> de la jornada fija las rondas y muestra qué rondas están completas. <i>Validar tarea</i> (debajo de la clasificación) es la validación del Juez Principal: hasta entonces los resultados figuran como provisorios.</InSystem>

      <h2 id="definiciones">Definiciones técnicas</h2>
      <p>Todo se mide con altura GPS sobre el suelo: el Meet Director fija la elevación del DZ y la ventana va de 2500 a 1500 m por encima de ese valor (2.1, 2.2).</p>
      <table className="rules-t">
        <tbody>
          <tr><td><b>Elevación del DZ</b></td><td>Nivel del suelo de la competencia, fijado por el Meet Director y publicado en el Boletín 2 (2.2).</td></tr>
          <tr><td><b>Ventana de competencia</b></td><td>De 2500 a 1500 m. Empieza en el <b>primer</b> cruce del límite superior y termina en el <b>primer</b> cruce del inferior (2.2).</td></tr>
          <tr><td><b>Ventana de validación</b></td><td>Empieza 9 s después de que la velocidad vertical llega por primera vez a 10 m/s y termina 20 m debajo de la ventana (1480 m). Sirve para controlar la precisión del GPS y el carril (2.2).</td></tr>
          <tr><td><b>Punto de referencia</b></td><td>Punto en tierra asignado a cada competidor en cada salto; coordenadas y foto aérea en el Boletín 2 (2.2, 5.5.5).</td></tr>
          <tr><td><b>Trayectoria designada (DFP)</b></td><td>Recta sobre el suelo desde la posición del competidor al inicio de la validación hasta su punto de referencia (2.2).</td></tr>
          <tr><td><b>Carril designado</b></td><td>Franja de 600 m centrada en la DFP: 300 m a cada lado (2.2).</td></tr>
          <tr><td><b>PLD</b></td><td>El GPS oficial que registra la posición 3D (2.1).</td></tr>
          <tr><td><b>SEP</b></td><td>Radio de la esfera que contiene la posición real con 50 % de confianza: la precisión de cada muestra (2.1).</td></tr>
          <tr><td><b>Resultado / Puntaje</b></td><td>Resultado: lo que voló, con la penalidad aplicada. Puntaje: su porcentaje respecto del mejor de la ronda (2.2, 5.10).</td></tr>
          <tr><td><b>Redondeo</b></td><td>Los medios siempre hacia arriba: 23,5 pasa a 24 (2.1).</td></tr>
        </tbody>
      </table>
      <JumpProfile />
      <InSystem>la elevación del DZ se carga en los ajustes de la jornada y define todo lo demás: si está mal, todos los resultados están mal (si se corrige, el sistema recalcula todos los saltos). En el detalle de cada salto, el gráfico muestra la salida, el inicio de la validación y los cruces de la ventana; el mapa muestra el carril y el máximo desvío.</InSystem>

      <h2 id="equipo">Equipo y requisitos</h2>
      <p>El competidor vuela un solo traje aprobado y marcado por los jueces durante toda la competencia, con el GPS oficial que coloca un juez. Cualquier equipo sin inspeccionar da cero (3.2.2.4, 5.8.5, 5.8.6).</p>
      <h3>GPS oficial (PLD)</h3>
      <ul>
        <li>Registra posición 3D a <b>5 Hz o más</b>, con <b>SEP menor a 10 m</b> (3.1.1). Graba solo; el competidor no puede cambiar su configuración (3.1.2, 3.1.3).</li>
        <li>Un juez lo coloca, lo enciende y lo apaga; el competidor lo devuelve al juez apenas aterriza (3.2.6 a 3.2.8). Los datos se descargan y guardan antes de reusarlo (3.1.4).</li>
        <li>Ningún otro aparato electrónico ni cable a menos de 2,54 cm del PLD; se permite un segundo PLD idéntico (3.2.4).</li>
      </ul>
      <h3>Seguridad y traje</h3>
      <ul>
        <li>Altímetro audible funcionando en cada salto; sin él, <b>cero</b> (3.2.5).</li>
        <li>Traje según las medidas del Addendum D, inspeccionado y marcado antes de la competencia; solo se vuelan trajes marcados (5.8.1, 5.8.3, 5.8.5). Límite de envergadura: B + 2F no puede superar A (aclaración FAI IBD 2025-03); carenado de pie de hasta 30 cm.</li>
        <li>El mismo traje en las tres tareas y todas las rondas; cambiarlo requiere permiso del Juez Principal por causa excepcional (5.8.6).</li>
        <li>Prohibida toda modificación que cambie la aerodinámica: la primera vez, cero; la segunda, descalificación (5.8.2, 5.8.6.1). Prohibidos propulsión y pesos agregados o removibles: peso base con todo el equipo y controles al azar con ±2 kg (3.2.3, 5.8.7).</li>
        <li><b>Panel Asesor de Competidores:</b> se lo consulta la primera vez que aparece un tipo nuevo de modificación; la decisión final es del panel de jueces (5.9).</li>
      </ul>
      <InSystem>esto se controla fuera del software. El sistema lee el GPS de cada salto y avisa si grabó a menos de 5 Hz o con SEP alto; el traje se registra en la ficha del piloto.</InSystem>

      <h2 id="salto">El salto: avión, pasada y salida</h2>
      <p>La pasada es perpendicular al viento y a barlovento; se sale entre 3200 y 3353 m, con al menos 600 m de separación horizontal entre competidores, y cada uno gira hacia su punto de referencia (5.4.5, 5.4.6, 5.5.1, 5.5.4).</p>
      <table className="rules-t">
        <thead><tr><th>Altura de salida</th><th>Qué pasa</th></tr></thead>
        <tbody>
          <tr><td>Más de 3353 m (11 000 ft)</td><td>El salto no vale: re-salto (5.4.5).</td></tr>
          <tr><td>Menos de 3200 m (10 500 ft)</td><td>Re-salto automático, salvo que el competidor acepte el resultado <b>en el momento</b> y avise al Juez Principal (5.4.6).</td></tr>
          <tr><td>Bajada por clima o tránsito</td><td>No menos de 3048 m, para una tarea completa y para todos; la ventana sigue en 2500–1500 m (5.4.7).</td></tr>
        </tbody>
      </table>
      <ul>
        <li><b>Orden de tareas:</b> lo sortea el Juez Principal en la reunión de competidores (5.4.8).</li>
        <li><b>Orden de salida:</b> primera tarea, inverso a la clasificación de la última competencia, y los que no participaron saltan primero en orden sorteado (5.5.2); después de la ronda 1 (y opcionalmente de la 2) se recalcula con la clasificación de la competencia (5.5.3); entre tareas rotan las pasadas, el orden dentro de cada pasada y los puntos de referencia (5.5.6).</li>
        <li><b>Punto de referencia:</b> lo asigna el Meet Director a cada competidor antes de cada salto (5.5.5).</li>
        <li><b>Separación de salida:</b> el Meet Director fija cuántos salen por pasada y el tiempo entre salidas, para al menos 600 m horizontales (5.5.4). El cronómetro de la puerta es solo una ayuda: su falla no da re-salto (5.5.9).</li>
        <li><b>Flight Director</b> a bordo: puntos de referencia, cronómetro, separación, seguridad y video de las salidas. Nunca le indica a nadie que salte (4.1.3).</li>
        <li><b>Negarse a salir:</b> se informa al aterrizar; si los motivos son pertinentes hay re-salto, si no, se puntúa con la penalidad máxima (5.5.10).</li>
        <li><b>Salto oficial:</b> una vez fuera del avión, salvo emergencia, se puntúa (5.5.11). Apertura a más tardar a 600 m sobre el suelo (Código Deportivo, Sección 5, 1.3.1).</li>
      </ul>
      <PassRotation />
      <InSystem>la altura de salida sale del track y aparece en el detalle del salto con un aviso si está fuera de rango. <i>Orden de salida</i> sortea el orden de las tareas, arma cada ronda como inverso de otra jornada (ronda 1) o de esta (rondas siguientes) y rota las pasadas entre tareas. Al cargar el salto se elige el punto de referencia asignado, y el juez lo puede corregir en el detalle.</InSystem>

      <h2 id="penalidades">Penalidades</h2>
      <p>Se descuentan del resultado de ese salto, antes de calcular el porcentaje (5.6, 5.10.1).</p>
      <table className="rules-t">
        <thead><tr><th>Infracción</th><th>Penalidad</th><th>Art.</th></tr></thead>
        <tbody>
          <tr><td>Fuera del carril menos de 150 m</td><td>−10 % del resultado</td><td>5.6.2.1</td></tr>
          <tr><td>Fuera del carril entre 150 y 300 m</td><td>−20 %</td><td>5.6.2.2</td></tr>
          <tr><td>Fuera del carril más de 300 m</td><td>−50 % la primera vez; cero las siguientes</td><td>5.6.2.3</td></tr>
          <tr><td>A menos de 150 m de otro competidor (de la validación a la apertura)</td><td>Cero en ese salto</td><td>5.6.3</td></tr>
          <tr><td>Separación de salida no respetada, sin justificación y con ventaja</td><td>−50 % la primera vez; −100 % las siguientes</td><td>5.5.4.2</td></tr>
          <tr><td>Negarse a salir sin motivo pertinente</td><td>Penalidad máxima</td><td>5.5.10.4</td></tr>
        </tbody>
      </table>
      <LaneFromAbove />
      <ul>
        <li><b>Carril:</b> se controla del inicio de la validación a la salida de la ventana, y se mide en ángulo recto al <b>borde</b> del carril, a 300 m del eje: “fuera 150 m” es estar a 450 m de la recta (5.6.2).</li>
        <li><b>Separación de salida:</b> solo se penaliza si el Meet Director y el Juez Principal, revisando explicación, PLD y video, coinciden en que no estaba justificado y dio ventaja (5.5.4.1, 5.5.4.2).</li>
        <li><b>Seguridad:</b> infracciones que ponen en peligro a otros y salidas inseguras van además al Panel de Seguridad (Controlador FAI, Meet Director y Juez Principal), que decide sin penalidad, puntaje mínimo o descalificación; no se protesta (5.5.8, 5.6.4; Código Deportivo, Sección 5, 4.8).</li>
      </ul>
      <InSystem>el sistema calcula el desvío del carril y propone la penalidad; si queda a menos de 15 m de un cambio de nivel, pide que el juez la confirme. Calcula también la distancia mínima a otros pilotos de la misma tanda y marca la violación de separación: el juez decide si aplica el cero. La penalidad por salida fuera de tiempo y la penalidad a mano las fija el juez en <i>Decisiones del juez</i>. Si hay varias, se suman con un máximo de 100 % (decisión de la plataforma: el reglamento no lo define).</InSystem>

      <h2 id="resaltos">Re-saltos y resultados en cero</h2>
      <p>Hay re-salto cuando la falla no depende del competidor; da cero lo que sí depende de él. Quien re-salta conserva su punto de referencia original (5.5.7).</p>
      <table className="rules-t">
        <thead><tr><th>Situación</th><th>Consecuencia</th><th>Art.</th></tr></thead>
        <tbody>
          <tr><td>Salida por encima de 3353 m</td><td>Re-salto</td><td>5.4.5</td></tr>
          <tr><td>Salida por debajo de 3200 m</td><td>Re-salto, salvo que acepte el resultado en el momento</td><td>5.4.6</td></tr>
          <tr><td>Alguna muestra de la validación con SEP de 10 m o más</td><td>Re-salto</td><td>5.7.4</td></tr>
          <tr><td>PLD que falla sin culpa del competidor</td><td>El competidor elige: re-salto o cero</td><td>3.2.10</td></tr>
          <tr><td>Interferencia ajena al competidor</td><td>El Juez Principal puede dar re-salto</td><td>3.2.4</td></tr>
          <tr><td>Negativa a salir con motivo pertinente</td><td>Re-salto</td><td>5.5.10.3</td></tr>
          <tr><td>PLD manipulado o perdido</td><td>Cero, no se protesta</td><td>3.1.3, 3.2.9, 3.2.11</td></tr>
          <tr><td>Sin altímetro audible funcionando</td><td>Cero</td><td>3.2.5</td></tr>
          <tr><td>Equipo sin inspeccionar, traje sin marcar, propulsión o peso agregado</td><td>Cero</td><td>3.2.2.4, 5.8.5, 3.2.3, 5.8.7</td></tr>
          <tr><td>Traje modificado</td><td>Cero la primera vez; descalificación la segunda</td><td>5.8.6.1</td></tr>
        </tbody>
      </table>
      <p>Si varios que re-saltan en la misma pasada tenían el mismo punto, uno lo conserva por sorteo y los demás reciben otro por sorteo (5.5.7.1).</p>
      <InSystem>con perfil <i>FAI estricto</i>, un GPS de menos de 5 Hz, un SEP alto o una salida fuera de rango dejan el salto con una decisión pendiente: <i>Validar el salto</i> o <i>Conceder re-salto</i>, que lo anula. El re-salto se carga como un salto nuevo en la misma tarea y ronda: reemplaza al anterior, que queda archivado. Un cero por equipo, audible o PLD se pone con la penalidad a mano (Cero) y una nota que explique el motivo.</InSystem>

      <h2 id="puntaje">Puntaje y clasificación</h2>
      <ol>
        <li><b>Resultado penalizado:</b> al resultado se le resta la penalidad; tiempo y velocidad a 1 decimal, distancia a metros enteros (5.10.1).</li>
        <li><b>Puntaje de la ronda:</b> el mejor de esa tarea en esa ronda vale 100 %, los demás su proporción (5.10.2).</li>
        <li><b>Puntaje de la tarea:</b> promedio de sus rondas (5.10.3).</li>
        <li><b>Total:</b> suma de las tres tareas, redondeada a 1 decimal; máximo 300 (5.10.4). La clasificación sale del total redondeado (5.10.5).</li>
      </ol>
      <ScoringSteps />
      <ul>
        <li><b>Empates:</b> en los tres primeros puestos, salto de desempate en una tarea que sortea el Juez Principal; si sigue el empate, o en otros puestos, comparten el puesto (5.10.6).</li>
        <li><b>Clasificaciones:</b> general, por tarea, femenina y por equipos, de los mismos saltos; cada una necesita al menos 4 participantes para entregar medallas (5.1, 5.10.7 a 5.10.10, 8.4, 8.5).</li>
      </ul>
      <InSystem>la clasificación se calcula sola (validada contra la Copa del Mundo FAI 2025: 333 de 333 saltos idénticos). Si hay empate en el podio aparece <i>Sortear la tarea de desempate</i>, y los empatados cargan su salto en la ronda “Salto de desempate”. La vista <i>Equipos</i> pide nominar integrantes cuando un equipo tiene más de los que puntúan.</InSystem>

      <h2 id="jueces">Jueces y procedimiento</h2>
      <p>En Performance los jueces no miran el vuelo: inspeccionan el equipo, colocan y retiran el GPS y evalúan los datos de cada salto, <b>al menos dos jueces por salto</b> (7.1).</p>
      <table className="rules-t">
        <tbody>
          <tr><td><b>Meet Director</b></td><td>Conduce la competencia: pasadas, separación, puntos de referencia, orden, cambios por clima (4.1.1, 5.5).</td></tr>
          <tr><td><b>Juez Principal</b></td><td>Dirige el panel, sortea tareas, valida cada tarea, aprueba cambios de traje y re-saltos (4.1.1, 5.4).</td></tr>
          <tr><td><b>Panel de jueces</b></td><td>Al menos dos jueces evalúan cada salto (7.1.2, 7.1.3).</td></tr>
          <tr><td><b>Director Técnico de Puntaje</b></td><td>Mantiene el sistema de puntaje, ayuda a importar los datos y archiva la competencia; no puede ser competidor, juez ni Meet Director (4.1.2).</td></tr>
          <tr><td><b>Flight Director</b></td><td>A bordo: puntos de referencia, cronómetro, separación, seguridad y video (4.1.3).</td></tr>
          <tr><td><b>Jurado</b></td><td>Vela por el reglamento, resuelve protestas y valida los resultados (Código Deportivo, Sección 5, 4.7).</td></tr>
        </tbody>
      </table>
      <h3>El salto, del lado de los jueces</h3>
      <ol>
        <li><b>Inspección inicial:</b> traje medido y marcado, equipo aprobado, peso base registrado (3.2.2, 5.8).</li>
        <li><b>Antes de subir:</b> un juez coloca y enciende el PLD y controla que no haya otro aparato a menos de 2,54 cm (3.2.4, 3.2.6, 3.2.7).</li>
        <li><b>Al aterrizar:</b> el competidor entrega el PLD; se descargan y guardan los datos antes de reusarlo (3.1.4, 3.2.8).</li>
        <li><b>Evaluación:</b> se carga el salto; al menos dos jueces controlan salida, precisión (SEP), carril y separación (5.6, 5.7.4, 7.1).</li>
        <li><b>Publicación:</b> los puntajes no se publican hasta que termina la tarea; después, de inmediato (7.1.4).</li>
      </ol>
      <p><b>Protestas:</b> primero un reclamo; si no se resuelve, protesta por escrito, en inglés, con el arancel y citando el artículo, dentro de las 2 horas de publicados los resultados (Código Deportivo, Sección 5, 5.3). No se protesta la evaluación de un salto por los jueces, las decisiones del Panel de Seguridad, ni lo marcado como no protestable (PLD manipulado o perdido, pesos).</p>
      <InSystem>cada juez firma con su usuario (<i>Firmar revisión</i>); con perfil FAI hacen falta dos firmas de jueces distintos y el sistema no deja firmar dos veces al mismo. La huella SHA-256 de cada archivo y <i>Verificar un archivo</i> permiten comprobar ante un reclamo que el archivo es el que se cargó. El historial registra quién hizo cada cosa y cuándo. Publicá recién con las tareas validadas: el acta dice “Provisoria” mientras falte alguna.</InSystem>

      <h2 id="control">Qué controla el juez y qué el sistema</h2>
      <p>El sistema solo hace cuentas sobre el track; todo lo que pasa fuera del GPS y toda decisión de criterio es de los jueces. Regla práctica: <b>si se puede discutir, lo decide un juez</b>, que además revisa que el sistema haya recibido los datos correctos.</p>
      <JumpFlow />
      <table className="rules-t">
        <thead><tr><th>El sistema calcula</th><th>El juez decide</th></tr></thead>
        <tbody>
          <tr><td>Ventana, tiempo, distancia y velocidad</td><td>Que el archivo, el piloto, la tarea, la ronda y el punto de referencia cargados sean los correctos</td></tr>
          <tr><td>Altura de salida y frecuencia del GPS</td><td>Re-salto por salida fuera de rango</td></tr>
          <tr><td>Precisión (SEP) de cada muestra</td><td>Confirmar y otorgar el re-salto (5.7.4)</td></tr>
          <tr><td>Desvío del carril y su penalidad, incluido el cero de la segunda vez fuera más de 300 m</td><td>Revisar el caso: punto de referencia, inicio del carril y penalidades al límite</td></tr>
          <tr><td>Distancia mínima a otros competidores</td><td>A quién se aplica el cero y si va al Panel de Seguridad (5.6.3, 5.6.4)</td></tr>
          <tr><td>Puntaje y clasificación</td><td>Revisión por al menos dos jueces, validar cada tarea, publicar al completarla, desempates (5.4.2, 5.10.6, 7.1)</td></tr>
        </tbody>
      </table>
      <h3>Lista para cada salto</h3>
      <ul>
        <li>¿Es el archivo de ese piloto, esa tarea y esa ronda, con el punto de referencia que le asignaron?</li>
        <li>¿La salida está entre 3200 y 3353 m? Si no: re-salto (o el piloto aceptó el resultado de una salida baja).</li>
        <li>¿El GPS grabó a 5 Hz o más y con SEP menor a 10 m en toda la validación? Si no: re-salto.</li>
        <li>¿El carril está bien medido? Mirá el mapa: punto de referencia, inicio del carril y máximo desvío.</li>
        <li>¿Pasó a menos de 150 m de otro? Decidí el cero y si va al Panel de Seguridad.</li>
        <li>¿Hubo algo fuera del GPS (separación en la puerta, audible, equipo)? Penalidad a mano con una nota.</li>
        <li>Firmá. Cuando la tarea tenga todos los saltos revisados, validala.</li>
      </ul>

      <h2 id="ava">Cómo lo aplicamos en AVA</h2>
      <p>Se puntúa con las mismas reglas de la FAI. Cada jornada elige un <b>perfil de juzgamiento</b> y el acta muestra siempre en qué difiere del reglamento:</p>
      <table className="rules-t">
        <thead><tr><th>Tema</th><th>FAI estricto</th><th>Argentina (club y entrenamiento)</th></tr></thead>
        <tbody>
          <tr><td>Firmas por salto</td><td>Dos jueces distintos (7.1.2)</td><td>Una</td></tr>
          <tr><td>GPS de menos de 5 Hz o SEP alto</td><td>El juez valida o concede re-salto</td><td>Solo aviso: se puntúa igual (FlySight y Deep and Steep a 4 Hz quedan marcados)</td></tr>
          <tr><td>Salida fuera de 3200–3353 m</td><td>El juez valida o concede re-salto</td><td>Solo aviso</td></tr>
          <tr><td>Control de salidas</td><td>Flight Director a bordo</td><td>Cronómetro y cámara</td></tr>
        </tbody>
      </table>
      <ul>
        <li><b>Elevación del DZ:</b> 26 m (85 ft), Alvear / Aeroparque Rosario.</li>
        <li><b>Carril y separación:</b> se activan por jornada; el carril necesita las coordenadas de los puntos de referencia.</li>
        <li><b>Decisiones donde el reglamento no fija nada</b> (fórmula del SEP, separación en 3D, apertura estimada, cómo se combinan penalidades, rotación de pasadas, qué es un equipo en Argentina): están en <Link href="/scoring">Cómo se puntúa</Link>.</li>
      </ul>

      <h2>Fuentes</h2>
      <ul className="small">
        <li><a href="https://www.dfv.aero/downloads/2026_ISC_CR_WS.pdf">FAI ISC, Reglas de Competencia de Wingsuit Flying, edición 2026</a>: base de esta página.</li>
        <li><a href="https://www.dfv.aero/downloads/ISC_SC5_2026.pdf">FAI ISC, Código Deportivo Sección 5, edición 2026</a>: seguridad, jueces, Panel de Seguridad, jurado y protestas.</li>
        <li><a href="https://ciam.fai.org/sites/default/files/isc/ibd/2025/ibd_2025-03_wingsuit_competion_rule_clarification.pdf">FAI, IBD 2025-03</a>: medición de trajes.</li>
      </ul>
      <p className="sub small">Esta página resume y traduce el reglamento; ante cualquier duda vale el texto oficial de la FAI.</p>
    </main>
  );
}
