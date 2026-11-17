// Explanatory figures for the judges' rules page: inline SVG in the text colour (light and dark themes),
// with the accent only on what the figure is about. Numbers follow the FAI 2026 articles cited in the captions.
import type { ReactNode } from 'react';

const accent = { fill: 'var(--accent)' } as const;
const accentStroke = { stroke: 'var(--accent)' } as const;

function Figure({ label, caption, viewBox, children }: { label: string; caption: ReactNode; viewBox: string; children: ReactNode }) {
  return (
    <figure className="fig">
      <svg viewBox={viewBox} role="img" aria-label={label} fontSize="12" fill="currentColor">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        {children}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Altitude above the DZ → y, for the jump profile (0 m at y=270, 3600 m at the top). */
const y = (alt: number) => 270 - alt * 0.07;
/** The descent line after the exit: from (140, 70) to (560, 228); x where it reaches a given y. */
const xAt = (py: number) => 140 + (py - 70) / (158 / 420);

export function JumpProfile() {
  const top = y(2500), bottom = y(1500), valEnd = y(1480), deploy = y(600);
  return (
    <Figure viewBox="0 0 640 352"
      label="Perfil de un salto: salida entre 3200 y 3353 m, validación desde 9 s después de llegar a 10 m/s hasta 20 m debajo de la ventana, ventana de 2500 a 1500 m y apertura a 600 m o más"
      caption={<>El resultado sale solo de la <b>ventana</b> (2500 → 1500 m, primer cruce de cada límite). La <b>validación</b> empieza 9 s después de llegar a 10 m/s de caída y termina 20 m debajo de la ventana: ahí se controlan el SEP y el carril. La <b>separación</b> con otros se controla hasta la apertura (2.2, 5.4.5, 5.4.6, 5.6.3, 5.7.4).</>}>
      {/* altitude axis */}
      <line x1="60" y1="14" x2="60" y2="270" stroke="currentColor" />
      <line x1="60" y1="270" x2="620" y2="270" stroke="currentColor" />
      <text x="620" y="264" textAnchor="end" opacity="0.7">tiempo →</text>
      <text x="6" y="12" fontSize="11" opacity="0.7">m sobre el DZ</text>
      {[[3353, '3353'], [3200, '3200'], [2500, '2500'], [1500, '1500'], [600, '600'], [0, '0']].map(([a, t]) => (
        <text key={a} x="54" y={y(a as number) + 4} textAnchor="end" fontSize="11">{t}</text>
      ))}
      {/* exit band */}
      <rect x="60" y={y(3353)} width="560" height={y(3200) - y(3353)} fill="currentColor" opacity="0.12" />
      <text x="612" y={y(3200) - 2} textAnchor="end" fontSize="11">Rango de salida 3200–3353 m</text>
      {/* competition window */}
      <rect x="60" y={top} width="560" height={bottom - top} style={accent} opacity="0.16" />
      <line x1="60" y1={top} x2="620" y2={top} style={accentStroke} strokeDasharray="4 3" />
      <line x1="60" y1={bottom} x2="620" y2={bottom} style={accentStroke} strokeDasharray="4 3" />
      <text x="612" y={(top + bottom) / 2 + 4} textAnchor="end" style={accent} fontWeight="700">Ventana de competencia</text>
      {/* flight */}
      <polyline points={`80,${y(3300)} 90,44 100,52 115,62 140,70 560,${deploy}`} fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="80" cy={y(3300)} r="4" />
      <text x="88" y={y(3300) - 6}>Salida</text>
      <line x1="140" y1="70" x2="140" y2="270" stroke="currentColor" strokeDasharray="3 3" opacity="0.6" />
      <text x="134" y="112" textAnchor="end" fontSize="11">10 m/s + 9 s</text>
      <circle cx={xAt(top)} cy={top} r="4" style={accent} />
      <circle cx={xAt(bottom)} cy={bottom} r="4" style={accent} />
      <circle cx={xAt(valEnd)} cy={valEnd} r="3" />
      <text x={xAt(valEnd) - 8} y={valEnd + 18} textAnchor="end" fontSize="11">1480 m: fin de la validación</text>
      <circle cx="560" cy={deploy} r="4" />
      <text x="548" y={deploy + 18} textAnchor="end">Apertura (600 m o más)</text>
      {/* what is checked where */}
      {[
        { x1: xAt(top), x2: xAt(bottom), yy: 296, t: 'Ventana: tiempo, distancia, velocidad', hl: true },
        { x1: 140, x2: xAt(valEnd), yy: 318, t: 'Validación: SEP < 10 m y carril', hl: false },
        { x1: 140, x2: 560, yy: 340, t: 'Separación: 150 m con otros, hasta la apertura', hl: false },
      ].map((b) => (
        <g key={b.yy}>
          <line x1={b.x1} y1={b.yy} x2={b.x2} y2={b.yy} stroke="currentColor" strokeWidth="2" style={b.hl ? accentStroke : undefined} />
          <line x1={b.x1} y1={b.yy - 4} x2={b.x1} y2={b.yy + 4} stroke="currentColor" />
          <line x1={b.x2} y1={b.yy - 4} x2={b.x2} y2={b.yy + 4} stroke="currentColor" />
          <text x={b.x1 + 4} y={b.yy - 5} fontSize="11" style={b.hl ? accent : undefined}>{b.t}</text>
        </g>
      ))}
    </Figure>
  );
}

export function LaneFromAbove() {
  // Lane: ±300 m = ±40 px around y=130. Each 150 m outside the edge = 20 px.
  const bands: [number, number, string, number][] = [[70, 90, '−10 %', 0.18], [50, 70, '−20 %', 0.32], [20, 50, '−50 %', 0.5]];
  return (
    <Figure viewBox="0 0 640 260"
      label="El carril visto desde arriba: 600 m centrados en la recta desde el inicio de la validación al punto de referencia; fuera del borde, menos de 150 m resta 10 %, de 150 a 300 m resta 20 % y más de 300 m resta 50 %"
      caption={<>El carril mide <b>600 m</b> (300 m a cada lado de la recta entre el inicio de la validación y el punto de referencia). Lo que se mide es cuánto se sale <b>desde el borde</b>, en ángulo recto: en el ejemplo, el punto más lejano está a 210 m del borde (510 m de la recta), así que corresponde −20 %. Se controla del inicio de la validación a la salida de la ventana (2.2, 5.6.2).</>}>
      {bands.map(([a, b, t, o]) => (
        <g key={t}>
          <rect x="60" y={a} width="540" height={b - a} style={accent} opacity={o} />
          <rect x="60" y={260 - b} width="540" height={b - a} style={accent} opacity={o} />
          <text x="606" y={(a + b) / 2 + 4} fontSize="11">{t}</text>
          <text x="606" y={260 - (a + b) / 2 + 4} fontSize="11">{t}</text>
        </g>
      ))}
      <rect x="60" y="90" width="540" height="80" fill="currentColor" opacity="0.1" />
      <line x1="60" y1="90" x2="600" y2="90" stroke="currentColor" />
      <line x1="60" y1="170" x2="600" y2="170" stroke="currentColor" />
      <line x1="60" y1="130" x2="600" y2="130" stroke="currentColor" strokeDasharray="6 4" opacity="0.7" />
      <text x="70" y="104" fontSize="11">Carril: 600 m</text>
      <text x="300" y="148" textAnchor="middle" fontSize="11" opacity="0.8">recta al punto de referencia</text>
      {/* flight path */}
      <path d="M60,130 C150,120 230,60 330,62 S500,120 600,128" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="60" cy="130" r="5" />
      <text x="60" y="190" fontSize="11">Inicio de la validación</text>
      <circle cx="600" cy="130" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="600" cy="130" r="2" />
      <text x="600" y="190" textAnchor="end" fontSize="11">Punto de referencia</text>
      {/* measurement from the edge */}
      <circle cx="330" cy="62" r="4" style={accent} />
      <line x1="330" y1="62" x2="330" y2="90" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
      <text x="338" y="122" fontWeight="700">210 m del borde → −20 %</text>
    </Figure>
  );
}

export function PassRotation() {
  // Example from the rules (5.5.6): 5 pilots, 2 per pass; between tasks passes and order rotate one place.
  const tasks: [string, string[][]][] = [
    ['1.ª tarea', [['A', 'B'], ['C', 'D'], ['E']]],
    ['2.ª tarea', [['D', 'C'], ['E'], ['B', 'A']]],
    ['3.ª tarea', [['E'], ['A', 'B'], ['C', 'D']]],
  ];
  return (
    <Figure viewBox="0 0 640 170"
      label="Rotación del orden de salida entre tareas: con 5 pilotos y 2 por pasada, las pasadas y el orden dentro de cada una corren un lugar en cada tarea"
      caption={<>Orden de la ronda A, B, C, D, E con 2 pilotos por pasada. Entre tareas rotan las pasadas y el orden dentro de cada una, para que nadie salga siempre primero (5.5.6; cómo se rota lo decide la plataforma, ver “Cómo se puntúa”).</>}>
      {tasks.map(([t, passes], i) => (
        <g key={t} transform={`translate(${20 + i * 210}, 0)`}>
          <text x="90" y="20" textAnchor="middle" fontWeight="700">{t}</text>
          {passes.map((p, k) => (
            <g key={k} transform={`translate(0, ${32 + k * 44})`}>
              <text x="0" y="22" fontSize="11" opacity="0.7">Pasada {k + 1}</text>
              {p.map((pilot, n) => (
                <g key={pilot} transform={`translate(${70 + n * 52}, 4)`}>
                  <rect width="44" height="28" rx="5" fill="none" stroke="currentColor" style={pilot === 'A' ? accentStroke : undefined} strokeWidth={pilot === 'A' ? 2.5 : 1} />
                  <text x="22" y="19" textAnchor="middle" fontWeight="700" style={pilot === 'A' ? accent : undefined}>{pilot}</text>
                </g>
              ))}
            </g>
          ))}
        </g>
      ))}
    </Figure>
  );
}

export function ScoringSteps() {
  const steps: [string, string, string][] = [
    ['Resultado', '60,0 s', '(del GPS)'],
    ['− penalidad', 'sin penalidad', '60,0 s (5.10.1)'],
    ['% del mejor', '60 / 80 = 75 %', 'de la ronda (5.10.2)'],
    ['Promedio', '(75 + 100) / 2', '= 87,5 (5.10.3)'],
    ['Total', 'tiempo + dist. + vel.', 'máx. 300 (5.10.4)'],
  ];
  return (
    <Figure viewBox="0 0 680 120"
      label="Del resultado al total: resultado, menos penalidad, porcentaje del mejor de la ronda, promedio de las rondas de la tarea, suma de las tres tareas"
      caption={<>Ejemplo de tiempo: en la ronda 1 el mejor hizo 80,0 s y este piloto 60,0 s (75 %); en la ronda 2 él hizo el mejor (100 %). Su tarea de tiempo vale 87,5; el total suma las tres tareas. Los redondeos intermedios son solo para mostrar.</>}>
      {steps.map(([t, a, b], i) => {
        const x = 4 + i * 136;
        return (
          <g key={t}>
            <rect x={x} y="14" width="118" height="84" rx="8" fill="none" stroke="currentColor" style={i === 2 ? accentStroke : undefined} strokeWidth={i === 2 ? 2.5 : 1} />
            <text x={x + 59} y="38" textAnchor="middle" fontWeight="700" style={i === 2 ? accent : undefined}>{t}</text>
            <text x={x + 59} y="62" textAnchor="middle" fontSize="11">{a}</text>
            <text x={x + 59} y="80" textAnchor="middle" fontSize="11" opacity="0.75">{b}</text>
            {i < steps.length - 1 && <line x1={x + 120} y1="56" x2={x + 134} y2="56" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />}
          </g>
        );
      })}
    </Figure>
  );
}

export function JumpFlow() {
  const box = (x: number, yy: number, t: string, who: string, hl = false) => (
    <g>
      <rect x={x} y={yy} width="180" height="56" rx="8" fill="none" stroke="currentColor" style={hl ? accentStroke : undefined} strokeWidth={hl ? 2.5 : 1} />
      <text x={x + 90} y={yy + 24} textAnchor="middle" fontWeight="700" style={hl ? accent : undefined}>{t}</text>
      <text x={x + 90} y={yy + 42} textAnchor="middle" fontSize="11" opacity="0.75">{who}</text>
    </g>
  );
  return (
    <Figure viewBox="0 0 640 230"
      label="Recorrido de un salto en el sistema: cargar, avisos del sistema, decisiones del juez, firmas, validar la tarea y publicar; si cambia un salto, la tarea se reabre"
      caption={<>Cada paso queda en el historial con fecha y nombre. Mientras una tarea no está validada, sus resultados son provisorios; si después cambia un salto (no solo las notas), la tarea vuelve a quedar provisoria.</>}>
      {box(10, 20, 'Cargar salto', 'juez (o el piloto, si se abre)')}
      {box(230, 20, 'Avisos', 'sistema: Hz, SEP, salida, carril')}
      {box(450, 20, 'Decisiones', 'juez: re-salto, carril, cero', true)}
      {box(450, 150, 'Firmas', '1 juez, o 2 distintos (FAI)')}
      {box(230, 150, 'Validar tarea', 'Juez Principal (5.4.2)')}
      {box(10, 150, 'Publicar', 'organizador, al cerrar')}
      <line x1="192" y1="48" x2="228" y2="48" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="412" y1="48" x2="448" y2="48" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="540" y1="78" x2="540" y2="148" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="448" y1="178" x2="412" y2="178" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="228" y1="178" x2="192" y2="178" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <path d="M320,148 C320,110 470,110 500,80" fill="none" stroke="currentColor" strokeDasharray="4 3" markerEnd="url(#arrow)" />
      <text x="330" y="118" fontSize="11">cambia un salto → se reabre</text>
    </Figure>
  );
}
