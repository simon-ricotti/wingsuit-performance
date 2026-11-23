// Help by role, centred on running an event with the system. Public and static (CDN): it holds nothing private,
// so judges and pilots can open it on the phone at the DZ without logging in.
import Link from 'next/link';
import type { ReactNode } from 'react';

// Who does each step of the day (colour chip). "A bordo": whoever carries the door clock (Flight Director, jumpmaster).
const WHO = { org: 'Organizador', judge: 'Juez', pilot: 'Piloto', board: 'A bordo', all: 'Todos' } as const;
function Step({ who, title, children }: { who: (keyof typeof WHO)[]; title: string; children: ReactNode }) {
  return (
    <li>
      <p className="step-h"><b>{title}</b>{who.map((w) => <span key={w} className={`who ${w}`}>{WHO[w]}</span>)}</p>
      <p>{children}</p>
    </li>
  );
}

export const metadata = { title: 'Ayuda · Wingsuit Performance', description: 'Cómo usar Wingsuit Performance en una jornada: organizador, jueces y pilotos.' };

export default function HelpPage() {
  return (
    <main className="rules help">
      <p><Link className="back" href="/">← Inicio</Link></p>
      <h1>Ayuda</h1>
      <p>Cómo usar el sistema en una jornada, según tu rol. Para el reglamento, mirá <Link href="/judging">Reglamento para jueces</Link> y <Link href="/scoring">Cómo se puntúa</Link>.</p>
      <nav aria-label="Secciones" className="row">
        <a href="#dia">El día paso a paso</a> · <a href="#entrar">Entrar</a> · <a href="#organizador">Organizador</a> · <a href="#juez">Juez</a> · <a href="#piloto">Piloto</a> · <a href="#problemas">Problemas frecuentes</a>
      </nav>

      <h2 id="dia">El día paso a paso</h2>
      <p>Quién hace qué, de la preparación al cierre. El color dice quién: <span className="who org">Organizador</span> <span className="who judge">Juez</span> <span className="who pilot">Piloto</span> <span className="who board">A bordo</span> (quien lleva el reloj de puerta: Flight Director o jumpmaster) <span className="who all">Todos</span>.</p>
      <ol className="day">
        <li className="phase">
          <h3>1 · Días antes</h3>
          <ol>
            <Step who={['org']} title="Gente y pilotos"><i>Usuarios y roles</i>: rol juez a cada juez (su nombre es el de la firma) y cada piloto vinculado a su ficha. En <i>Pilotos</i>, todos cargados con traje, categoría y equipo.</Step>
            <Step who={['org']} title="Crear la jornada"><i>Jornadas → Nueva jornada</i>: modo (Competencia o Libre), elevación del DZ (AVA 26 m), puntos de referencia en el mapa, perfil de juzgamiento (FAI: dos firmas; Argentina: una) y si los pilotos cargan sus saltos.</Step>
            <Step who={['org']} title="Base de datos">Si estuvo una semana sin uso, quien administra la parte técnica la reactiva el día anterior.</Step>
          </ol>
        </li>
        <li className="phase">
          <h3>2 · A la mañana, en la DZ</h3>
          <ol>
            <Step who={['org']} title="Calcular la pasada">En <Link href="/jump-run">Pasada</Link>: <i>Traer el pronóstico</i>, aterrizaje y puntos en el mapa → rumbo perpendicular al viento y segundos entre salidas. En los ajustes de la jornada, <i>Usar la pasada del planificador</i> → <i>Guardar</i>.</Step>
            <Step who={['board']} title="Preparar el reloj de puerta">En <i>Pasada</i>, <i>Copiar para el reloj</i>; en el reloj, <i>Pegar lo copiado en Pasada</i> (o <i>Elegir en el mapa</i>), separación → <i>OK</i>. Queda en Stand by.</Step>
            <Step who={['org']} title="Orden de salida">En la jornada, <i>Ajustes</i>: participantes y pilotos por pasada. Después, <i>Orden de salida</i>: sorteo del orden de las tareas, ronda 1 <i>Inverso de</i> la última jornada (o <i>Sorteo</i>) → <i>Armar orden</i>. Imprimilo.</Step>
            <Step who={['all']} title="Reunión de competidores">Orden y pasadas, el punto de referencia de cada uno (FAI 5.5.5), los segundos entre salidas y el plan si cambia el viento.</Step>
          </ol>
        </li>
        <li className="phase loop">
          <h3>3 · Cada ronda <span className="again">↻ se repite</span></h3>
          <ol>
            <Step who={['board']} title="Subida">Reloj en Stand by: punto, GPS y ground speed en verde. Si hace falta el viento en altura, <i>Modo viento</i> y un 360 a airspeed constante.</Step>
            <Step who={['board', 'pilot']} title="Pasada"><i>Iniciar jump run</i>: cuenta hasta la vertical del punto; después, cada salida se toca (en cualquier momento, aunque no hayan llegado a cero) y cuenta los segundos para la siguiente.</Step>
            <Step who={['judge', 'pilot']} title="Cargar los saltos">Al aterrizar, <i>Cargar salto</i>: piloto, tarea, ronda, el punto asignado y el archivo del GPS → <i>Guardar salto</i>. Lo hace el juez, o el piloto si la jornada lo permite.</Step>
            <Step who={['judge']} title="Revisar y firmar cada salto">Apenas se carga, con el piloto cerca: decisiones pendientes (GPS, salida, carril, separación) → <i>Firmar revisión</i>. Con perfil FAI, dos jueces distintos.</Step>
            <Step who={['judge']} title="Validar la tarea">Cuando todos los saltos de esa tarea y ronda están firmados → <i>Validar tarea</i>, debajo de la clasificación.</Step>
            <Step who={['org', 'judge']} title="Orden de la ronda siguiente"><i>Orden de salida → Armar orden</i>: usa la clasificación hasta ese momento (FAI 5.5.3). Y de vuelta a la subida.</Step>
          </ol>
        </li>
        <li className="phase">
          <h3>4 · Al cerrar</h3>
          <ol>
            <Step who={['org']} title="Desempate y equipos">Si hay empate en el podio, <i>Sortear la tarea de desempate</i> y un salto más. Si un equipo tiene más pilotos de los que puntúan, nominá a los integrantes.</Step>
            <Step who={['org', 'judge']} title="Todo validado">Todas las tareas validadas: si queda alguna provisoria, el acta sale “Provisoria”.</Step>
            <Step who={['org']} title="Acta y respaldo"><i>Acta y exportar</i>: imprimí el acta y firmala. <b>Descargá la copia completa</b> y guardala: es el respaldo de la jornada.</Step>
            <Step who={['org']} title="Publicar"><i>Ajustes e historial → Publicar la jornada</i>: aparece en <Link href="/results">Resultados</Link> y suma al <Link href="/ranking">Ranking</Link>.</Step>
          </ol>
        </li>
      </ol>
      <div className="note">
        <p><b>¿Firmar cada salto o todo al final?</b> Cada salto, apenas se carga: si el GPS falló o la salida estuvo fuera de norma, el re-salto se decide con el piloto todavía en la DZ. Cada tarea se valida al terminar su ronda, porque el orden de la ronda siguiente sale de la clasificación. Al final solo queda comprobar que no haya nada provisorio.</p>
        <p><b>Entrenamiento (modo Libre):</b> no hacen falta orden de salida, desempate ni equipos. Suele convenir que cada piloto cargue sus saltos; publicala al final para que cuente en el Ranking.</p>
      </div>

      <h2 id="entrar">Entrar y roles</h2>
      <ul>
        <li><b>Entrar:</b> en <Link href="/login">Ingresar</Link> poné tu mail y tocá el enlace que te llega. Abrilo en el <b>mismo navegador</b> donde lo pediste. No hay contraseña.</li>
        <li><b>Roles:</b> el <b>organizador</b> prepara y cierra la jornada; el <b>juez</b> carga y revisa saltos; el <b>piloto</b> ve sus saltos y, si la jornada lo permite, carga los suyos. Cualquiera ve los resultados publicados en <Link href="/results">Resultados</Link>, sin entrar.</li>
        <li>La primera vez que entrás quedás como piloto. Para ser juez, o para ver tus saltos como piloto, pedíselo al organizador.</li>
        <li><b>Todo queda registrado:</b> cada carga, decisión, firma y cambio queda en el historial con fecha y nombre. Nada se borra: lo reemplazado o borrado queda archivado.</li>
      </ul>

      <h2 id="organizador">Organizador</h2>
      <h3>Antes de la jornada</h3>
      <ol>
        <li><b>Gente:</b> en <i>Usuarios y roles</i>, a cada juez dale el rol <b>juez</b> y escribí su nombre: es el que aparece en las firmas. A cada piloto que use el sistema, vinculalo con su ficha en <i>Piloto vinculado</i>.</li>
        <li><b>Pilotos:</b> en <i>Pilotos</i>, cargá a todos: nombre, traje, categoría (General o Femenina) y equipo o club (cuenta para la clasificación por equipos).</li>
        <li><b>Jornada:</b> en <i>Jornadas → Nueva jornada</i>:
          <ul>
            <li><b>Modo:</b> Competencia (rondas fijas de 3 tareas) o Libre (entrenamiento).</li>
            <li><b>Elevación del DZ</b> sobre el nivel del mar: obligatoria y clave, define la altura de la ventana. AVA: 26 m.</li>
            <li>Ventana y salida: dejá los valores FAI salvo que haya un motivo.</li>
            <li><b>Ancho del carril:</b> FAI 600 m; podés poner otro (por ejemplo 400 m para club). Las franjas de penalidad se miden desde el borde del carril, como en la FAI, y la jornada muestra el cambio entre sus diferencias con el reglamento.</li>
            <li><b>Carril:</b> cargá los puntos de referencia en el mapa satelital (<i>Agregar punto</i> y tocá el terreno; arrastralos para moverlos) o escribilos, uno por línea: <code>Norte, -33.0124, -60.6400</code>. Sin puntos, el carril no se evalúa. Con saltos cargados, los puntos que ya están quedan fijos (no se mueven, no se quitan, no cambian de orden: los saltos ya puntuados cambiarían); solo se les cambia el nombre o se agregan nuevos al final. Si cambia el viento, se mueve la pasada, no los puntos (FAI 5.5.5).</li>
            <li><b>Pasada:</b> con <i>Marcar la pasada</i> tocá dónde empieza y dónde termina. El mapa marca una salida cada 600 m (FAI 5.5.4) y un carril aproximado desde cada salida a su punto (la 1 al punto 1, la 2 al 2…), para ver si los puntos quedan bien ubicados. Para calcularla con el viento, usá <Link href="/jump-run">Calcular la pasada</Link> (perpendicular al viento y a barlovento, con los segundos entre salidas; sugiere un punto por salida, que podés mover, y muestra la separación entre los carriles del ancho que elijas) y después <i>Usar la pasada del planificador</i> en los ajustes. Es solo para planificar: no cambia el puntaje.</li>
            <li><b>Reloj de puerta:</b> desde <i>Pasada</i>, <i>Reloj de puerta</i>. Instalalo como app: en iPhone, Safari → Compartir → <i>Agregar a inicio</i>; en Android, Chrome → menú → <i>Instalar app</i>. Abrilo una vez con señal, tocá <i>Activar el GPS</i> y permití la ubicación: después anda sin internet en el avión. Antes de subir, poné el celular en No molestar. Configuración: el punto de la salida 1 (<i>Elegir en el mapa</i>, o <i>Copiar para el reloj</i> en <i>Pasada</i> y <i>Pegar lo copiado en Pasada</i>), la separación (botones FAI 600 m, USPA 1000 ft solos y 1500 ft grupos), un ground speed por si no hay GPS y la unidad de distancia (nm, m o ft) → <i>OK</i> → <i>Stand by</i> (punto, GPS, ground speed y segundos; en verde lo que viene del GPS) → <i>Iniciar jump run</i>. La primera salida cuenta hasta la vertical del punto con el GPS y después sigue mostrando cuánto se pasaron (+). Cada toque marca una salida en cualquier momento (por si no pasan justo por el punto) y cuenta los segundos para la separación con el ground speed real (amarillo en los últimos 3 s, verde en cero, rojo si pasan 5 s más). <i>Terminar</i> y <i>Cambiar la configuración</i> se mantienen apretados.</li>
            <li><b>Modo viento:</b> en el Stand by, mantené <i>Modo viento</i>. Arriba muestra el viento promedio hasta 5.000 ft y el último en altura. Se mide con <i>Medir</i> cuando el piloto va a IAS fija (alcanza una curva de ~75°), o solo con un 360 o un hipódromo. Todo está explicado en la <a href="/door/help.html">ayuda del reloj</a>, que también se abre desde su configuración y anda sin internet.</li>
            <li><b>Perfil de juzgamiento:</b> <i>FAI estricto</i> (dos firmas de jueces distintos, re-salto por GPS o salida fuera de norma) o <i>Argentina</i> (una firma, esos casos solo se marcan).</li>
            <li><b>Carga de saltos por los pilotos:</b> activalo solo si querés que cada piloto suba los suyos; si no, los cargan los jueces.</li>
          </ul>
        </li>
        <li><b>Orden de salida:</b> en la jornada, <i>Ajustes</i>: marcá los participantes y los pilotos por pasada → <i>Guardar participantes</i>. En <i>Orden de salida</i>, sorteá el orden de las tareas; en la ronda 1 elegí <i>Inverso de</i> la última jornada (o Sorteo) → <i>Armar orden</i>. Imprimilo para la reunión de competidores. Si el orden no sale del reglamento (entrenamiento, o se decide en la DZ), en cada ronda <i>Ordenar a mano (no oficial)</i>: subí y bajá con ▲▼ → <i>Guardar este orden</i>. Al lado de cada piloto aparece su <b>punto de referencia</b>: la salida 1 de cada pasada va al primer punto, la 2 al segundo, y así; como el orden rota entre tareas, cada uno pasa por distintos puntos (FAI 5.5.5 y 5.5.6). Se puede cambiar el de cada uno con su selector, y al cargar el salto ya viene elegido.</li>
        <li>El día anterior, quien administra la parte técnica reactiva la base de datos (en el plan gratis se pausa si no se usa una semana).</li>
      </ol>
      <h3>Durante</h3>
      <ul>
        <li>Seguí la <b>clasificación</b> en la página de la jornada. Si hay que cambiar la elevación o la ventana, hacelo en <i>Ajustes e historial</i>: todos los saltos se recalculan solos.</li>
        <li><b>Desempate:</b> si hay empate en los tres primeros puestos, debajo de la clasificación aparece <i>Sortear la tarea de desempate</i>. Los empatados cargan un salto en la ronda “Salto de desempate”.</li>
        <li><b>Equipos:</b> si un equipo tiene más pilotos que los que puntúan, en la vista <i>Equipos</i> aparece para nominar a los integrantes → <i>Guardar nominación</i>.</li>
      </ul>
      <h3>Al cerrar</h3>
      <ol>
        <li>Verificá que todas las tareas estén <b>validadas</b> (debajo de la clasificación). Mientras haya alguna provisoria, el acta dice “Provisoria”.</li>
        <li><i>Acta y exportar</i>: imprimí el acta o guardala como PDF y firmala.</li>
        <li><b>Descargá la copia completa</b> (respaldo con saltos, tracks, archivos originales e historial) y, si querés, la planilla CSV. Guardá la copia en un lugar seguro: es el respaldo de la jornada.</li>
        <li>Para mostrar los resultados a todos: <i>Ajustes e historial → Publicar la jornada</i>. Aparece en <Link href="/results">Resultados</Link> en menos de un minuto. Se puede despublicar.</li>
      </ol>

      <h2 id="juez">Juez</h2>
      <h3>Cargar un salto</h3>
      <ol>
        <li>En la jornada, <i>Cargar salto</i>: elegí piloto, tarea y ronda. Si la ronda tiene orden de salida, el <b>punto de referencia</b> ya viene elegido según ese orden; cambialo si en la puerta le asignaron otro.</li>
        <li>Elegí el archivo del GPS (FlySight, FlySight 2, Deep and Steep, GPX, KML o CSV). Aparece una <b>vista previa</b> con el resultado y los avisos: revisala.</li>
        <li><i>Guardar salto</i>. El servidor vuelve a calcular el puntaje oficial y guarda el archivo original con su huella.</li>
        <li>Si el piloto ya tenía salto en esa tarea y ronda (por ejemplo, un re-salto), el nuevo lo <b>reemplaza</b> y el anterior queda archivado. Se pierden las decisiones y firmas del anterior.</li>
      </ol>
      <h3>Revisar y firmar</h3>
      <ul>
        <li>En la clasificación, el punto al lado de cada resultado indica el estado: <b>verde</b> revisado, <b>ámbar</b> falta una decisión, <b>gris</b> sin revisar, <b>rojo</b> anulado. El mejor de cada ronda va resaltado.</li>
        <li>Tocá un resultado para ver el detalle: mapa del carril, velocidad vertical, precisión del GPS y el track <b>sobre el terreno</b>, con el carril de 600 m y las franjas de −10, −20 y −50 %.</li>
        <li><b>Decisiones del juez</b> (lo pendiente aparece en un aviso): validar el salto o conceder re-salto si el GPS o la salida están fuera de norma; confirmar la penalidad de carril si está al límite; aplicar o no el cero por separación; salida fuera de tiempo; penalidad a mano; notas. → <i>Guardar decisiones</i>.</li>
        <li>Si el punto de referencia o el inicio del carril no corresponden, corregilos en el mismo detalle → <i>Recalcular carril</i>.</li>
        <li>Cuando está todo decidido, <i>Firmar revisión</i>. Firmás con tu usuario. Con perfil FAI hacen falta dos jueces distintos. Si después cambia una decisión, las firmas se borran y hay que volver a firmar (quedan en el historial).</li>
      </ul>
      <h3>Validar y seguir</h3>
      <ul>
        <li>Cuando todos los saltos de una tarea de una ronda están revisados, <i>Validar tarea</i> (debajo de la clasificación). Si después cambia un salto de esa tarea, se reabre sola; cambiar solo las notas no la reabre.</li>
        <li>Antes de cada ronda nueva, en <i>Orden de salida</i> → <i>Armar orden</i>: usa la clasificación de la jornada hasta ese momento.</li>
        <li><i>Replay</i> muestra la tanda en 3D con la tabla en vivo y, abajo, los tracks sobre el satélite con el carril y las franjas de cada piloto: sirve para explicar un resultado a los pilotos.</li>
        <li>Para comprobar que un archivo es el mismo que se cargó, en el detalle del salto usá <i>Verificar un archivo</i> (compara la huella, no sube nada).</li>
      </ul>

      <h2 id="piloto">Piloto</h2>
      <ul>
        <li>Entrá con tu mail: vas a <b>Mis saltos</b>, con tus resultados, puntos, penalidades y el estado de cada salto. Si dice que tu usuario no está vinculado, pedíselo al organizador.</li>
        <li>Si la jornada lo permite, aparece en <i>Cargar un salto</i>: elegí tarea, ronda y tu punto de referencia, subí el archivo del GPS y guardá. Los jueces lo revisan.</li>
        <li>No podés reemplazar un salto ya cargado: si hace falta (por un re-salto), lo hace un juez.</li>
        <li>Los resultados son provisorios hasta que los jueces validan cada tarea.</li>
        <li><b>Saltos sueltos:</b> en <Link href="/tracks">Tracks</Link> podés subir uno o más archivos sin jornada y ver el mapa, las métricas y el replay. No se guarda nada; para que un salto quede en tu historial, cargalo en una jornada libre abierta.</li>
        <li>El <Link href="/ranking">Ranking</Link> muestra los récords y la mejor marca de cada piloto en las jornadas publicadas, de competencia y de entrenamiento.</li>
      </ul>

      <h2 id="problemas">Problemas frecuentes</h2>
      <ul>
        <li><b>No me llega el mail:</b> mirá en Spam y esperá un par de minutos. Si pediste varios seguidos, usá el último.</li>
        <li><b>El enlace no me deja entrar:</b> abrilo en el mismo navegador donde lo pediste, o pedí uno nuevo.</li>
        <li><b>“La salida fue por debajo del límite superior de la ventana”:</b> revisá que sea el archivo del salto y que la elevación del DZ de la jornada esté bien.</li>
        <li><b>“No reconozco el formato”:</b> subí el archivo original del GPS (FlySight: <code>TRACK.CSV</code>; Deep and Steep: <code>gps_*.csv</code>), sin abrirlo ni guardarlo con Excel.</li>
        <li><b>El salto dice “Sin carril”:</b> la jornada no tiene puntos de referencia, o el salto no tiene uno asignado: corregilo en el detalle del salto.</li>
        <li><b>No puedo firmar:</b> falta una decisión (mirá el aviso del detalle), el salto está anulado, o ya firmaste: la otra firma tiene que ser de otro juez.</li>
        <li><b>No puedo borrar una jornada o un piloto:</b> tienen saltos cargados. Es a propósito.</li>
        <li><b>Sin señal en la DZ:</b> el archivo queda en el GPS; cargalo cuando haya conexión. La vista previa no guarda nada hasta tocar <i>Guardar salto</i>.</li>
        <li><b>¿Quién cambió algo?</b> En la jornada, <i>Ajustes e historial</i>: cada cambio con fecha y nombre.</li>
      </ul>
    </main>
  );
}
