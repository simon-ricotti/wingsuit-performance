/* Replay: reproduce y superpone los saltos de una tanda. */
(function () {
  'use strict';
  var W = window.WSP, A = null;
  var R = { items: [], t: 0, tMin: 0, tMax: 1, playing: false, speed: 4, raf: 0, last: 0, token: 0, lastBoard: 0, css: {} };

  function sample(it, t) {
    var tr = it.tr, n = tr.length;
    if (t <= tr[0]) return at(it, 0, 0, 0);
    if (t >= tr[n - 1]) return at(it, n - 1, n - 1, 0);
    var lo = 0, hi = n - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (tr[mid] < t) lo = mid + 1; else hi = mid; }
    var a = lo - 1, f = (t - tr[a]) / (tr[lo] - tr[a]);
    return at(it, a, lo, f);
  }
  function at(it, a, b, f) {
    function L(arr) { return arr[a] + (arr[b] - arr[a]) * f; }
    return { agl: L(it.agl), d: L(it.d), px: L(it.px), py: L(it.py), gs: L(it.gs), vd: L(it.vd), i: b };
  }

  function build(data) {
    R.altK = data.altFt ? 1 / 0.3048 : 1; R.altU = data.altFt ? 'ft' : 'm'; R.task = data.task; R.cfg = data.cfg; R.sync = data.sync; R.plan = data.plan; R.speed = data.speed;
    var common0 = Infinity, first = data.items[0];
    data.items.forEach(function (it) { if (it.jump.tTop < common0) common0 = it.jump.tTop; });
    var commonPr = null;
    if (first) { var o0 = W.pointAtTime(first.pts, first.jump.tTop); commonPr = W.projector(o0.lat, o0.lon); R.origin0 = o0; }
    R.items = data.items.map(function (it) {
      var j = it.jump, pts = it.pts;
      var o = W.pointAtTime(pts, j.tTop), e = W.pointAtTime(pts, j.tBot);
      var pr = W.projector(o.lat, o.lon), ev = pr(e.lat, e.lon), ang = Math.atan2(ev[0], ev[1]);
      var gs = W.groundSpeeds(pts);
      var sync0 = R.sync === 'window' ? j.tTop : R.sync === 'exit' ? j.tExit : common0;
      var out = { jump: j, name: it.name, color: it.color, sync0: sync0, tr: [], agl: [], d: [], px: [], py: [], gs: gs, vd: [], ref: it.ref };
      // Marco de carrera: con punto de referencia se usa el eje del carril (todos los carriles superpuestos);
      // sin él, el rumbo propio dentro de la ventana. El avance se mide desde la entrada a la ventana.
      var frame = null, a0 = it.ref ? W.pointAtTime(pts, j.tVal) : null;
      if (a0) {
        var prA = W.projector(a0.lat, a0.lon), rr = prA(it.ref.lat, it.ref.lon), ln = Math.sqrt(rr[0] * rr[0] + rr[1] * rr[1]);
        if (ln > 1) { var oe = prA(o.lat, o.lon); frame = { pr: prA, ux: rr[0] / ln, uy: rr[1] / ln, lane: true }; frame.f0 = oe[0] * frame.ux + oe[1] * frame.uy; }
      }
      if (!frame) frame = { pr: pr, ux: Math.sin(ang), uy: Math.cos(ang), f0: 0, lane: false };
      out.lane = frame.lane;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q = pr(p.lat, p.lon), dist = Math.sqrt(q[0] * q[0] + q[1] * q[1]);
        out.tr.push(p.t - sync0); out.agl.push(p.alt - R.cfg.elev); out.vd.push(p.vD);
        out.d.push(p.t < j.tTop ? -dist : dist);
        if (R.plan === 'real') { var g = commonPr(p.lat, p.lon); out.px.push(g[0]); out.py.push(g[1]); }
        else { var w = frame.pr(p.lat, p.lon); out.px.push(w[0] * frame.uy - w[1] * frame.ux); out.py.push(w[0] * frame.ux + w[1] * frame.uy - frame.f0); }
      }
      var lead = R.sync === 'exit' ? j.tExit - 2 : j.tTop - 8;
      out.s = Math.max(out.tr[0], lead - sync0);
      out.e = Math.min(out.tr[out.tr.length - 1], j.tBot + 4 - sync0);
      if (R.plan === 'real' && it.ref && commonPr) {
        var st = W.pointAtTime(pts, j.tVal);
        if (st) { out.laneA = commonPr(st.lat, st.lon); out.laneB = commonPr(it.ref.lat, it.ref.lon); }
      }
      return out;
    });
    R.tMin = Infinity; R.tMax = -Infinity;
    R.items.forEach(function (it) { if (it.s < R.tMin) R.tMin = it.s; if (it.e > R.tMax) R.tMax = it.e; });
    if (!R.items.length) { R.tMin = 0; R.tMax = 1; }
    R.hasLane = R.plan !== 'real' && R.items.some(function (it) { return it.lane; });
    R.t = R.tMin;
    // dominios
    var dom = { x0: Infinity, x1: -Infinity, y0: R.cfg.bottom - 140, y1: R.cfg.top + 200, bx0: Infinity, bx1: -Infinity, by0: Infinity, by1: -Infinity };
    R.items.forEach(function (it) {
      for (var i = 0; i < it.tr.length; i++) {
        if (it.tr[i] < it.s || it.tr[i] > it.e) continue;
        var x = R.task === 'time' ? it.tr[i] : it.d[i];
        if (x < dom.x0) dom.x0 = x; if (x > dom.x1) dom.x1 = x;
        if (it.agl[i] > dom.y1) dom.y1 = it.agl[i];
        if (it.agl[i] - 40 < dom.y0) dom.y0 = it.agl[i] - 40;
        if (it.px[i] < dom.bx0) dom.bx0 = it.px[i]; if (it.px[i] > dom.bx1) dom.bx1 = it.px[i];
        if (it.py[i] < dom.by0) dom.by0 = it.py[i]; if (it.py[i] > dom.by1) dom.by1 = it.py[i];
      }
      if (it.laneB) { dom.bx0 = Math.min(dom.bx0, it.laneB[0]); dom.bx1 = Math.max(dom.bx1, it.laneB[0]); dom.by0 = Math.min(dom.by0, it.laneB[1]); dom.by1 = Math.max(dom.by1, it.laneB[1]); }
    });
    dom.y1 = Math.min(dom.y1 + 60, R.cfg.top + 900);
    var pad = (dom.x1 - dom.x0) * 0.04; dom.x1 += pad;
    R.dom = dom;
  }

  function cssVars() {
    var cs = getComputedStyle(document.documentElement);
    ['--ink', '--ink-2', '--line', '--lane', '--surface', '--accent'].forEach(function (k) { R.css[k] = cs.getPropertyValue(k).trim(); });
    R.font = cs.getPropertyValue('--font-body').trim() || 'sans-serif';
  }
  function prep(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    return { c: c, w: w, h: h };
  }
  function niceStep(span, target) {
    var raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
  }

  function drawProfile() {
    var cv = document.getElementById('cvProfile'); if (!cv) return;
    var g = prep(cv), c = g.c, d = R.dom, L = 54, Rr = 14, T = 14, B = 36;
    var X = function (x) { return L + (x - d.x0) / (d.x1 - d.x0) * (g.w - L - Rr); };
    var Y = function (y) { return T + (d.y1 - y) / (d.y1 - d.y0) * (g.h - T - B); };
    c.font = '12px ' + R.font; c.lineWidth = 1;
    // ventana de competencia
    c.fillStyle = R.css['--lane']; c.globalAlpha = 0.09; c.fillRect(L, Y(R.cfg.top), g.w - L - Rr, Y(R.cfg.bottom) - Y(R.cfg.top)); c.globalAlpha = 1;
    // grilla
    c.strokeStyle = R.css['--line']; c.fillStyle = R.css['--ink-2']; c.textAlign = 'right'; c.textBaseline = 'middle';
    var k = R.altK, ys = niceStep((d.y1 - d.y0) * k, 6);
    for (var yd = Math.ceil(d.y0 * k / ys) * ys; yd <= d.y1 * k; yd += ys) { var y = yd / k; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(L, Y(y)); c.lineTo(g.w - Rr, Y(y)); c.stroke(); c.globalAlpha = 1; c.fillText(String(Math.round(yd)), L - 6, Y(y)); }
    c.textAlign = 'center'; c.textBaseline = 'top';
    var xs = niceStep(d.x1 - d.x0, 8);
    for (var x = Math.ceil(d.x0 / xs) * xs; x <= d.x1; x += xs) { c.globalAlpha = 0.5; c.beginPath(); c.moveTo(X(x), T); c.lineTo(X(x), g.h - B); c.stroke(); c.globalAlpha = 1; c.fillText(String(Math.round(x)), X(x), g.h - B + 5); }
    c.fillText(R.task === 'time' ? 'Tiempo (s)' : 'Distancia desde la entrada a la ventana (m)', L + (g.w - L - Rr) / 2, g.h - 16);
    c.save(); c.translate(12, T + (g.h - T - B) / 2); c.rotate(-Math.PI / 2); c.fillText('Altura sobre el suelo (' + R.altU + ')', 0, -6); c.restore();
    // límites de la ventana
    c.strokeStyle = R.css['--lane']; c.fillStyle = R.css['--lane']; c.setLineDash([6, 4]); c.lineWidth = 1.5; c.textAlign = 'right'; c.textBaseline = 'bottom';
    [R.cfg.top, R.cfg.bottom].forEach(function (a, i) { c.beginPath(); c.moveTo(L, Y(a)); c.lineTo(g.w - Rr, Y(a)); c.stroke(); c.fillText((i ? 'Fin de ventana ' : 'Inicio de ventana ') + Math.round(a * R.altK) + ' ' + R.altU, g.w - Rr - 4, Y(a) - 3); });
    c.setLineDash([]);
    c.save(); c.beginPath(); c.rect(L, T, g.w - L - Rr, g.h - T - B); c.clip();
    R.items.forEach(function (it) {
      var xv = R.task === 'time' ? it.tr : it.d, cur = sample(it, R.t), n = it.tr.length, i;
      c.strokeStyle = it.color; c.lineJoin = 'round';
      c.globalAlpha = 0.22; c.lineWidth = 1.5; c.beginPath();
      for (i = 0; i < n; i++) { if (it.tr[i] < it.s || it.tr[i] > it.e) continue; c.lineTo(X(xv[i]), Y(it.agl[i])); }
      c.stroke();
      c.globalAlpha = 1; c.lineWidth = 2.6; c.beginPath();
      for (i = 0; i < n && it.tr[i] <= R.t; i++) { if (it.tr[i] < it.s) continue; c.lineTo(X(xv[i]), Y(it.agl[i])); }
      var cx = X(R.task === 'time' ? Math.max(it.s, Math.min(R.t, it.e)) : cur.d), cy = Y(cur.agl);
      c.lineTo(cx, cy); c.stroke();
      it._pp = [cx, cy];
    });
    c.restore();
    R.items.forEach(function (it) {
      var p = it._pp; c.fillStyle = it.color; c.beginPath(); c.arc(p[0], p[1], 5.5, 0, 6.3); c.fill();
      c.strokeStyle = R.css['--surface']; c.lineWidth = 1.5; c.stroke();
      c.font = '600 12px ' + R.font; c.textBaseline = 'bottom';
      var right = p[0] > g.w - 110; c.textAlign = right ? 'right' : 'left';
      c.fillStyle = R.css['--ink']; c.fillText(it.name, p[0] + (right ? -9 : 9), p[1] - 5);
    });
  }

  function drawPlan() {
    var cv = document.getElementById('cvPlan'); if (!cv) return;
    var g = prep(cv), c = g.c, d = R.dom, pad = 26;
    var race = R.plan !== 'real';
    // en modo carrera el avance va hacia la derecha para aprovechar el ancho
    var ux0 = race ? d.by0 : d.bx0, ux1 = race ? d.by1 : d.bx1, uy0 = race ? d.bx0 : d.by0, uy1 = race ? d.bx1 : d.by1;
    if (race) { var m = Math.max(Math.abs(uy0), Math.abs(uy1), R.hasLane ? R.cfg.laneWidth / 2 + 60 : 200); uy0 = -m; uy1 = m; }
    var sc = Math.min((g.w - 2 * pad) / Math.max(1, ux1 - ux0), (g.h - 2 * pad) / Math.max(1, uy1 - uy0));
    var ox = pad + ((g.w - 2 * pad) - (ux1 - ux0) * sc) / 2, oy = pad + ((g.h - 2 * pad) - (uy1 - uy0) * sc) / 2;
    var P = function (px, py) { return race ? [ox + (py - ux0) * sc, oy + (uy1 - (-px)) * sc] : [ox + (px - ux0) * sc, oy + (uy1 - py) * sc]; };
    c.font = '12px ' + R.font; c.fillStyle = R.css['--ink-2']; c.strokeStyle = R.css['--line']; c.lineWidth = 1;
    if (race) {
      var st = niceStep(ux1 - ux0, 8); c.textAlign = 'center'; c.textBaseline = 'bottom';
      for (var x = Math.ceil(ux0 / st) * st; x <= ux1; x += st) { var a = P(0, x); c.globalAlpha = 0.5; c.beginPath(); c.moveTo(a[0], pad - 8); c.lineTo(a[0], g.h - pad + 8); c.stroke(); c.globalAlpha = 1; c.fillText(Math.round(x) + ' m', a[0], g.h - 4); }
      if (R.hasLane) { var l0 = P(-R.cfg.laneWidth / 2, ux0), l1 = P(R.cfg.laneWidth / 2, ux1); c.fillStyle = R.css['--lane']; c.globalAlpha = 0.1; c.fillRect(l0[0], Math.min(l0[1], l1[1]), l1[0] - l0[0], Math.abs(l1[1] - l0[1])); c.globalAlpha = 1; c.fillStyle = R.css['--ink-2']; }
      c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(R.hasLane ? 'Vista desde arriba · carriles superpuestos (franja: 600 m)' : 'Vista desde arriba · cada uno alineado con su propio rumbo', 8, 6);
    } else {
      c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('Vista desde arriba · norte arriba', 8, 6);
      var bar = niceStep((ux1 - ux0) * 0.25, 1); c.strokeStyle = R.css['--ink-2']; c.lineWidth = 2; c.beginPath(); c.moveTo(g.w - 16 - bar * sc, g.h - 14); c.lineTo(g.w - 16, g.h - 14); c.stroke();
      c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(Math.round(bar) + ' m', g.w - 16, g.h - 18);
      R.items.forEach(function (it) {
        if (!it.laneA) return;
        var ax = it.laneA[0], ay = it.laneA[1], bx = it.laneB[0], by = it.laneB[1], len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        var nx = -(by - ay) / len * R.cfg.laneWidth / 2, ny = (bx - ax) / len * R.cfg.laneWidth / 2;
        var q = [P(ax + nx, ay + ny), P(bx + nx, by + ny), P(bx - nx, by - ny), P(ax - nx, ay - ny)];
        c.fillStyle = R.css['--lane']; c.globalAlpha = 0.1; c.beginPath(); q.forEach(function (v) { c.lineTo(v[0], v[1]); }); c.closePath(); c.fill();
        c.globalAlpha = 0.6; c.strokeStyle = R.css['--lane']; c.lineWidth = 1; c.setLineDash([5, 4]); c.beginPath(); var s0 = P(ax, ay), s1 = P(bx, by); c.moveTo(s0[0], s0[1]); c.lineTo(s1[0], s1[1]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      });
    }
    R.items.forEach(function (it) {
      var n = it.tr.length, i, v, cur = sample(it, R.t);
      c.strokeStyle = it.color; c.lineJoin = 'round'; c.globalAlpha = 0.22; c.lineWidth = 1.5; c.beginPath();
      for (i = 0; i < n; i++) { if (it.tr[i] < it.s || it.tr[i] > it.e) continue; v = P(it.px[i], it.py[i]); c.lineTo(v[0], v[1]); }
      c.stroke(); c.globalAlpha = 1; c.lineWidth = 2.6; c.beginPath();
      for (i = 0; i < n && it.tr[i] <= R.t; i++) { if (it.tr[i] < it.s) continue; v = P(it.px[i], it.py[i]); c.lineTo(v[0], v[1]); }
      v = P(cur.px, cur.py); c.lineTo(v[0], v[1]); c.stroke();
      c.fillStyle = it.color; c.beginPath(); c.arc(v[0], v[1], 5.5, 0, 6.3); c.fill(); c.strokeStyle = R.css['--surface']; c.lineWidth = 1.5; c.stroke();
    });
  }

  function metrics(it) {
    var j = it.jump, abs = R.t + it.sync0, cur = sample(it, R.t);
    var state = abs < j.tTop ? 'pre' : abs >= j.tBot ? 'done' : 'in';
    var el = Math.max(0, Math.min(abs - j.tTop, j.time));
    var dist = state === 'done' ? j.distance : state === 'pre' ? 0 : Math.abs(cur.d);
    var avg = state === 'done' ? j.speed : el > 0.5 ? dist / el * 3.6 : 0;
    var main = R.task === 'time' ? el : R.task === 'distance' ? dist : avg, key;
    if (state === 'done') { main = j._result; key = R.task === 'time' ? j._result : j._result; }
    else key = R.task === 'time' ? 1e6 + cur.agl : main;
    return { state: state, main: main, key: key, cur: cur };
  }

  function drawBoard(force) {
    var el = document.getElementById('rp-board'); if (!el) return;
    var now = performance.now(); if (!force && now - R.lastBoard < 120) return; R.lastBoard = now;
    var rows = R.items.map(function (it) { return { it: it, m: metrics(it) }; });
    rows.sort(function (a, b) { return b.m.key - a.m.key; });
    var allDone = rows.length && rows.every(function (r) { return r.m.state === 'done'; });
    var dec = R.task === 'distance' ? 0 : 1, h = '';
    if (allDone) {
      rows.sort(function (a, b) { return b.it.jump._result - a.it.jump._result; });
      var w = rows[0];
      h += '<div class="winner">Gana ' + esc(w.it.name) + ' · ' + A.fmt(w.it.jump._result, dec) + ' ' + A.UNIT[R.task] + '</div>';
    }
    rows.forEach(function (r, i) {
      var c = r.m.cur, gr = c.vd > 1 ? c.gs / c.vd : 0, j = r.it.jump;
      var gap = '';
      if (i > 0) {
        var ld = rows[0];
        if (r.m.state === 'done' && ld.m.state === 'done') gap = ' · a ' + A.fmt(ld.it.jump._result - j._result, dec) + ' ' + A.UNIT[R.task] + ' del primero';
        else if (r.m.state === 'in' && ld.m.state === 'in') gap = R.task === 'time' ? ' · ' + Math.round((ld.m.cur.agl - c.agl) * R.altK) + ' ' + R.altU + ' más abajo que el primero' : ' · a ' + A.fmt(ld.m.main - r.m.main, dec) + ' ' + A.UNIT[R.task] + ' del primero';
      }
      h += '<div class="lb' + (r.m.state === 'done' ? ' done' : '') + '" style="--c:' + r.it.color + '"><span class="pos">' + (i + 1) + '</span><span class="nm">' + esc(r.it.name) + '</span><span class="mv">' + A.fmt(r.m.main, dec) + ' <small>' + A.UNIT[R.task] + '</small></span>' +
        '<span class="sub">' + (r.m.state === 'done' ? 'Resultado oficial' + (j._pen ? ' · penalidad −' + j._pen + '%' : '') + ' · ' + A.fmt(j._points, 1) + '%' :
          (r.m.state === 'pre' ? 'Antes de la ventana · ' : '') + Math.round(c.agl * R.altK) + ' ' + R.altU + ' · horizontal ' + Math.round(c.gs * 3.6) + ' km/h · vertical ' + Math.round(c.vd * 3.6) + ' km/h · planeo ' + A.fmt(gr, 1)) + gap + '</span></div>';
    });
    if (!rows.length) h = '<p class="muted">Elegí al menos un piloto.</p>';
    el.innerHTML = h;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function drawAll(force) {
    if (!document.getElementById('cvProfile')) { stop(); return; }
    if (window.Replay3D) window.Replay3D.draw(R, sample); drawProfile(); drawPlan(); drawBoard(force);
    var ck = document.getElementById('rp-clock'), sk = document.getElementById('rp-seek');
    if (ck) ck.textContent = A.fmt(R.t, 1) + ' s';
    if (sk && document.activeElement !== sk) sk.value = String(Math.round((R.t - R.tMin) / (R.tMax - R.tMin) * 1000));
    var pb = document.getElementById('rp-play'); if (pb) pb.textContent = R.playing ? 'Pausa' : 'Reproducir';
  }
  function tick(now) {
    if (!R.playing) return;
    var dt = Math.min(0.1, (now - R.last) / 1000); R.last = now;
    R.t += dt * R.speed;
    if (R.t >= R.tMax) { R.t = R.tMax; R.playing = false; drawAll(true); return; }
    drawAll(false);
    R.raf = requestAnimationFrame(tick);
  }
  function stop() { R.playing = false; cancelAnimationFrame(R.raf); R.token++; }

  window.Replay = {
    mount: async function () {
      A = window.WSApp; var token = ++R.token; R.playing = false; cancelAnimationFrame(R.raf);
      var data = await A.S.replayItems();
      if (token !== R.token || !data) return;
      cssVars(); build(data); if (window.Replay3D) { window.Replay3D.setMode(data.cam, true); window.Replay3D.build(R, sample); } drawAll(true);
      var sk = document.getElementById('rp-seek');
      if (sk) sk.oninput = function () { R.t = R.tMin + (+sk.value / 1000) * (R.tMax - R.tMin); drawAll(true); };
      if (!R.ro && window.ResizeObserver) { R.ro = new ResizeObserver(function () { if (document.getElementById('cvProfile') && !R.playing) { if (window.Replay3D) window.Replay3D.draw(R, sample); drawProfile(); drawPlan(); } }); }
      if (R.ro) { R.ro.disconnect(); R.ro.observe(document.getElementById('cvProfile')); var c3 = document.getElementById('cv3d'); if (c3) R.ro.observe(c3); }
    },
    toggle: function () {
      if (R.playing) { R.playing = false; cancelAnimationFrame(R.raf); drawAll(true); return; }
      if (R.t >= R.tMax - 0.01) R.t = R.tMin;
      R.playing = true; R.last = performance.now(); R.raf = requestAnimationFrame(tick); drawAll(true);
    },
    restart: function () { R.t = R.tMin; if (!R.playing) drawAll(true); },
    setSpeed: function (s) { R.speed = s; },
    stop: stop, _R: R
  };
})();
