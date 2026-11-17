// Results spreadsheet (exportCsv in the previous platform): ';'-separated with a BOM so Excel reads the accents.
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { TASKS, type Task } from '@/lib/engine';
import { cfgLine, judgingLabel, judgingOf, profileDiffs } from '@/lib/events/settings';
import { TASK_LABEL, TASK_UNIT } from '@/lib/jumps/score';
import { loadEventResults, slug } from '@/lib/standings/load';
import { fmt, fmtTask, jumpStatus } from '@/lib/standings/views';

const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const dec = (x: unknown, d: number) => (x == null || x === '' ? '' : fmt(x as number, d));

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || (s.role !== 'admin' && s.role !== 'judge')) return new NextResponse('No tenés permiso.', { status: 403 });
  const r = await loadEventResults(await createClient(), id);
  if (!r) return new NextResponse('La jornada no existe.', { status: 404 });
  const { ev, st, jumps, name } = r;
  const validated = (ev.validated ?? {}) as Record<string, { by?: string }>;

  const rows: unknown[][] = [
    ['Jornada', ev.name], ['Fecha', ev.date ?? ''], ['DZ', ev.dz], ['Configuración', cfgLine(ev)], ['Perfil', judgingLabel(judgingOf(ev.judging))],
    ['Diferencias con FAI 2026', profileDiffs(ev).join('; ') || 'ninguna'], [],
    ['Puesto', 'Piloto', ...TASKS.map((t) => `${TASK_LABEL[t]} (pts)`), 'Total'],
    ...st.rows.filter((x) => x.jumps).map((x) => [x.rank, name(x.pilotId), ...TASKS.map((t) => dec(x.tasks[t]?.points, 1)), dec(x.totalRounded, 1)]),
    [],
    ['Piloto', 'Tarea', 'Ronda', 'Resultado', 'Unidad', 'Tiempo (s)', 'Distancia (m)', 'Velocidad (km/h)', 'Salida (m AGL)', 'Penalidad (%)', 'Motivo', 'Puntos (%)', 'Estado', 'Revisado por', 'Tarea validada', 'Equipo', 'Archivo', 'SHA-256', 'Notas'],
    ...[...jumps].sort((a, b) => +a.round - +b.round || TASKS.indexOf(a.task as Task) - TASKS.indexOf(b.task as Task) || name(a.pilotId).localeCompare(name(b.pilotId))).map((j) => {
      const v = validated[`${j.task}|${j.round}`];
      return [name(j.pilotId), TASK_LABEL[j.task as Task], j.round, j.void ? 'anulado' : fmtTask(j.task, j._result), TASK_UNIT[j.task as Task],
        dec(j.time, 2), dec(j.distance, 1), dec(j.speed, 1), j.exitAgl, j._pen || 0, j._penWhy || '', dec(j._points, 1), jumpStatus(ev, j).label,
        ((j.reviews as { name: string }[]) ?? []).map((x) => x.name).join(', '), v ? `sí, ${v.by ?? ''}` : 'no',
        j.device, j.fileName, j.fileHash ?? '', j.notes ?? '']; // 'Equipo' is the GPS device, as in the previous platform
    }),
  ];
  const body = '﻿' + rows.map((row) => row.map(cell).join(';')).join('\r\n');
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug(ev.name)}-resultados.csv"`, 'Cache-Control': 'private, no-store' },
  });
}
