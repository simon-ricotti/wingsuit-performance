// Result of one jump: main values and warnings (resultCard in the previous platform).
import { es, type JumpRecord } from '@/lib/engine';
import { altitudeIn } from '@/lib/events/settings';
import { TASK_LABEL } from '@/lib/jumps/score';

interface Props { jump: JumpRecord; units: 'm' | 'ft'; exitMin: number; exitMax: number; pilotName: (id: string) => string }

const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? es(+v.toFixed(d)) : '–');

export function JumpResult({ jump: j, units, exitMin, exitMax, pilotName }: Props) {
  const ft = units === 'ft';
  const alt = (m: unknown) => (typeof m === 'number' ? altitudeIn(Math.round(m), ft) : '–');
  const kpi = (task: string | null, v: string, label: string) => (
    <div className={'kpi' + (task === j.task ? ' main' : '')}><div className="v">{v}</div><div className="k">{label}</div></div>
  );
  const flags = ((j.flags as { code: string; level: string; text: string }[]) ?? []).map((f) => {
    if (f.code === 'exit_low') return { ...f, text: `Salida a ${alt(j.exitAgl)} ${units} AGL, por debajo del mínimo de ${altitudeIn(exitMin, ft)} ${units} (5.4.6).` };
    if (f.code === 'exit_high') return { ...f, text: `Salida a ${alt(j.exitAgl)} ${units} AGL, por encima del máximo de ${altitudeIn(exitMax, ft)} ${units} (5.4.5).` };
    return f;
  });
  if ((j.laneOutside as number) > 0) flags.push({ code: 'lane', level: 'warn', text: `Salió ${num(j.laneOutside, 0)} m del carril: penalidad de ${j.lanePen}% (5.6.2).` });
  if (j.sepViolation) flags.push({ code: 'sep', level: 'warn', text: `Pasó a ${num(j.sepMin, 0)} m de ${pilotName(String(j.sepWith))}: resultado cero (5.6.3).` });
  return (
    <div className="stack">
      <div className="kpis">
        {kpi('time', num(j.time, 1), `${TASK_LABEL.time} · s`)}
        {kpi('distance', num(j.distance, 0), `${TASK_LABEL.distance} · m`)}
        {kpi('speed', num(j.speed, 1), `${TASK_LABEL.speed} · km/h`)}
        {kpi(null, alt(j.exitAgl), `Salida · ${units} AGL`)}
        {kpi(null, j.sepMax == null ? '–' : num(j.sepMax, 1), 'SEP máx · m')}
        {kpi(null, num(j.hz, 0), 'GPS · Hz')}
        {j.laneDev != null && kpi(null, num(j.laneDev, 0), 'Desvío máx del eje · m')}
        {j.sepMin != null && kpi(null, num(j.sepMin, 0), 'Mín. a otro piloto · m')}
      </div>
      {flags.map((f, i) => <p key={i} className={'note small' + (f.level === 'warn' ? ' warn' : '')}>{f.text}</p>)}
    </div>
  );
}
