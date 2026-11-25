/* Vista 3D del replay (three.js). Si no hay WebGL, la página sigue con las vistas 2D. */
(function () {
  'use strict';
  var V = { ok: false, cam: { az: 0, el: 0, zoom: 1, mode: 'auto' }, tgt: null, objs: [] };

  function init(cv) {
    if (!window.THREE) return false;
    if (V.cv === cv && V.renderer) return true;
    if (V.renderer) { try { clearRoot(); V.renderer.dispose(); V.renderer.forceContextLoss(); } catch (e0) {} V.renderer = null; }
    try {
      V.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    } catch (e) { return false; }
    V.cv = cv;
    V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    V.scene = new THREE.Scene();
    V.scene.background = new THREE.Color(0x0a121c);
    V.scene.fog = new THREE.Fog(0x0a121c, 3000, 14000);
    V.camera = new THREE.PerspectiveCamera(42, 1, 5, 40000);
    V.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(0.4, 1, 0.3); V.scene.add(sun);
    V.root = new THREE.Group(); V.scene.add(V.root);
    // arrastrar para girar, rueda para acercar
    var drag = null;
    cv.addEventListener('pointerdown', function (e) { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      V.cam.az += (e.clientX - drag[0]) * 0.008; V.cam.el = Math.max(-0.5, Math.min(1.1, V.cam.el + (e.clientY - drag[1]) * 0.005));
      drag = [e.clientX, e.clientY]; if (V.last) draw(V.last[0], V.last[1]);
    });
    cv.addEventListener('pointerup', function () { drag = null; });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); V.cam.zoom = Math.max(0.35, Math.min(3, V.cam.zoom * (e.deltaY > 0 ? 1.1 : 0.9))); if (V.last) draw(V.last[0], V.last[1]); }, { passive: false });
    return true;
  }

  function suitGeometry() {
    var s = new THREE.Shape(), p = [[0, 0.5], [0.1, 0.4], [0.5, 0.12], [0.36, -0.12], [0.17, -0.18], [0.24, -0.5], [0, -0.4]];
    s.moveTo(p[0][0], p[0][1]);
    for (var i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]);
    for (var k = p.length - 2; k >= 1; k--) s.lineTo(-p[k][0], p[k][1]);
    s.closePath();
    var g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false });
    g.translate(0, 0, -0.035); g.rotateX(Math.PI / 2); g.scale(75, 75, 75);
    return g;
  }
  // Ground strip along a→b (plan metres: x east, y north) between lateral offsets o0 and o1 (m).
  function strip(a, b, o0, o1, color, op) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
    var P = function (p, o) { return [p[0] + nx * o, 1, -(p[1] + ny * o)]; };
    var q0 = P(a, o0), q1 = P(b, o0), q2 = P(b, o1), q3 = P(a, o1);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(q0, q1, q2, q0, q2, q3), 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
  }
  function band(x0, x1, z0, z1, y, color, op) {
    var g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0));
    var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    return m;
  }
  function clearRoot() {
    while (V.root.children.length) {
      var o = V.root.children.pop();
      o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
    }
    V.objs = [];
  }

  function build(R, sample) {
    var cv = document.getElementById('cv3d'), box = document.getElementById('rp-3d');
    V.ok = !!cv && init(cv);
    if (box) box.classList.toggle('no3d', !V.ok);
    if (!V.ok) return;
    clearRoot();
    var d = R.dom, real = R.plan === 'real';
    // extensión del terreno en coordenadas de escena: x = lateral/este, z = -avance/-norte
    var x0 = d.bx0, x1 = d.bx1, f0 = d.by0, f1 = d.by1;
    if (!isFinite(x0)) { x0 = -500; x1 = 500; f0 = 0; f1 = 3000; }
    var half = R.cfg.laneWidth / 2, wide = Math.max(Math.abs(x0), Math.abs(x1), half + 320) + 200;
    var gx0 = real ? x0 - 400 : -wide, gx1 = real ? x1 + 400 : wide, gf0 = f0 - 500, gf1 = f1 + 500;
    var size = Math.max(gx1 - gx0, gf1 - gf0) * 2.2, cells = Math.max(4, Math.round(size / 500));
    var grid = new THREE.GridHelper(cells * 500, cells, 0x2c4a60, 0x18293a);
    grid.position.set((gx0 + gx1) / 2, 0, -(gf0 + gf1) / 2); V.root.add(grid);
    V.root.add(band(gx0 - size, gx1 + size, -(gf0 - size), -(gf1 + size), -2, 0x0d1924, 1));
    if (real) R.items.forEach(function (it) { // real view: each flyer's lane on the ground, from validation start to the point
      if (!it.laneA) return;
      V.root.add(strip(it.laneA, it.laneB, -half, half, 0x3fc1c9, 0.22));
      [[half, half + 150, 0xf0b354], [half + 150, half + 300, 0xff7a3d]].forEach(function (z) {
        V.root.add(strip(it.laneA, it.laneB, z[0], z[1], z[2], 0.16)); V.root.add(strip(it.laneA, it.laneB, -z[1], -z[0], z[2], 0.16));
      });
    });
    if (R.hasLane) { // carril en el suelo: centro válido y franjas de penalidad
      V.root.add(band(-half, half, -gf0, -gf1, 1, 0x3fc1c9, 0.22));
      [[half, half + 150, 0xf0b354], [half + 150, half + 300, 0xff7a3d]].forEach(function (z) {
        V.root.add(band(z[0], z[1], -gf0, -gf1, 1, z[2], 0.16)); V.root.add(band(-z[1], -z[0], -gf0, -gf1, 1, z[2], 0.16));
      });
    }
    // planos de la ventana de competencia
    [R.cfg.top, R.cfg.bottom].forEach(function (alt) {
      // Copy of legacy/src/replay3d.js: the planes span every flyer, not only the lane (someone off the lane was outside them).
      var pl = band(gx0, gx1, -gf0, -gf1, alt, 0x7fd8de, 0.11); V.root.add(pl);
      var eg = new THREE.LineSegments(new THREE.EdgesGeometry(pl.geometry), new THREE.LineBasicMaterial({ color: 0x7fd8de, transparent: true, opacity: 0.55 }));
      eg.rotation.copy(pl.rotation); eg.position.copy(pl.position); V.root.add(eg);
    });
    var suit = suitGeometry(), labels = document.getElementById('rp-labels');
    if (labels) labels.innerHTML = '';
    R.items.forEach(function (it) {
      var col = new THREE.Color(it.color), pts = [], lens = [0], times = [], t, s, prev = null, total = 0;
      for (t = it.s; t <= it.e + 1e-6; t += 0.25) {
        s = sample(it, t); var v = new THREE.Vector3(s.px, s.agl, -s.py);
        if (prev) { total += v.distanceTo(prev); lens.push(total); }
        pts.push(v); times.push(t); prev = v;
      }
      if (pts.length < 2) return;
      var curve = new THREE.CatmullRomCurve3(pts), segs = Math.min(1200, pts.length * 2);
      var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 5, 6, false), new THREE.MeshBasicMaterial({ color: col }));
      var ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.28 }));
      var body = new THREE.Mesh(suit, new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 }));
      var drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.45 }));
      V.root.add(ghost); V.root.add(tube); V.root.add(body); V.root.add(drop);
      var lab = null;
      if (labels) { lab = document.createElement('div'); lab.className = 'lab3d'; lab.style.setProperty('--c', it.color); lab.textContent = it.name; labels.appendChild(lab); }
      V.objs.push({ it: it, tube: tube, body: body, drop: drop, lab: lab, lens: lens, times: times, total: total, segs: segs });
    });
    V.tgt = null; V.w = 0;
  }

  function draw(R, sample) {
    if (!V.ok || !document.getElementById('cv3d')) return;
    V.last = [R, sample];
    var cv = V.cv, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (V.w !== w || V.h !== h) { V.renderer.setSize(w, h, false); V.camera.aspect = w / h; V.camera.updateProjectionMatrix(); V.w = w; V.h = h; }
    var cen = new THREE.Vector3(), n = 0, spread = 0, pos = [];
    V.objs.forEach(function (o) {
      var it = o.it, t = Math.max(it.s, Math.min(R.t, it.e));
      var s = sample(it, t), s2 = sample(it, Math.min(it.e, t + 0.4)), s1 = sample(it, Math.max(it.s, t - 0.4));
      var p = new THREE.Vector3(s.px, s.agl, -s.py);
      o.body.position.copy(p);
      var dir = new THREE.Vector3(s2.px - s1.px, s2.agl - s1.agl, -(s2.py - s1.py));
      if (dir.lengthSq() > 0.01) o.body.lookAt(p.clone().add(dir));
      // estela: se descubre hasta la posición actual
      var k = Math.max(0, Math.min(o.times.length - 1, (t - it.s) / 0.25)), i0 = Math.floor(k), i1 = Math.min(o.times.length - 1, i0 + 1);
      var len = o.lens[i0] + (o.lens[i1] - o.lens[i0]) * (k - i0);
      o.tube.geometry.setDrawRange(0, Math.floor(len / (o.total || 1) * o.segs) * 6 * 6);
      var arr = o.drop.geometry.attributes.position; arr.setXYZ(0, p.x, p.y, p.z); arr.setXYZ(1, p.x, 0, p.z); arr.needsUpdate = true;
      o.p = p; pos.push(p);
      var abs = R.t + it.sync0; if (abs < it.jump.tBot + 1 || true) { cen.add(p); n++; }
    });
    if (!n) { V.renderer.render(V.scene, V.camera); return; }
    cen.multiplyScalar(1 / n);
    pos.forEach(function (p) { spread = Math.max(spread, p.distanceTo(cen)); });
    if (!V.tgt) V.tgt = cen.clone(); else V.tgt.lerp(cen, 0.2);
    var prog = (R.t - R.tMin) / Math.max(1e-6, R.tMax - R.tMin), mode = V.cam.mode;
    var az = mode === 'side' ? Math.PI / 2 : mode === 'behind' ? 0.18 : mode === 'top' ? 0.01 : 0.55 + prog * 1.9 + 0.25 * Math.sin(prog * 9);
    var el = mode === 'top' ? 1.35 : mode === 'behind' ? 0.3 : mode === 'side' ? 0.12 : 0.22 + 0.16 * Math.sin(prog * 5);
    az += V.cam.az; el = Math.max(-0.2, Math.min(1.5, el + V.cam.el));
    var dist = Math.max(650, spread * 2.6 + 420) * V.cam.zoom * (mode === 'top' ? 1.6 : 1);
    // az = 0: desde atrás (el avance es -z)
    V.camera.position.set(V.tgt.x + Math.sin(az) * Math.cos(el) * dist, Math.max(40, V.tgt.y + Math.sin(el) * dist), V.tgt.z + Math.cos(az) * Math.cos(el) * dist);
    V.camera.lookAt(V.tgt);
    V.renderer.render(V.scene, V.camera);
    V.objs.forEach(function (o) {
      if (!o.lab) return;
      var q = o.p.clone().project(V.camera), vis = q.z < 1 && q.x > -1.05 && q.x < 1.05 && q.y > -1.05 && q.y < 1.05;
      o.lab.style.display = vis ? '' : 'none';
      if (vis) o.lab.style.transform = 'translate(' + Math.round((q.x + 1) / 2 * w + 12) + 'px,' + Math.round((1 - q.y) / 2 * h - 22) + 'px)';
    });
  }

  window.Replay3D = { build: build, draw: draw, setMode: function (m, quiet) { V.cam.mode = m; V.cam.az = 0; V.cam.el = 0; if (!quiet && V.last) draw(V.last[0], V.last[1]); }, _V: V };
})();
