/* Motor de puntaje Wingsuit Performance (FAI ISC CR Wingsuit Flying 2026).
   Sin dependencias: corre igual en el navegador y en Node (pruebas). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WSP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TASKS = ['time', 'distance', 'speed'];
  var DEFAULT_CFG = {
    elev: 0,          // elevación del DZ, m MSL
    top: 2500,        // límite superior de la ventana, m AGL
    bottom: 1500,     // límite inferior, m AGL
    exitMin: 3200,    // 5.4.6
    exitMax: 3353,    // 5.4.5
    laneWidth: 600,   // 2.2 Designated Lane
    valDelay: 9,      // s después de alcanzar valVs
    valVs: 10,        // m/s
    valBelow: 20,     // la validación termina 20 m debajo de la ventana
    sepLimit: 10,     // SEP < 10 m (3.1.1 / 5.7.4)
    minHz: 5,
    separation: 150   // 5.6.3
  };

  // ---------- utilidades ----------
  function es(n) { return String(n).replace('.', ','); }
  function roundHalfUp(x, d) {
    var m = Math.pow(10, d || 0);
    return Math.floor(x * m + 0.5 + 1e-9) / m;
  }
  var RAD = Math.PI / 180;

  // Distancia geodésica WGS84 (Vincenty inversa), en metros.
  function vincenty(lat1, lon1, lat2, lon2) {
    var a = 6378137, b = 6356752.314245, f = 1 / 298.257223563;
    var L = (lon2 - lon1) * RAD;
    var U1 = Math.atan((1 - f) * Math.tan(lat1 * RAD));
    var U2 = Math.atan((1 - f) * Math.tan(lat2 * RAD));
    var sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
    var lam = L, lamP, it = 100, sS, cS, sig, sA, c2A, c2SM, C;
    do {
      var sL = Math.sin(lam), cL = Math.cos(lam);
      sS = Math.sqrt((cU2 * sL) * (cU2 * sL) + (cU1 * sU2 - sU1 * cU2 * cL) * (cU1 * sU2 - sU1 * cU2 * cL));
      if (sS === 0) return 0;
      cS = sU1 * sU2 + cU1 * cU2 * cL;
      sig = Math.atan2(sS, cS);
      sA = cU1 * cU2 * sL / sS;
      c2A = 1 - sA * sA;
      c2SM = c2A ? cS - 2 * sU1 * sU2 / c2A : 0;
      C = f / 16 * c2A * (4 + f * (4 - 3 * c2A));
      lamP = lam;
      lam = L + (1 - C) * f * sA * (sig + C * sS * (c2SM + C * cS * (-1 + 2 * c2SM * c2SM)));
    } while (Math.abs(lam - lamP) > 1e-12 && --it > 0);
    var u2 = c2A * (a * a - b * b) / (b * b);
    var A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    var B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    var dS = B * sS * (c2SM + B / 4 * (cS * (-1 + 2 * c2SM * c2SM) -
      B / 6 * c2SM * (-3 + 4 * sS * sS) * (-3 + 4 * c2SM * c2SM)));
    return b * A * (sig - dS);
  }

  // Proyección local (este, norte) en metros alrededor de un origen.
  function projector(lat0, lon0) {
    var a = 6378137, e2 = 0.00669437999014;
    var s = Math.sin(lat0 * RAD), w = 1 - e2 * s * s;
    var N = a / Math.sqrt(w), M = a * (1 - e2) / (w * Math.sqrt(w));
    var kx = N * Math.cos(lat0 * RAD) * RAD, ky = M * RAD;
    return function (lat, lon) { return [(lon - lon0) * kx, (lat - lat0) * ky]; };
  }

  // ---------- lectura de archivos ----------
  function parseTime(s) {
    if (s == null) return NaN;
    s = String(s).trim();
    if (s === '') return NaN;
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      var n = parseFloat(s);
      return n > 1e11 ? n / 1000 : n;
    }
    var iso = s.replace(' ', 'T');
    if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
    var t = Date.parse(iso);
    return isNaN(t) ? NaN : t / 1000;
  }

  function colIndex(header) {
    var map = {};
    header.forEach(function (h, i) {
      var k = String(h).trim().toLowerCase().replace(/[\s_\-()\[\]\/]+/g, '');
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

  function rowsToPoints(rows, map) {
    var pts = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var t = parseTime(r[map.time]), lat = parseFloat(r[map.lat]),
        lon = parseFloat(r[map.lon]), alt = parseFloat(r[map.alt]);
      if (!isFinite(t) || !isFinite(lat) || !isFinite(lon) || !isFinite(alt)) continue;
      if (lat === 0 && lon === 0) continue;
      var p = { t: t, lat: lat, lon: lon, alt: alt, vD: null, sep: null };
      if (map.vD != null) { var v = parseFloat(r[map.vD]); if (isFinite(v)) p.vD = v; }
      if (map.hAcc != null && map.vAcc != null) {
        var h = parseFloat(r[map.hAcc]), va = parseFloat(r[map.vAcc]);
        // SEP50 a partir de la exactitud que informa el receptor (misma fórmula que Skyderby)
        if (isFinite(h) && isFinite(va)) p.sep = 0.5127 * (2 * h + va);
      }
      pts.push(p);
    }
    return pts;
  }

  function parseTrack(text, fileName) {
    text = String(text).replace(/^﻿/, '');
    var device = 'Desconocido', pts = [];
    var head = text.slice(0, 2000);

    if (/<gpx[\s>]/i.test(head)) {
      device = 'GPX';
      var re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi, m;
      while ((m = re.exec(text))) {
        var la = /lat="([^"]+)"/i.exec(m[1]), lo = /lon="([^"]+)"/i.exec(m[1]);
        var el = /<ele>([^<]+)<\/ele>/i.exec(m[2]), ti = /<time>([^<]+)<\/time>/i.exec(m[2]);
        if (!la || !lo || !el || !ti) continue;
        var p = { t: parseTime(ti[1]), lat: +la[1], lon: +lo[1], alt: +el[1], vD: null, sep: null };
        if (isFinite(p.t) && isFinite(p.lat) && isFinite(p.lon) && isFinite(p.alt)) pts.push(p);
      }
    } else if (/<kml[\s>]/i.test(head)) {
      device = 'KML';
      var whens = text.match(/<when>[^<]+<\/when>/gi) || [];
      var coords = text.match(/<gx:coord>[^<]+<\/gx:coord>/gi) || [];
      for (var i = 0; i < Math.min(whens.length, coords.length); i++) {
        var c = coords[i].replace(/<[^>]+>/g, '').trim().split(/\s+/);
        var q = { t: parseTime(whens[i].replace(/<[^>]+>/g, '')), lat: +c[1], lon: +c[0], alt: +c[2], vD: null, sep: null };
        if (isFinite(q.t) && isFinite(q.lat) && isFinite(q.lon) && isFinite(q.alt)) pts.push(q);
      }
    } else {
      var lines = text.split(/\r?\n/);
      if (/^\$FLYS/.test(lines[0]) || /\n\$GNSS,/.test(head)) {
        device = 'FlySight 2';
        var cols = null, rows = [];
        for (var j = 0; j < lines.length; j++) {
          var ln = lines[j];
          if (ln.indexOf('$COL,GNSS,') === 0) cols = ln.split(',').slice(2);
          else if (ln.indexOf('$GNSS,') === 0) rows.push(ln.split(',').slice(1));
        }
        if (!cols) cols = ['time', 'lat', 'lon', 'hMSL', 'velN', 'velE', 'velD', 'hAcc', 'vAcc', 'sAcc', 'numSV'];
        pts = rowsToPoints(rows, colIndex(cols));
      } else {
        var sepCh = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
        var first = lines[0].split(sepCh);
        var hasHeader = /[a-df-zA-DF-Z]{2,}/.test(lines[0]) && !/^\d{4}-\d\d-\d\dT/.test(lines[0]);
        var map, start = 0;
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
        var rws = [];
        for (var k = start; k < lines.length; k++) if (lines[k]) rws.push(lines[k].split(sepCh));
        pts = rowsToPoints(rws, map);
      }
    }

    pts.sort(function (a, b) { return a.t - b.t; });
    var out = [];
    for (var n = 0; n < pts.length; n++) if (!out.length || pts[n].t > out[out.length - 1].t) out.push(pts[n]);
    if (out.length < 20) throw new Error('El archivo "' + (fileName || '') + '" no tiene suficientes puntos GPS válidos.');
    fillVerticalSpeed(out);
    return { pts: out, device: device };
  }

  // Si el archivo no trae velocidad vertical, se deriva de la altura (ventana de ~1 s).
  function fillVerticalSpeed(pts) {
    var missing = false;
    for (var i = 0; i < pts.length; i++) if (pts[i].vD == null) { missing = true; break; }
    if (!missing) return;
    var lo = 0, hi = 0;
    for (var j = 0; j < pts.length; j++) {
      while (pts[j].t - pts[lo].t > 0.6) lo++;
      while (hi < pts.length - 1 && pts[hi + 1].t - pts[j].t <= 0.6) hi++;
      var a = lo, b = hi;
      if (a === b) { a = Math.max(0, j - 1); b = Math.min(pts.length - 1, j + 1); }
      var dt = pts[b].t - pts[a].t;
      pts[j].vD = dt > 0 ? (pts[a].alt - pts[b].alt) / dt : 0;
    }
  }

  // ---------- geometría del salto ----------
  function idxAtTime(pts, t) { // primer índice con pts[i].t >= t
    var lo = 0, hi = pts.length - 1;
    if (t <= pts[0].t) return 0;
    if (t > pts[hi].t) return -1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (pts[mid].t < t) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function lerpPoint(a, b, f) {
    return {
      t: a.t + (b.t - a.t) * f, lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f, alt: a.alt + (b.alt - a.alt) * f,
      vD: a.vD + (b.vD - a.vD) * f
    };
  }
  function pointAtTime(pts, t) {
    var i = idxAtTime(pts, t);
    if (i < 0) return null;
    if (i === 0) return t < pts[0].t ? null : lerpPoint(pts[0], pts[0], 0);
    var a = pts[i - 1], b = pts[i];
    return lerpPoint(a, b, (t - a.t) / (b.t - a.t));
  }

  // Salida: primer instante en que la velocidad vertical llega a 10 m/s y se sostiene 3 s.
  function findExit(pts, vs) {
    vs = vs || 10;
    var iMax = 0;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].sep != null && pts[i].sep > 60) continue;
      if (pts[i].alt > pts[iMax].alt) iMax = i;
    }
    function scan(from, hold) {
      for (var i = Math.max(1, from); i < pts.length; i++) {
        if (pts[i].vD < vs) continue;
        var ok = true, j = i, span = 0;
        while (j < pts.length && pts[j].t - pts[i].t <= hold) {
          if (pts[j].vD < vs) { ok = false; break; }
          span = pts[j].t - pts[i].t; j++;
        }
        if (ok && span >= hold * 0.8) return i;
      }
      return -1;
    }
    var from = idxAtTime(pts, pts[iMax].t - 60);
    var idx = scan(from < 0 ? 0 : from, 3);
    if (idx < 0) idx = scan(0, 3);
    if (idx < 0) idx = scan(0, 1);
    if (idx < 0) return null;
    var a = pts[idx - 1], b = pts[idx], f = 1;
    if (a.vD < vs && b.vD > a.vD) f = (vs - a.vD) / (b.vD - a.vD);
    var p = lerpPoint(a, b, f);
    return { i: idx, t: p.t, alt: p.alt, lat: p.lat, lon: p.lon };
  }

  function crossDown(pts, from, altMsl) { // primer cruce descendente de una altura
    for (var i = Math.max(1, from); i < pts.length; i++) {
      if (pts[i].alt <= altMsl) {
        var a = pts[i - 1], b = pts[i];
        if (a.alt <= altMsl) return { i: i, p: lerpPoint(b, b, 0) };
        return { i: i, p: lerpPoint(a, b, (a.alt - altMsl) / (a.alt - b.alt)) };
      }
    }
    return null;
  }

  function groundSpeeds(pts) {
    var gs = new Array(pts.length), lo = 0, hi = 0;
    for (var j = 0; j < pts.length; j++) {
      while (pts[j].t - pts[lo].t > 0.6) lo++;
      while (hi < pts.length - 1 && pts[hi + 1].t - pts[j].t <= 0.6) hi++;
      var a = lo, b = hi;
      if (a === b) { a = Math.max(0, j - 1); b = Math.min(pts.length - 1, j + 1); }
      var dt = pts[b].t - pts[a].t;
      if (dt <= 0) { gs[j] = 0; continue; }
      var pr = projector(pts[j].lat, pts[j].lon);
      var pa = pr(pts[a].lat, pts[a].lon), pb = pr(pts[b].lat, pts[b].lon);
      gs[j] = Math.sqrt((pb[0] - pa[0]) * (pb[0] - pa[0]) + (pb[1] - pa[1]) * (pb[1] - pa[1])) / dt;
    }
    return gs;
  }

  // Apertura (estimada): la velocidad total cae por debajo de 25 m/s durante 1 s.
  function findDeploy(pts, fromIdx) {
    var gs = groundSpeeds(pts);
    for (var i = fromIdx; i < pts.length; i++) {
      var sp = Math.sqrt(gs[i] * gs[i] + pts[i].vD * pts[i].vD);
      if (sp >= 25) continue;
      var ok = true, j = i;
      while (j < pts.length && pts[j].t - pts[i].t <= 1) {
        if (Math.sqrt(gs[j] * gs[j] + pts[j].vD * pts[j].vD) >= 25) { ok = false; break; }
        j++;
      }
      if (ok) return Math.max(pts[fromIdx].t, pts[i].t - 2);
    }
    return null;
  }

  // ---------- puntaje de un salto ----------
  function scoreJump(pts, cfgIn, ref) {
    var cfg = {}; for (var k in DEFAULT_CFG) cfg[k] = (cfgIn && cfgIn[k] != null) ? +cfgIn[k] : DEFAULT_CFG[k];
    var res = { ok: false, flags: [], cfg: cfg };
    var ex = findExit(pts, cfg.valVs);
    if (!ex) { res.error = 'No encontré la salida del avión en el archivo (la velocidad vertical nunca llega a ' + cfg.valVs + ' m/s).'; return res; }
    res.tExit = ex.t; res.exitAgl = ex.alt - cfg.elev;
    res.exitLat = ex.lat; res.exitLon = ex.lon;
    res.tVal = ex.t + cfg.valDelay;
    var pVal = pointAtTime(pts, res.tVal);

    var topMsl = cfg.top + cfg.elev, botMsl = cfg.bottom + cfg.elev;
    if (ex.alt <= topMsl) { res.error = 'La salida (' + Math.round(res.exitAgl) + ' m AGL) fue por debajo del límite superior de la ventana (' + cfg.top + ' m).'; return res; }
    var cTop = crossDown(pts, ex.i, topMsl);
    if (!cTop) { res.error = 'El salto no cruza el límite superior de la ventana (' + cfg.top + ' m AGL).'; return res; }
    var cBot = crossDown(pts, cTop.i, botMsl);
    if (!cBot) { res.error = 'El salto no cruza el límite inferior de la ventana (' + cfg.bottom + ' m AGL).'; return res; }
    var p1 = cTop.p, p2 = cBot.p;
    res.tTop = p1.t; res.tBot = p2.t;
    res.pTop = { lat: p1.lat, lon: p1.lon }; res.pBot = { lat: p2.lat, lon: p2.lon };
    res.time = p2.t - p1.t;
    res.distance = vincenty(p1.lat, p1.lon, p2.lat, p2.lon);
    res.speed = res.time > 0 ? res.distance / res.time * 3.6 : 0;
    res.ok = true;

    // Ventana de validación: desde tVal hasta 20 m debajo de la ventana (2.2)
    var cEnd = crossDown(pts, cBot.i, botMsl - cfg.valBelow);
    var tValEnd = cEnd ? cEnd.p.t : p2.t;
    var i0 = idxAtTime(pts, res.tVal), i1 = idxAtTime(pts, tValEnd);
    if (i0 < 0) i0 = 0; if (i1 < 0) i1 = pts.length - 1;
    var sepMax = null, dts = [], maxGap = 0;
    for (var i = i0; i <= i1; i++) {
      if (pts[i].sep != null && (sepMax == null || pts[i].sep > sepMax)) sepMax = pts[i].sep;
      if (i > i0) { var d = pts[i].t - pts[i - 1].t; dts.push(d); if (d > maxGap) maxGap = d; }
    }
    dts.sort(function (a, b) { return a - b; });
    var med = dts.length ? dts[dts.length >> 1] : 0;
    res.hz = med > 0 ? roundHalfUp(1 / med, 1) : 0;
    res.maxGap = roundHalfUp(maxGap, 2);
    res.sepMax = sepMax == null ? null : roundHalfUp(sepMax, 1);
    if (sepMax == null) res.flags.push({ code: 'sin_sep', level: 'info', text: 'Sin validación de precisión: el archivo no informa exactitud del GPS.' });
    else if (sepMax >= cfg.sepLimit) res.flags.push({ code: 'sep', level: 'warn', text: 'SEP máximo ' + es(res.sepMax) + ' m en la ventana de validación (límite ' + cfg.sepLimit + ' m). En competencia corresponde re-salto (5.7.4).' });
    if (res.hz < cfg.minHz - 0.05) res.flags.push({ code: 'hz', level: 'warn', text: 'El GPS registró a ' + es(res.hz) + ' Hz; FAI exige al menos ' + cfg.minHz + ' Hz (3.1.1).' });
    else if (maxGap > 1) res.flags.push({ code: 'gap', level: 'warn', text: 'Hay un hueco de ' + es(res.maxGap) + ' s sin datos dentro de la ventana de validación.' });
    if (res.exitAgl < cfg.exitMin) res.flags.push({ code: 'exit_low', level: 'warn', text: 'Salida a ' + Math.round(res.exitAgl) + ' m AGL, por debajo del mínimo de ' + cfg.exitMin + ' m (5.4.6).' });
    if (res.exitAgl > cfg.exitMax) res.flags.push({ code: 'exit_high', level: 'warn', text: 'Salida a ' + Math.round(res.exitAgl) + ' m AGL, por encima del máximo de ' + cfg.exitMax + ' m (5.4.5).' });

    for (var gi = ex.i; gi > 0 && ex.t - pts[gi].t < 12; gi--) {
      if (pts[gi].t - pts[gi - 1].t > 1) { res.flags.push({ code: 'exit_gap', level: 'warn', text: 'El GPS no grabó de forma continua justo antes de la salida: el inicio de la validación y del carril puede estar corrido.' }); break; }
    }
    res.tDeploy = findDeploy(pts, cBot.i);

    // Carril designado (2.2, 5.6.2)
    res.lane = null;
    if (ref && isFinite(ref.lat) && isFinite(ref.lon) && pVal) {
      var pr = projector(pVal.lat, pVal.lon);
      var r = pr(ref.lat, ref.lon), len = Math.sqrt(r[0] * r[0] + r[1] * r[1]);
      if (len > 1) {
        var ux = r[0] / len, uy = r[1] / len, dev = 0, devT = res.tVal, side = 0;
        var check = function (p) {
          var q = pr(p.lat, p.lon), c = q[0] * uy - q[1] * ux;
          if (Math.abs(c) > dev) { dev = Math.abs(c); devT = p.t; side = c > 0 ? 1 : -1; }
        };
        var ib = idxAtTime(pts, p2.t); if (ib < 0) ib = pts.length;
        for (var n = i0; n < ib; n++) check(pts[n]);
        check(p2);
        var outside = Math.max(0, dev - cfg.laneWidth / 2), pen = 0;
        if (outside > 300) pen = 50; else if (outside >= 150) pen = 20; else if (outside > 0) pen = 10;
        res.lane = {
          dev: roundHalfUp(dev, 1), outside: roundHalfUp(outside, 1), penalty: pen, t: devT, side: side,
          start: { lat: pVal.lat, lon: pVal.lon }, bearing: (Math.atan2(ux, uy) / RAD + 360) % 360, length: len
        };
      }
    }
    return res;
  }

  // Distancia mínima entre dos saltos sincronizados por hora GPS (5.6.3).
  function minSeparation(ptsA, sA, ptsB, sB) {
    if (!sA.ok || !sB.ok) return null;
    var t0 = Math.max(sA.tVal, sB.tVal);
    var t1 = Math.min(sA.tDeploy || sA.tBot, sB.tDeploy || sB.tBot);
    if (t1 - t0 < 1) return null;
    var best = null;
    for (var t = t0; t <= t1; t += 0.1) {
      var a = pointAtTime(ptsA, t), b = pointAtTime(ptsB, t);
      if (!a || !b) continue;
      var q = projector(a.lat, a.lon)(b.lat, b.lon);
      var h = Math.sqrt(q[0] * q[0] + q[1] * q[1]), dz = a.alt - b.alt;
      var d3 = Math.sqrt(h * h + dz * dz);
      if (!best || d3 < best.d3) best = { d3: d3, h: h, dz: Math.abs(dz), t: t };
    }
    if (best) { best.d3 = roundHalfUp(best.d3, 0); best.h = roundHalfUp(best.h, 0); best.dz = roundHalfUp(best.dz, 0); }
    return best;
  }

  // ---------- track compacto (para guardar y re-puntuar) ----------
  function trimTrack(pts, score) {
    var t0 = (score.tExit || pts[0].t) - 15;
    var t1 = score.ok ? (score.tDeploy != null ? score.tDeploy + 8 : score.tBot + 30) : pts[pts.length - 1].t;
    var out = [];
    for (var i = 0; i < pts.length; i++) if (pts[i].t >= t0 && pts[i].t <= t1) out.push(pts[i]);
    return out;
  }
  function packTrack(pts) {
    var t0 = pts[0].t, o = { v: 1, t0: t0, n: pts.length, t: [], la: [], lo: [], al: [], vd: [], se: [] };
    var pt = 0, pla = 0, plo = 0, pal = 0, hasSep = false;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var t = Math.round((p.t - t0) * 1000), la = Math.round(p.lat * 1e7), lo = Math.round(p.lon * 1e7), al = Math.round(p.alt * 100);
      o.t.push(t - pt); o.la.push(la - pla); o.lo.push(lo - plo); o.al.push(al - pal);
      o.vd.push(Math.round(p.vD * 100));
      if (p.sep != null) hasSep = true;
      o.se.push(p.sep == null ? -1 : Math.min(9999, Math.round(p.sep * 10)));
      pt = t; pla = la; plo = lo; pal = al;
    }
    if (!hasSep) o.se = null;
    ['t', 'la', 'lo', 'al', 'vd', 'se'].forEach(function (k) { if (o[k]) o[k] = o[k].join(','); });
    return o;
  }
  function unpackTrack(o) {
    var c = {};
    ['t', 'la', 'lo', 'al', 'vd', 'se'].forEach(function (k) { c[k] = o[k] ? String(o[k]).split(',').map(Number) : null; });
    var pts = [], t = 0, la = 0, lo = 0, al = 0;
    for (var i = 0; i < c.t.length; i++) {
      t += c.t[i]; la += c.la[i]; lo += c.lo[i]; al += c.al[i];
      pts.push({
        t: o.t0 + t / 1000, lat: la / 1e7, lon: lo / 1e7, alt: al / 100, vD: c.vd[i] / 100,
        sep: c.se && c.se[i] >= 0 ? c.se[i] / 10 : null
      });
    }
    return pts;
  }

  // ---------- resultados y clasificación (5.10) ----------
  function rawOf(jump, task) { return jump && jump.ok ? +jump[task] || 0 : 0; }

  // Penalidad efectiva de cada salto. La manual del juez manda sobre la automática.
  // 5.6.2.3: más de 300 m fuera del carril = 50 % la primera vez, cero las siguientes.
  function effectivePenalties(jumps) {
    var byPilot = {};
    jumps.slice().sort(function (a, b) { return (a.tExit || 0) - (b.tExit || 0); }).forEach(function (j) {
      var pen = 0, why = [];
      if (j.void) { j._pen = 0; j._penWhy = 'Anulado por re-salto'; return; }
      if (j.penManual != null && j.penManual !== '') { pen = +j.penManual; why.push('Penalidad total fijada a mano por el juez'); }
      else {
        var lane = 0;
        if (j.laneDecision != null && j.laneDecision !== '') {
          lane = +j.laneDecision;
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
        var sep = 0;
        if (j.sepViolation && j.sepApply !== false) { sep = 100; why.push('A menos de 150 m de otro competidor (' + j.sepMin + ' m)'); }
        var ex = +j.exitPen || 0;
        if (ex) why.push('Salida fuera de tiempo: ' + ex + ' %');
        pen = Math.min(100, lane + sep + ex);
      }
      j._pen = pen; j._penWhy = why.join('. ');
    });
  }

  function finalResult(jump, task) { // 5.10.1
    var raw = rawOf(jump, task), v = raw - raw * (jump._pen || 0) / 100;
    return task === 'distance' ? roundHalfUp(v, 0) : roundHalfUp(v, 1);
  }

  // jumps: [{pilotId, task, round, ok, time, distance, speed, lanePen, ...}]
  // opts.tiebreak = { task } : saltos de desempate (ronda 0), FAI 5.10.6
  function standings(jumps, pilotIds, opts) {
    effectivePenalties(jumps);
    var slots = {}, roundsByTask = { time: {}, distance: {}, speed: {} }, tb = {};
    var tbTask = opts && opts.tiebreak && opts.tiebreak.task;
    var tbJumps = jumps.filter(function (j) { return +j.round === 0 && !j.void && TASKS.indexOf(j.task) >= 0; });
    var tbBest = 0;
    tbJumps.forEach(function (j) { j._result = finalResult(j, j.task); if (j.task === tbTask && j._result > tbBest) tbBest = j._result; });
    tbJumps.forEach(function (j) { j._best = tbBest; j._points = tbBest > 0 && j.task === tbTask ? j._result / tbBest * 100 : 0; j._isBest = tbBest > 0 && j._result === tbBest; if (j.task === tbTask) tb[j.pilotId] = j._result; });
    jumps.forEach(function (j) {
      if (TASKS.indexOf(j.task) < 0 || j.void || +j.round === 0) return;
      var key = j.task + '|' + j.round;
      (slots[key] = slots[key] || []).push(j);
      roundsByTask[j.task][j.round] = true;
      j._result = finalResult(j, j.task);
    });
    Object.keys(slots).forEach(function (key) {
      var best = 0;
      slots[key].forEach(function (j) { if (j._result > best) best = j._result; });
      slots[key].forEach(function (j) { // 5.10.2
        j._best = best; j._points = best > 0 ? j._result / best * 100 : 0; j._isBest = best > 0 && j._result === best;
      });
    });
    var ids = pilotIds ? pilotIds.slice() : [];
    jumps.forEach(function (j) { if (ids.indexOf(j.pilotId) < 0) ids.push(j.pilotId); });
    var rows = ids.map(function (id) {
      var row = { pilotId: id, tasks: {}, total: 0, jumps: 0 };
      TASKS.forEach(function (task) {
        var rounds = Object.keys(roundsByTask[task]);
        if (!rounds.length) return;
        var sum = 0, cells = {};
        rounds.forEach(function (r) {
          var j = (slots[task + '|' + r] || []).filter(function (x) { return x.pilotId === id; })[0];
          if (j) { cells[r] = j; sum += j._points; row.jumps++; }
        });
        var avg = sum / rounds.length; // 5.10.3
        row.tasks[task] = { points: avg, cells: cells };
        row.total += avg;
      });
      row.totalRounded = roundHalfUp(row.total, 1); // 5.10.4
      return row;
    });
    rows.forEach(function (r) { r.tb = tb[r.pilotId] != null ? tb[r.pilotId] : null; });
    rows.sort(function (a, b) { return b.totalRounded - a.totalRounded || (b.tb == null ? -1 : b.tb) - (a.tb == null ? -1 : a.tb); }); // 5.10.5, 5.10.6
    rows.forEach(function (r, i) {
      var p = rows[i - 1];
      r.rank = (p && p.totalRounded === r.totalRounded && p.tb === r.tb) ? p.rank : i + 1; // 5.10.6.2 y 5.10.6.3: empate = mismo puesto
    });
    var rounds = {};
    TASKS.forEach(function (t) { rounds[t] = Object.keys(roundsByTask[t]).map(Number).sort(function (a, b) { return a - b; }); });
    return { rows: rows, rounds: rounds, tiebreak: tbJumps };
  }

  return {
    TASKS: TASKS, DEFAULT_CFG: DEFAULT_CFG, roundHalfUp: roundHalfUp, vincenty: vincenty, projector: projector,
    parseTrack: parseTrack, findExit: findExit, scoreJump: scoreJump, minSeparation: minSeparation,
    pointAtTime: pointAtTime, groundSpeeds: groundSpeeds, trimTrack: trimTrack, packTrack: packTrack,
    unpackTrack: unpackTrack, standings: standings, finalResult: finalResult, effectivePenalties: effectivePenalties
  };
});
