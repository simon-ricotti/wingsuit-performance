// Resultados y clasificación (5.10).
import type { JumpRecord, Standings, StandingRow, StandingsOptions, Task } from './types';
import { TASKS, roundHalfUp } from './util';

function isTask(t: string): t is Task {
  return (TASKS as readonly string[]).indexOf(t) >= 0;
}

function rawOf(jump: JumpRecord | null | undefined, task: string): number {
  return jump && jump.ok ? +(jump[task] as number) || 0 : 0;
}

const isSet = (v: unknown) => v != null && v !== '';

/**
 * Penalidad efectiva de cada salto (escribe `_pen` y `_penWhy` en cada uno).
 * La manual del juez manda sobre la automática.
 * 5.6.2.3: más de 300 m fuera del carril = 50 % la primera vez, cero las siguientes.
 * 5.6.3: a menos de 150 m de otro competidor = cero.
 */
export function effectivePenalties(jumps: JumpRecord[]): void {
  const byPilot: Record<string, boolean> = {};
  jumps.slice().sort((a, b) => (a.tExit || 0) - (b.tExit || 0)).forEach((j) => {
    let pen = 0;
    const why: string[] = [];
    if (j.void) { j._pen = 0; j._penWhy = 'Anulado por re-salto'; return; }
    if (isSet(j.penManual)) { pen = +j.penManual!; why.push('Penalidad total fijada a mano por el juez'); }
    else {
      let lane = 0;
      if (isSet(j.laneDecision)) {
        lane = +j.laneDecision!;
        if (lane) why.push('Carril: ' + lane + ' %, decisión del juez');
        if (lane >= 50) byPilot[j.pilotId] = true;
      } else if (j.lanePen) {
        lane = j.lanePen;
        if (j.lanePen === 50) {
          if (byPilot[j.pilotId]) { lane = 100; why.push('Segunda vez a más de 300 m fuera del carril'); }
          else why.push('Más de 300 m fuera del carril');
          byPilot[j.pilotId] = true;
        } else why.push('Fuera del carril (' + j.laneOutside + ' m)');
      }
      let sep = 0;
      if (j.sepViolation && j.sepApply !== false) { sep = 100; why.push('A menos de 150 m de otro competidor (' + j.sepMin + ' m)'); }
      const ex = +(j.exitPen as number) || 0; // 5.5.4.2
      if (ex) why.push('Salida fuera de tiempo: ' + ex + ' %');
      pen = Math.min(100, lane + sep + ex);
    }
    j._pen = pen; j._penWhy = why.join('. ');
  });
}

/** 5.10.1: resultado con la penalidad descontada; distancia en metros enteros, tiempo y velocidad con 1 decimal. */
export function finalResult(jump: JumpRecord, task: string): number {
  const raw = rawOf(jump, task), v = raw - raw * (jump._pen || 0) / 100;
  return task === 'distance' ? roundHalfUp(v, 0) : roundHalfUp(v, 1);
}

/**
 * Clasificación de la jornada.
 * jumps: [{pilotId, task, round, ok, time, distance, speed, lanePen, ...}] — se modifican (campos `_...`).
 * opts.tiebreak = { task }: saltos de desempate (ronda 0), 5.10.6.
 */
export function standings(jumps: JumpRecord[], pilotIds?: string[] | null, opts?: StandingsOptions | null): Standings {
  effectivePenalties(jumps);
  const slots: Record<string, JumpRecord[]> = {};
  const roundsByTask: Record<Task, Record<string, boolean>> = { time: {}, distance: {}, speed: {} };
  const tb: Record<string, number> = {};
  const tbTask = opts && opts.tiebreak && opts.tiebreak.task;
  const tbJumps = jumps.filter((j) => +j.round === 0 && !j.void && isTask(j.task));
  let tbBest = 0;
  tbJumps.forEach((j) => { j._result = finalResult(j, j.task); if (j.task === tbTask && j._result > tbBest) tbBest = j._result; });
  tbJumps.forEach((j) => {
    j._best = tbBest; j._points = tbBest > 0 && j.task === tbTask ? j._result! / tbBest * 100 : 0;
    j._isBest = tbBest > 0 && j._result === tbBest;
    if (j.task === tbTask) tb[j.pilotId] = j._result!;
  });
  jumps.forEach((j) => {
    if (!isTask(j.task) || j.void || +j.round === 0) return;
    const key = j.task + '|' + j.round;
    (slots[key] = slots[key] || []).push(j);
    roundsByTask[j.task][String(j.round)] = true;
    j._result = finalResult(j, j.task);
  });
  Object.keys(slots).forEach((key) => {
    let best = 0;
    slots[key].forEach((j) => { if (j._result! > best) best = j._result!; });
    slots[key].forEach((j) => { // 5.10.2: porcentaje del mejor resultado de la ronda
      j._best = best; j._points = best > 0 ? j._result! / best * 100 : 0; j._isBest = best > 0 && j._result === best;
    });
  });
  const ids = pilotIds ? pilotIds.slice() : [];
  jumps.forEach((j) => { if (ids.indexOf(j.pilotId) < 0) ids.push(j.pilotId); });
  const rows = ids.map((id) => {
    const row = { pilotId: id, tasks: {}, total: 0, jumps: 0 } as StandingRow;
    TASKS.forEach((task) => {
      const rounds = Object.keys(roundsByTask[task]);
      if (!rounds.length) return;
      let sum = 0;
      const cells: Record<string, JumpRecord> = {};
      rounds.forEach((r) => {
        const j = (slots[task + '|' + r] || []).filter((x) => x.pilotId === id)[0];
        if (j) { cells[r] = j; sum += j._points!; row.jumps++; }
      });
      const avg = sum / rounds.length; // 5.10.3: promedio de las rondas de la tarea
      row.tasks[task] = { points: avg, cells };
      row.total += avg;
    });
    row.totalRounded = roundHalfUp(row.total, 1); // 5.10.4
    return row;
  });
  rows.forEach((r) => { r.tb = tb[r.pilotId] != null ? tb[r.pilotId] : null; });
  // 5.10.5 y 5.10.6: más puntos primero; empate, por el salto de desempate
  rows.sort((a, b) => b.totalRounded - a.totalRounded || (b.tb == null ? -1 : b.tb) - (a.tb == null ? -1 : a.tb));
  rows.forEach((r, i) => {
    const p = rows[i - 1];
    r.rank = (p && p.totalRounded === r.totalRounded && p.tb === r.tb) ? p.rank : i + 1; // 5.10.6.2 y 5.10.6.3: empate = mismo puesto
  });
  const rounds = {} as Record<Task, number[]>;
  TASKS.forEach((t) => { rounds[t] = Object.keys(roundsByTask[t]).map(Number).sort((a, b) => a - b); });
  return { rows, rounds, tiebreak: tbJumps };
}
