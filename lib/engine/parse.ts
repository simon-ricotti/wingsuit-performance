// Lectura de archivos de GPS: FlySight 1, FlySight 2, Deep and Steep, GPX, KML y CSV genérico.
// 3.1.1: el reglamento exige un receptor de al menos 5 Hz que informe exactitud; acá solo se lee,
// los avisos de Hz y SEP los arma scoreJump.
import type { ParsedTrack, TrackPoint } from './types';

interface RawPoint extends Omit<TrackPoint, 'vD'> {
  vD: number | null;
}

interface ColMap {
  time?: number;
  lat?: number;
  lon?: number;
  alt?: number;
  vN?: number;
  vE?: number;
  vD?: number;
  hAcc?: number;
  vAcc?: number;
}

export function parseTime(s: unknown): number {
  if (s == null) return NaN;
  const str = String(s).trim();
  if (str === '') return NaN;
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const n = parseFloat(str);
    return n > 1e11 ? n / 1000 : n;
  }
  let iso = str.replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const t = Date.parse(iso);
  return isNaN(t) ? NaN : t / 1000;
}

function colIndex(header: string[]): ColMap {
  const map: ColMap = {};
  header.forEach((h, i) => {
    const k = String(h).trim().toLowerCase().replace(/[\s_\-()\[\]\/]+/g, '');
    if (map.time == null && /^(time|timestamp|datetime|utc|gpstime|date)/.test(k)) map.time = i;
    else if (map.lat == null && /^lat/.test(k)) map.lat = i;
    else if (map.lon == null && /^(lon|lng)/.test(k)) map.lon = i;
    else if (map.alt == null && /^(hmsl|alt|ele|height)/.test(k)) map.alt = i;
    else if (k === 'veln') map.vN = i;
    else if (k === 'vele') map.vE = i;
    else if (k === 'veld') map.vD = i;
    else if (k === 'hacc') map.hAcc = i;
    else if (k === 'vacc') map.vAcc = i;
  });
  return map;
}

function rowsToPoints(rows: string[][], map: ColMap): RawPoint[] {
  const pts: RawPoint[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const t = parseTime(r[map.time!]), lat = parseFloat(r[map.lat!]),
      lon = parseFloat(r[map.lon!]), alt = parseFloat(r[map.alt!]);
    if (!isFinite(t) || !isFinite(lat) || !isFinite(lon) || !isFinite(alt)) continue;
    if (lat === 0 && lon === 0) continue;
    const p: RawPoint = { t, lat, lon, alt, vD: null, sep: null };
    if (map.vD != null) { const v = parseFloat(r[map.vD]); if (isFinite(v)) p.vD = v; }
    if (map.hAcc != null && map.vAcc != null) {
      const h = parseFloat(r[map.hAcc]), va = parseFloat(r[map.vAcc]);
      // SEP50 a partir de la exactitud que informa el receptor (misma fórmula que Skyderby)
      if (isFinite(h) && isFinite(va)) p.sep = 0.5127 * (2 * h + va);
    }
    pts.push(p);
  }
  return pts;
}

