/* Pantalla de revisión del juez: mapa del carril y gráficos de velocidad vertical y precisión. */
(function () {
  'use strict';
  var W = window.WSP, token = 0;

  function css() {
    var cs = getComputedStyle(document.documentElement), o = {};
    ['--ink', '--ink-2', '--line', '--lane', '--surface', '--accent', '--warn', '--bad', '--good', '--bg'].forEach(function (k) { o[k] = cs.getPropertyValue(k).trim(); });
    o.font = cs.getPropertyValue('--font-body').trim() || 'sans-serif';
    return o;
  }
  function prep(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    return { c: c, w: w, h: h };
  }
  function fmt(n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0).replace('.', ','); }

  // Desvío máximo respecto del eje del carril, igual que el motor (5.6.2).
  function laneGeom(pts, j, ref) {
    var a = W.pointAtTime(pts, j.tVal);
    if (!a || !ref) return null;
    var pr = W.projector(a.lat, a.lon), r = pr(ref.lat, ref.lon), L = Math.hypot(r[0], r[1]);
    if (L < 1) return null;
    var ux = r[0] / L, uy = r[1] / L, best = { dev: 0, p: a, along: 0 };
    pts.forEach(function (p) {
      if (p.t < j.tVal || p.t > j.tBot) return;
      var q = pr(p.lat, p.lon), c = q[0] * uy - q[1] * ux;
      if (Math.abs(c) > Math.abs(best.dev)) best = { dev: c, p: p, along: q[0] * ux + q[1] * uy };
    });
    return { start: a, ref: ref, pr: pr, ux: ux, uy: uy, len: L, max: best };
  }

  function drawMap(cv, pts, j, ref, laneW, K, cfg) {
    var g = prep(cv), c = g.c, pad = 28;
    var t0 = j.tExit - 5, t1 = j.tDeploy != null ? j.tDeploy + 3 : j.tBot + 20;
    var seg = pts.filter(function (p) { return p.t >= t0 && p.t <= t1; });
    if (seg.length < 2) seg = pts;
    var lg = laneGeom(pts, j, ref);
    var org = lg ? lg.start : seg[0], pr = W.projector(org.lat, org.lon);
    var xy = function (p) { return pr(p.lat, p.lon); };
    var P = seg.map(xy), ext = P.slice();
    var half = laneW / 2;
    if (lg) {
      var rr = xy(lg.ref), nx = -lg.uy, ny = lg.ux;
      [[0, 0], rr].forEach(function (b) { ext.push([b[0] + nx * (half + 160), b[1] + ny * (half + 160)]); ext.push([b[0] - nx * (half + 160), b[1] - ny * (half + 160)]); });
    }
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    ext.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    var sc = Math.min((g.w - 2 * pad) / Math.max(1, x1 - x0), (g.h - 2 * pad) / Math.max(1, y1 - y0));
    var ox = pad + ((g.w - 2 * pad) - (x1 - x0) * sc) / 2, oy = pad + ((g.h - 2 * pad) - (y1 - y0) * sc) / 2;
    var S = function (q) { return [ox + (q[0] - x0) * sc, oy + (y1 - q[1]) * sc]; };
    c.font = '12px ' + K.font;
    if (lg) {
      var rr2 = xy(lg.ref), nx2 = -lg.uy, ny2 = lg.ux;
      var band = function (wa, wb, col, op) {
        [1, -1].forEach(function (s) {
          var q = [[0, 0, wa], [0, 0, wb], [rr2[0], rr2[1], wb], [rr2[0], rr2[1], wa]].map(function (z) { return S([z[0] + nx2 * z[2] * s, z[1] + ny2 * z[2] * s]); });
          c.beginPath(); q.forEach(function (v, i) { if (i) c.lineTo(v[0], v[1]); else c.moveTo(v[0], v[1]); }); c.closePath();
          c.fillStyle = col; c.globalAlpha = op; c.fill(); c.globalAlpha = 1;
        });
      };
      band(0, half, K['--lane'], 0.13);
      band(half, half + 150, K['--warn'], 0.12);
      band(half + 150, half + 300, K['--accent'], 0.12);
      band(half + 300, half + 380, K['--bad'], 0.10);
      var s0 = S([0, 0]), s1 = S(rr2);
      c.strokeStyle = K['--lane']; c.setLineDash([6, 5]); c.lineWidth = 1; c.beginPath(); c.moveTo(s0[0], s0[1]); c.lineTo(s1[0], s1[1]); c.stroke(); c.setLineDash([]);
      c.strokeStyle = K['--ink']; c.lineWidth = 2; c.beginPath(); c.moveTo(s1[0] - 6, s1[1] - 6); c.lineTo(s1[0] + 6, s1[1] + 6); c.moveTo(s1[0] - 6, s1[1] + 6); c.lineTo(s1[0] + 6, s1[1] - 6); c.stroke();
      c.fillStyle = K['--ink-2']; c.fillText('Punto ' + (ref.name || ''), s1[0] + 9, s1[1] + 4);
    }
    // track: gris fuera de la ventana, acento dentro
    c.lineJoin = 'round';
    c.strokeStyle = K['--ink-2']; c.lineWidth = 1.5; c.beginPath();
    seg.forEach(function (p, i) { var v = S(xy(p)); if (i) c.lineTo(v[0], v[1]); else c.moveTo(v[0], v[1]); }); c.stroke();
    c.strokeStyle = K['--accent']; c.lineWidth = 3; c.beginPath(); var started = false;
    seg.forEach(function (p) { if (p.t < j.tTop || p.t > j.tBot) return; var v = S(xy(p)); if (started) c.lineTo(v[0], v[1]); else { c.moveTo(v[0], v[1]); started = true; } }); c.stroke();
    var dot = function (p, col, label, r, below) { if (!p) return; var v = S(xy(p)); c.fillStyle = col; c.beginPath(); c.arc(v[0], v[1], r || 5, 0, 6.3); c.fill(); if (label) { c.fillStyle = K['--ink']; c.fillText(label, v[0] + 8, v[1] + (below ? 16 : -6)); } };
    dot(W.pointAtTime(pts, j.tExit), K['--ink'], 'Salida');
    dot(W.pointAtTime(pts, j.tTop), K['--accent'], Math.round(cfg.top) + ' m');
    dot(W.pointAtTime(pts, j.tBot), K['--accent'], Math.round(cfg.bottom) + ' m');
    if (lg) {
      dot(lg.start, K['--lane'], 'Inicio del carril', 6, true);
      var mp = lg.max.p, mv = S(xy(mp)), foot = S([lg.ux * lg.max.along, lg.uy * lg.max.along]);
      c.strokeStyle = K['--bad']; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(mv[0], mv[1]); c.lineTo(foot[0], foot[1]); c.stroke(); c.setLineDash([]);
      c.fillStyle = K['--bad']; c.beginPath(); c.arc(mv[0], mv[1], 6, 0, 6.3); c.fill();
      c.font = '600 13px ' + K.font; c.fillStyle = K['--ink'];
      c.fillText('Máximo: ' + fmt(Math.abs(lg.max.dev), 0) + ' m del eje', mv[0] + 10, mv[1] + 16);
    }
    // norte y escala
    c.font = '12px ' + K.font; c.fillStyle = K['--ink-2'];
    c.beginPath(); c.moveTo(g.w - 22, 14); c.lineTo(g.w - 28, 30); c.lineTo(g.w - 16, 30); c.closePath(); c.fill(); c.fillText('N', g.w - 26, 44);
    var bar = [100, 200, 500, 1000, 2000].filter(function (m) { return m * sc < g.w / 4; }).pop() || 100;
    c.strokeStyle = K['--ink-2']; c.lineWidth = 2; c.beginPath(); c.moveTo(14, g.h - 14); c.lineTo(14 + bar * sc, g.h - 14); c.stroke();
    c.fillText(bar + ' m', 14, g.h - 20);
    return lg;
  }

  function drawCharts(cv, pts, j, cfg, K) {
    var g = prep(cv), c = g.c, L = 46, R = 12, gap = 26, top = 14;
    var t0 = j.tExit - 6, t1 = j.tBot + 6;
    var seg = pts.filter(function (p) { return p.t >= t0 && p.t <= t1; });
    var X = function (t) { return L + (t - t0) / (t1 - t0) * (g.w - L - R); };
    var hh = (g.h - top - gap - 44) / 2;
    var panels = [
      { y: top, key: 'vD', label: 'Velocidad vertical (m/s)', max: Math.max(12, Math.max.apply(null, seg.map(function (p) { return p.vD || 0; })) + 2), line: cfg.valVs, lineLabel: cfg.valVs + ' m/s', lineCol: K['--lane'] },
      { y: top + hh + gap, key: 'sep', label: 'Precisión del GPS, SEP (m)', max: Math.max(14, Math.max.apply(null, seg.map(function (p) { return p.sep || 0; })) + 2), line: cfg.sepLimit, lineLabel: 'límite ' + cfg.sepLimit + ' m', lineCol: K['--bad'] }
    ];
    c.font = '12px ' + K.font;
    var valEnd = j.tBot + 2;
    panels.forEach(function (pn) {
      var Y = function (v) { return pn.y + hh - Math.max(0, Math.min(v, pn.max)) / pn.max * hh; };
      c.fillStyle = K['--lane']; c.globalAlpha = 0.08; c.fillRect(X(j.tVal), pn.y, X(valEnd) - X(j.tVal), hh); c.globalAlpha = 1;
      c.fillStyle = K['--accent']; c.globalAlpha = 0.08; c.fillRect(X(j.tTop), pn.y, X(j.tBot) - X(j.tTop), hh); c.globalAlpha = 1;
      c.strokeStyle = K['--line']; c.lineWidth = 1; c.strokeRect(L, pn.y, g.w - L - R, hh);
      c.fillStyle = K['--ink-2']; c.textAlign = 'right';
      [0, pn.max / 2, pn.max].forEach(function (v) { c.fillText(fmt(v, 0), L - 6, Y(v) + 4); });
      c.textAlign = 'left'; c.fillStyle = K['--ink']; c.fillText(pn.label, L + 6, pn.y + 14);
      c.strokeStyle = pn.lineCol; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(L, Y(pn.line)); c.lineTo(g.w - R, Y(pn.line)); c.stroke(); c.setLineDash([]);
      c.fillStyle = pn.lineCol; c.textAlign = 'right'; c.fillText(pn.lineLabel, g.w - R - 4, Y(pn.line) - 4); c.textAlign = 'left';
      var has = seg.some(function (p) { return p[pn.key] != null; });
      if (!has) { c.fillStyle = K['--ink-2']; c.fillText('El archivo no informa este dato', L + 6, pn.y + hh / 2); return; }
      c.strokeStyle = K['--ink']; c.lineWidth = 1.6; c.beginPath(); var st = false;
      seg.forEach(function (p) { if (p[pn.key] == null) return; var x = X(p.t), y = Y(p[pn.key]); if (st) c.lineTo(x, y); else { c.moveTo(x, y); st = true; } }); c.stroke();
    });
    // marcas verticales
    var rowEnd = [-1e9, -1e9];
    [[j.tExit, 'Salida', K['--ink']], [j.tVal, 'Inicio validación', K['--lane']], [j.tTop, Math.round(cfg.top) + ' m', K['--accent']], [j.tBot, Math.round(cfg.bottom) + ' m', K['--accent']]].filter(function (m) { return m[0] != null; }).sort(function (a, b) { return a[0] - b[0]; }).forEach(function (m) {
      var x = X(m[0]); c.strokeStyle = m[2]; c.lineWidth = 1; c.beginPath(); c.moveTo(x, top); c.lineTo(x, top + 2 * hh + gap); c.stroke();
      var w = c.measureText(m[1]).width, x0 = Math.max(2, Math.min(g.w - w - 2, x - w / 2)), row = x0 > rowEnd[0] + 6 ? 0 : 1;
      rowEnd[row] = x0 + w; c.fillStyle = m[2]; c.textAlign = 'left'; c.fillText(m[1], x0, top + 2 * hh + gap + 16 + row * 15);
    });
    c.textAlign = 'left';
  }

  window.Review = {
    mount: async function (ev, j, cfg, ref, laneW, getTrack, jid) {
      var my = ++token;
      var map = document.getElementById('rv-map'), ch = document.getElementById('rv-charts');
      if (!map || !ch) return;
      var pts = await getTrack(ev.id, jid);
      if (my !== token || !document.getElementById('rv-map')) return;
      var K = css();
      if (!pts) { var m = document.getElementById('rv-msg'); if (m) m.textContent = 'No encuentro el track de este salto.'; return; }
      drawMap(map, pts, j, ref, laneW, K, cfg);
      drawCharts(ch, pts, j, cfg, K);
    }
  };
})();