export function parseTrack(input: string, fileName?: string): ParsedTrack {
  const text = String(input).replace(/^﻿/, '');
  let device = 'Desconocido', pts: RawPoint[] = [];
  const head = text.slice(0, 2000);

  if (/<gpx[\s>]/i.test(head)) {
    device = 'GPX';
    const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const la = /lat="([^"]+)"/i.exec(m[1]), lo = /lon="([^"]+)"/i.exec(m[1]);
      const el = /<ele>([^<]+)<\/ele>/i.exec(m[2]), ti = /<time>([^<]+)<\/time>/i.exec(m[2]);
      if (!la || !lo || !el || !ti) continue;
      const p: RawPoint = { t: parseTime(ti[1]), lat: +la[1], lon: +lo[1], alt: +el[1], vD: null, sep: null };
      if (isFinite(p.t) && isFinite(p.lat) && isFinite(p.lon) && isFinite(p.alt)) pts.push(p);
    }
  } else if (/<kml[\s>]/i.test(head)) {
    device = 'KML';
    const whens = text.match(/<when>[^<]+<\/when>/gi) || [];
    const coords = text.match(/<gx:coord>[^<]+<\/gx:coord>/gi) || [];
    for (let i = 0; i < Math.min(whens.length, coords.length); i++) {
      const c = coords[i].replace(/<[^>]+>/g, '').trim().split(/\s+/);
      const q: RawPoint = { t: parseTime(whens[i].replace(/<[^>]+>/g, '')), lat: +c[1], lon: +c[0], alt: +c[2], vD: null, sep: null };
      if (isFinite(q.t) && isFinite(q.lat) && isFinite(q.lon) && isFinite(q.alt)) pts.push(q);
    }
  } else {
    const lines = text.split(/\r?\n/);
    if (/^\$FLYS/.test(lines[0]) || /\n\$GNSS,/.test(head)) {
      device = 'FlySight 2';
      let cols: string[] | null = null;
      const rows: string[][] = [];
      for (let j = 0; j < lines.length; j++) {
        const ln = lines[j];
        if (ln.indexOf('$COL,GNSS,') === 0) cols = ln.split(',').slice(2);
        else if (ln.indexOf('$GNSS,') === 0) rows.push(ln.split(',').slice(1));
      }
      if (!cols) cols = ['time', 'lat', 'lon', 'hMSL', 'velN', 'velE', 'velD', 'hAcc', 'vAcc', 'sAcc', 'numSV'];
      pts = rowsToPoints(rows, colIndex(cols));
    } else {
      const sepCh = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
      const first = lines[0].split(sepCh);
      const hasHeader = /[a-df-zA-DF-Z]{2,}/.test(lines[0]) && !/^\d{4}-\d\d-\d\dT/.test(lines[0]);
      let map: ColMap | undefined, start = 0;
      if (hasHeader) {
        map = colIndex(first);
        start = 1;
        if (map.vD != null && map.hAcc != null) device = /headAcc/i.test(lines[0]) ? 'Deep and Steep' : 'FlySight';
        else device = 'CSV';
      } else if (first.length >= 10 && /^\d{4}-\d\d-\d\dT/.test(first[0])) {
        device = 'FlySight (sin encabezado)';
        map = { time: 0, lat: 1, lon: 2, alt: 3, vN: 4, vE: 5, vD: 6, hAcc: 7, vAcc: 8 };
      }
      if (!map || map.time == null || map.lat == null || map.lon == null || map.alt == null) {
        throw new Error('No reconozco el formato de "' + (fileName || 'archivo') +
          '". Hacen falta columnas de hora, latitud, longitud y altura.');
      }
      const rws: string[][] = [];
      for (let k = start; k < lines.length; k++) if (lines[k]) rws.push(lines[k].split(sepCh));
      pts = rowsToPoints(rws, map);
    }
  }

  pts.sort((a, b) => a.t - b.t);
  const out: RawPoint[] = [];
  for (let n = 0; n < pts.length; n++) if (!out.length || pts[n].t > out[out.length - 1].t) out.push(pts[n]);
  if (out.length < 20) throw new Error('El archivo "' + (fileName || '') + '" no tiene suficientes puntos GPS válidos.');
  return { pts: fillVerticalSpeed(out), device };
}

/** Si el archivo no trae velocidad vertical, se deriva de la altura (ventana de ~1 s). */
function fillVerticalSpeed(pts: RawPoint[]): TrackPoint[] {
  let missing = false;
  for (let i = 0; i < pts.length; i++) if (pts[i].vD == null) { missing = true; break; }
  if (!missing) return pts as TrackPoint[];
  let lo = 0, hi = 0;
  for (let j = 0; j < pts.length; j++) {
    while (pts[j].t - pts[lo].t > 0.6) lo++;
    while (hi < pts.length - 1 && pts[hi + 1].t - pts[j].t <= 0.6) hi++;
    let a = lo, b = hi;
    if (a === b) { a = Math.max(0, j - 1); b = Math.min(pts.length - 1, j + 1); }
    const dt = pts[b].t - pts[a].t;
    pts[j].vD = dt > 0 ? (pts[a].alt - pts[b].alt) / dt : 0;
  }
  return pts as TrackPoint[];
}
