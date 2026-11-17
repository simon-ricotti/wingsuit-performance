/* Interfaz: jornadas, carga de saltos, clasificación, histórico. */
(function () {
  'use strict';
  var W = window.WSP;
  var TASK = { time: 'Tiempo', distance: 'Distancia', speed: 'Velocidad' };
  var UNIT = { time: 's', distance: 'm', speed: 'km/h' };
  var COLORS = ['#d9480f', '#0b7f86', '#6f42c1', '#2f6fde', '#c2255c', '#5c7c00', '#a15c00', '#0f7a52', '#7a4b2a', '#495867'];

  var S = {
    mode: 'loading', canWrite: true, slow: false,
    events: [], pilots: [], jumps: {}, tracks: {}, allLoaded: false,
    route: { view: 'jornadas', eventId: null }, tab: 'tabla', ui: {}
  };
  window.__S = S;

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(s, def) { var n = parseFloat(String(s == null ? '' : s).replace(',', '.')); return isFinite(n) ? n : def; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '–'; return W.roundHalfUp(n, d || 0).toFixed(d || 0).replace('.', ','); }
  function fmtTask(task, v) { return fmt(v, task === 'distance' ? 0 : 1); }
  function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function $(sel) { return document.querySelector(sel); }
  function pilotName(id) { var p = allPilots().filter(function (x) { return x.id === id; })[0]; return p ? p.name : 'Piloto borrado'; }
  function allPilots() { return S.pilots.concat(DEMO.pilots); }
  function allEvents() { return S.events.concat([DEMO.event]); }
  function getEvent(id) { return allEvents().filter(function (e) { return e.id === id; })[0]; }
  function evCfg(ev) { var c = {}; for (var k in W.DEFAULT_CFG) c[k] = W.DEFAULT_CFG[k]; for (var j in (ev.cfg || {})) c[j] = ev.cfg[j]; return c; }
  var FT = 0.3048;
  function isFt(ev) { return !!ev && ev.units === 'ft'; }
  function altU(ev) { return isFt(ev) ? 'ft' : 'm'; }
  // Equivalencias que da el reglamento FAI (5.4.5 a 5.4.7): 3200 m = 10 500 ft, 3353 m = 11 000 ft, 3048 m = 10 000 ft
  var FAI_FT = { 3200: 10500, 3353: 11000, 3048: 10000 }, FAI_M = { 10500: 3200, 11000: 3353, 10000: 3048 };
  function m2ft(m) { return FAI_FT[m] || Math.round(m / FT); }
  function altV(ev, m) { return m == null || !isFinite(m) ? '–' : String(isFt(ev) ? m2ft(m) : Math.round(m)); }
  function toM(v, ft) {
    if (ft && FAI_M[v]) return FAI_M[v]; // pies -> metros; si coincide con un metro entero (8202 ft = 2500 m) se guarda el entero
    if (!ft) return v;
    var m = v * FT, r = Math.round(m);
    return Math.round(r / FT) === Math.round(v) ? r : +m.toFixed(2);
  }
  var PROFILES = {
    arg: { label: 'Argentina (club y entrenamiento)', reviews: 1, door: 'device', gpsRule: 'warn', exitRule: 'warn' },
    fai: { label: 'FAI estricto', reviews: 2, door: 'fd', gpsRule: 'rejump', exitRule: 'rejump' }
  };
  var DOOR = { fd: 'Flight Director a bordo', device: 'Dispositivo: cronómetro y cámara', none: 'Sin control de salidas' };
  function judging(ev) {
    var jd = (ev && ev.judging) || { profile: 'arg' };
    var base = PROFILES[jd.profile] || PROFILES.arg;
    return Object.assign({ profile: 'arg' }, base, jd, { label: jd.profile === 'custom' ? 'Personalizado' : base.label });
  }
  function profileDiffs(ev) {
    var J = judging(ev), F = PROFILES.fai, c = evCfg(ev), out = [];
    if (J.reviews !== F.reviews) out.push(J.reviews + ' revisión por salto (FAI: 2 jueces)');
    if (J.door !== F.door) out.push('salidas: ' + DOOR[J.door].toLowerCase());
    if (J.gpsRule !== F.gpsRule) out.push('GPS de menos de 5 Hz o SEP alto: aviso, no re-salto');
    if (J.exitRule !== F.exitRule) out.push('salida fuera de 3200–3353 m: aviso, no re-salto');
    if (Math.abs(c.top - 2500) > 1 || Math.abs(c.bottom - 1500) > 1) out.push('ventana ' + Math.round(c.top) + '–' + Math.round(c.bottom) + ' m');
    if (Math.abs(c.exitMin - 3200) > 1 || Math.abs(c.exitMax - 3353) > 1) out.push('salida ' + Math.round(c.exitMin) + '–' + Math.round(c.exitMax) + ' m');
    if (!ev.lane) out.push('sin carril');
    if (!ev.sepCheck) out.push('sin control de separación');
    if (ev.mode === 'comp' && (ev.rounds || 3) !== 3) out.push((ev.rounds || 3) + ' ronda' + ((ev.rounds || 3) === 1 ? '' : 's') + ' (FAI: 3)');
    return out;
  }
  function laneEdge(j) { return j.laneDev != null && [300, 450, 600].some(function (th) { return Math.abs(j.laneDev - th) < 15; }); }
  function pendingDecisions(ev, j) {
    var J = judging(ev), out = [];
    var gps = (j.flags || []).filter(function (f) { return f.code === 'sep' || f.code === 'hz' || f.code === 'gap'; });
    var ex = (j.flags || []).filter(function (f) { return f.code === 'exit_low' || f.code === 'exit_high'; });
    if ((J.gpsRule === 'rejump' && gps.length) || (J.exitRule === 'rejump' && ex.length)) { if (!j.flagDecision) out.push('validar el salto o conceder re-salto'); }
    if (ev.lane && laneEdge(j) && (j.laneDecision == null || j.laneDecision === '')) out.push('confirmar la penalidad de carril, que está al límite');
    if (j.sepViolation && j.sepApply == null) out.push('decidir si se aplica el cero por separación');
    return out;
  }
  function jumpStatus(ev, j) {
    if (j.void) return { code: 'void', label: 'Anulado por re-salto', cls: 'bad' };
    if (pendingDecisions(ev, j).length) return { code: 'decide', label: 'Falta una decisión del juez', cls: 'warn' };
    var n = (j.reviews || []).length, need = judging(ev).reviews;
    if (n >= need) return { code: 'ok', label: 'Revisado', cls: 'good' };
    return { code: 'pending', label: n ? 'Revisado por ' + n + ' de ' + need : 'Sin revisar', cls: '' };
  }
  function judgeName() { try { return localStorage.getItem('wsp-judge') || ''; } catch (e) { return ''; } }
  function setJudgeName(n) { try { localStorage.setItem('wsp-judge', n); } catch (e) {} }
  var KEEP = ['fileHash', 'fileSize', 'uploadedBy', 'originalSaved', 'laneDecision', 'laneShift', 'sepApply', 'exitPen', 'flagDecision', 'void', 'reviews', 'notes', 'penManual'];
  function slotKey(j) { return j.task + '|' + j.round; }
  async function logAction(ev, text, jid) {
    if (ev.demo) return;
    try { await Store.set('events/' + ev.id + '/log/' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), { at: Date.now(), who: judgeName() || 'Sin nombre', uid: S.uid || null, text: text, jid: jid || null }); } catch (e) { console.warn(e); }
  }
  async function saveEventPatch(ev, patch) {
    if (ev.demo) { Object.assign(DEMO.event, patch); return; }
    var doc = Object.assign({}, ev, patch); delete doc.id;
    await Store.set('events/' + ev.id, doc);
  }
  async function saveJump(ev, j, logText) {
    var jid = jumpId(j), doc = Object.assign({}, j);
    Object.keys(doc).forEach(function (k) { if (k.charAt(0) === '_') delete doc[k]; });
    delete doc.id;
    await Store.set('events/' + ev.id + '/jumps/' + jid, doc);
    var v = ev.validated || {};
    if (v[slotKey(j)]) { var nv = Object.assign({}, v); delete nv[slotKey(j)]; await saveEventPatch(ev, { validated: nv }); await logAction(ev, 'Se reabrió la tarea ' + TASK[j.task] + ' ' + rl(j.round) + ' porque cambió un salto', jid); }
    if (logText) await logAction(ev, logText, jid);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------- almacenamiento ----------
  var Store = {
    db: null, mem: {}, watchers: [],
    isMem: function (path) { return !this.db || path.indexOf('events/demo/') === 0; },
    init: async function () {
      var db = null, user = null;
      try {
        if (window.claude && window.claude.use) { db = await window.claude.use('db'); user = await window.claude.use('user'); }
      } catch (e) { db = null; }
      if (db) {
        this.db = db; S.mode = 'db';
        try { var c = user ? await user.can('data.write') : null; S.canWrite = c !== false; } catch (e2) { S.canWrite = true; }
        try { S.uid = user ? await user.id() : null; } catch (e3) { S.uid = null; }
      } else { S.mode = 'local'; S.canWrite = true; }
    },
    memList: function (coll) {
      var out = [], pre = coll + '/';
      for (var k in this.mem) if (k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') < 0) out.push(Object.assign({ id: k.slice(pre.length) }, this.mem[k]));
      return out;
    },
    notify: function (path) {
      var coll = path.slice(0, path.lastIndexOf('/')), self = this;
      this.watchers.forEach(function (w) { if (w.coll === coll) w.cb(self.memList(coll)); });
    },
    watch: function (coll, cb) {
      if (this.isMem(coll + '/x')) {
        var w = { coll: coll, cb: cb }, self = this; this.watchers.push(w); cb(this.memList(coll));
        return function () { self.watchers = self.watchers.filter(function (x) { return x !== w; }); };
      }
      return this.db.collection(coll).onSnapshot(function (snap) {
        cb(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
      }, function (err) { console.warn('db', coll, err && err.code); });
    },
    list: async function (coll) {
      if (this.isMem(coll + '/x')) return this.memList(coll);
      var snap = await this.db.collection(coll).get();
      return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    },
    get: async function (path) {
      if (this.isMem(path)) return this.mem[path] ? Object.assign({}, this.mem[path]) : null;
      var s = await this.db.doc(path).get(); return s.exists ? Object.assign({}, s.data()) : null;
    },
    set: async function (path, data) {
      var clean = JSON.parse(JSON.stringify(data)); delete clean.id;
      if (this.isMem(path)) { this.mem[path] = clean; this.notify(path); return; }
      try { await this.db.doc(path).set(clean); }
      catch (e) {
        if (e && e.code === 'unavailable') { await sleep(600 + Math.random() * 600); await this.db.doc(path).set(clean); return; }
        if (e && e.code === 'invalid_argument') S.canWrite = false;
        throw e;
      }
    },
    del: async function (path) {
      if (this.isMem(path)) { delete this.mem[path]; this.notify(path); return; }
      await this.db.doc(path).delete();
    }
  };

  // ---------- datos de ejemplo (en memoria, no se guardan) ----------
  var DEMO = { event: null, pilots: [] };
  function loadDemo() {
    var raw = JSON.parse(document.getElementById('demo-data').textContent);
    DEMO.event = {
      id: 'demo', name: 'Ejemplo: tanda de distancia', date: '', mode: 'libre', dz: 'Tracks de prueba de Skyderby', demo: true,
      rounds: 1, lane: false, sepCheck: false, refs: [], cfg: { elev: 0 }
    };
    var cfg = evCfg(DEMO.event);
    raw.forEach(function (d, i) {
      var pid = 'demo' + i;
      DEMO.pilots.push({ id: pid, name: d.name, suit: '', demo: true });
      var pts = W.unpackTrack(d.track), sc = W.scoreJump(pts, cfg, null);
      var j = jumpDoc(sc, { pilotId: pid, task: 'distance', round: 1, device: d.device, fileName: d.file });
      var jid = jumpId(j);
      Store.mem['events/demo/jumps/' + jid] = j;
      Store.mem['events/demo/tracks/' + jid] = d.track;
    });
  }

  function jumpId(j) { return j.pilotId + '-' + j.task + '-' + j.round; }
  function jumpDoc(sc, meta) {
    var j = {
      pilotId: meta.pilotId, task: meta.task, round: +meta.round, ok: !!sc.ok,
      time: sc.ok ? +sc.time.toFixed(4) : 0, distance: sc.ok ? +sc.distance.toFixed(3) : 0, speed: sc.ok ? +sc.speed.toFixed(4) : 0,
      exitAgl: Math.round(sc.exitAgl), tExit: sc.tExit, tVal: sc.tVal, tTop: sc.tTop, tBot: sc.tBot, tDeploy: sc.tDeploy,
      hz: sc.hz, sepMax: sc.sepMax, flags: sc.flags || [],
      refIdx: meta.refIdx == null ? null : meta.refIdx,
      laneDev: sc.lane ? sc.lane.dev : null, laneOutside: sc.lane ? sc.lane.outside : null, lanePen: sc.lane ? sc.lane.penalty : 0,
      sepMin: null, sepWith: null, sepViolation: false,
      penManual: meta.penManual == null ? null : meta.penManual,
      device: meta.device || '', fileName: meta.fileName || '', uploadedAt: meta.uploadedAt || Date.now(),
      fileHash: meta.fileHash || null, fileSize: meta.fileSize || null, uploadedBy: meta.uploadedBy || null
    };
    return j;
  }

  // ---------- arranque y suscripciones ----------
  var unsubJumps = null;
  async function boot() {
    loadDemo();
    readHash();
    render();
    var timer = setTimeout(function () { if (S.mode === 'loading') { S.slow = true; render(); } }, 10000);
    await Store.init();
    clearTimeout(timer); S.slow = false;
    Store.watch('events', function (docs) { S.events = docs.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0); }); dataChanged(); });
    Store.watch('pilots', function (docs) { S.pilots = docs.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); dataChanged(); });
    watchEventJumps();
    render();
  }
  function watchEventJumps() {
    if (unsubJumps) { unsubJumps(); unsubJumps = null; }
    var id = S.route.eventId; if (!id) return;
    unsubJumps = Store.watch('events/' + id + '/jumps', function (docs) { S.jumps[id] = docs; dataChanged(); });
  }
  function dataChanged() {
    if (S.route.view === 'evento' && (S.tab === 'cargar' || S.tab === 'replay' || S.tab === 'ajustes' || S.tab === 'acta')) return;
    if (S.ui.editing) return;
    render();
  }
  function readHash() {
    var h = (location.hash || '').replace('#', '');
    var prevEvent = S.route.eventId;
    if (h.indexOf('jornada-') === 0) S.route = { view: 'evento', eventId: h.slice(8) };
    else if (h === 'ranking' || h === 'pilotos' || h === 'reglas') S.route = { view: h, eventId: null };
    else S.route = { view: 'jornadas', eventId: null };
    if (S.route.eventId !== prevEvent) { S.tab = 'tabla'; S.ui = {}; if (window.Replay) window.Replay.stop(); if (S.mode !== 'loading') watchEventJumps(); }
  }
  window.addEventListener('hashchange', function () { S.ui = {}; if (window.Replay) window.Replay.stop(); readHash(); render(); });

  // ---------- render ----------
  function render() {
    var v = S.route.view;
    document.querySelectorAll('.nav a').forEach(function (a) {
      var on = a.getAttribute('data-view') === (v === 'evento' ? 'jornadas' : v);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('#conn').textContent = S.mode === 'loading' ? (S.slow ? 'No llego a la base de datos todavía…' : 'Conectando…')
      : S.mode === 'local' ? 'Sin base compartida: no se guarda'
        : S.canWrite ? 'Base compartida · podés cargar' : 'Base compartida · solo lectura';
    var html = v === 'evento' ? viewEvent() : v === 'ranking' ? viewRanking() : v === 'pilotos' ? viewPilots() : v === 'reglas' ? viewRules() : viewEvents();
    $('#app').innerHTML = html;
    if (v === 'evento' && S.tab === 'replay' && window.Replay) window.Replay.mount();
    if (v === 'evento' && S.tab === 'tabla' && S.ui.jumpId && window.Review) {
      var ev0 = getEvent(S.route.eventId), j0 = ev0 && (S.jumps[ev0.id] || []).filter(function (x) { return jumpId(x) === S.ui.jumpId; })[0];
      if (ev0 && j0) {
        var c0 = Object.assign({}, evCfg(ev0), { valDelay: 9 + (+j0.laneShift || 0) });
        window.Review.mount(ev0, j0, c0, ev0.lane && ev0.refs && j0.refIdx != null ? ev0.refs[j0.refIdx] : null, c0.laneWidth, getTrack, S.ui.jumpId);
      }
    }
    if (v === 'ranking' || v === 'pilotos') ensureAllJumps();
  }

  function modePill(ev) { return ev.demo ? '<span class="pill">Ejemplo</span>' : ev.mode === 'comp' ? '<span class="pill comp">Competencia</span>' : '<span class="pill libre">Libre</span>'; }
  function cfgLine(ev) {
    var c = evCfg(ev);
    var u = altU(ev);
    return 'Ventana ' + altV(ev, c.top) + '–' + altV(ev, c.bottom) + ' ' + u + ' AGL · DZ a ' + altV(ev, c.elev) + ' ' + u + (ev.lane ? ' · carril ' + c.laneWidth + ' m' : '');
  }

  function viewEvents() {
    var h = '<div class="row spread"><div><h1>Jornadas</h1><p class="muted">Entrenamientos y competencias de performance, puntuados con el reglamento FAI 2026.</p></div>' +
      (S.canWrite ? '<button class="btn primary" data-act="new-event">Nueva jornada</button>' : '') + '</div>';
    if (S.mode === 'local') h += '<p class="note warn">Esta vista no está conectada a la base compartida. Podés probar todo, pero lo que cargues se pierde al cerrar.</p>';
    if (S.mode === 'db' && !S.canWrite) h += '<p class="note">Tenés acceso de lectura. Podés puntuar un archivo propio dentro de cualquier jornada para ver tu resultado, pero solo quien administra la página lo puede guardar.</p>';
    if (S.ui.eventForm) h += eventForm(S.ui.eventForm);
    h += '<div class="list">';
    allEvents().forEach(function (ev) {
      h += '<a class="card ev" href="#jornada-' + esc(ev.id) + '"><div><h3>' + esc(ev.name) + '</h3><p class="muted small">' +
        esc([ev.date, ev.dz].filter(Boolean).join(' · ')) + (ev.date || ev.dz ? ' · ' : '') + esc(cfgLine(ev)) + '</p></div><div>' + modePill(ev) + '</div></a>';
    });
    h += '</div>';
    if (!S.events.length && S.mode !== 'loading') h += '<p class="muted small">Todavía no hay jornadas guardadas. La de ejemplo usa tracks reales de prueba para que veas la clasificación y el replay.</p>';
    return h;
  }

  function eventForm(ev) {
    var c = evCfg(ev), refs = (ev.refs || []).map(function (r) { return r.name + ', ' + r.lat + ', ' + r.lon; }).join('\n');
    var ft = isFt(ev), u = ft ? 'ft' : 'm';
    function av(m) { return m == null || m === '' ? '' : (ft ? m2ft(m) : m); }
    function f(id, label, val, extra) { return '<label class="f">' + label + '<input id="' + id + '" value="' + esc(val) + '" ' + (extra || '') + '></label>'; }
    return '<form class="card stack" data-form="event"><h2>' + (ev.id ? 'Ajustes de la jornada' : 'Nueva jornada') + '</h2><div class="form">' +
      f('ef-name', 'Nombre', ev.name || '', 'required') +
      f('ef-date', 'Fecha', ev.date || new Date().toISOString().slice(0, 10), 'type="date"') +
      '<label class="f">Modo<select id="ef-mode"><option value="libre"' + (ev.mode !== 'comp' ? ' selected' : '') + '>Libre: se carga cualquier salto</option><option value="comp"' + (ev.mode === 'comp' ? ' selected' : '') + '>Competencia: rondas fijas de 3 tareas</option></select></label>' +
      f('ef-rounds', 'Rondas (modo competencia)', ev.rounds || 3, 'inputmode="numeric"') +
      f('ef-team', 'Integrantes por equipo (FAI 8.4: 3)', ev.teamSize || 3, 'inputmode="numeric"') +
      f('ef-dz', 'Zona de salto', ev.dz || '') +
      '<label class="f">Unidad de las alturas<select id="ef-units" data-change="ef-units"><option value="m"' + (!ft ? ' selected' : '') + '>Metros</option><option value="ft"' + (ft ? ' selected' : '') + '>Pies</option></select></label>' +
      f('ef-elev', 'Elevación del DZ (<span class="u">' + u + '</span> sobre el nivel del mar)', av(ev.cfg && ev.cfg.elev != null ? ev.cfg.elev : ''), 'inputmode="decimal" required data-alt') +
      f('ef-top', 'Ventana: límite superior (<span class="u">' + u + '</span> AGL)', av(c.top), 'inputmode="numeric" data-alt') +
      f('ef-bottom', 'Ventana: límite inferior (<span class="u">' + u + '</span> AGL)', av(c.bottom), 'inputmode="numeric" data-alt') +
      f('ef-exitmin', 'Salida mínima (<span class="u">' + u + '</span> AGL)', av(c.exitMin), 'inputmode="numeric" data-alt') +
      f('ef-exitmax', 'Salida máxima (<span class="u">' + u + '</span> AGL)', av(c.exitMax), 'inputmode="numeric" data-alt') +
      '<label class="f">Carril designado<select id="ef-lane"><option value="1"' + (ev.lane ? ' selected' : '') + '>Aplicar penalidades de carril</option><option value="0"' + (!ev.lane ? ' selected' : '') + '>No evaluar carril</option></select></label>' +
      '<label class="f">Separación entre competidores<select id="ef-sep"><option value="1"' + (ev.sepCheck ? ' selected' : '') + '>Cero si pasan a menos de 150 m</option><option value="0"' + (!ev.sepCheck ? ' selected' : '') + '>No evaluar</option></select></label>' +
      judgingFields(ev) +
      '<label class="f wide">Puntos de referencia en tierra, uno por línea: nombre, latitud, longitud<textarea id="ef-refs" placeholder="Norte, -31.4412, -64.2563">' + esc(refs) + '</textarea></label>' +
      '</div><p class="small muted">La elevación del DZ define la altura sobre el suelo (FAI 2.1 y 2.2). Los valores por defecto son los del reglamento FAI 2026. La unidad elegida se usa para cargar y mostrar las alturas de esta jornada; los resultados siguen en segundos, metros y km/h, como en el reglamento.</p>' +
      (S.ui.formError ? '<p class="note bad">' + esc(S.ui.formError) + '</p>' : '') +
      '<div class="row"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="cancel-form">Cancelar</button></div></form>';
  }

  function judgingFields(ev) {
    var J = judging(ev);
    function sel(id, label, val, opts) { return '<label class="f">' + label + '<select id="' + id + '" data-change="ef-jud">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>'; }
    return '<label class="f">Perfil de juzgamiento<select id="ef-prof" data-change="ef-prof">' +
      [['arg', PROFILES.arg.label], ['fai', PROFILES.fai.label], ['custom', 'Personalizado']].map(function (o) { return '<option value="' + o[0] + '"' + (J.profile === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      sel('ef-reviews', 'Revisiones para validar un salto', J.reviews, [[1, 'Una (un juez)'], [2, 'Dos (dos jueces, como FAI 7.1.2)']]) +
      sel('ef-door', 'Control de salidas', J.door, [['fd', DOOR.fd], ['device', DOOR.device], ['none', DOOR.none]]) +
      sel('ef-gps', 'GPS de menos de 5 Hz o SEP de 10 m o más', J.gpsRule, [['rejump', 'El juez decide: validar o re-salto (FAI)'], ['warn', 'Solo aviso, se puntúa igual']]) +
      sel('ef-exit', 'Salida fuera del rango permitido', J.exitRule, [['rejump', 'El juez decide: validar o re-salto (FAI)'], ['warn', 'Solo aviso, se puntúa igual']]);
  }

  function readEventForm(base) {
    var refs = [], bad = null;
    $('#ef-refs').value.split('\n').forEach(function (line) {
      line = line.trim(); if (!line) return;
      var p = line.split(/[,;\t]/).map(function (x) { return x.trim(); });
      var lat = parseFloat(p[p.length - 2]), lon = parseFloat(p[p.length - 1]);
      if (p.length < 3 || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { bad = line; return; }
      refs.push({ name: p.slice(0, p.length - 2).join(' ') || 'Punto ' + (refs.length + 1), lat: lat, lon: lon });
    });
    if (bad) throw new Error('No entiendo este punto de referencia: "' + bad + '". Usá: nombre, latitud, longitud (grados decimales).');
    var ft = $('#ef-units').value === 'ft', dv = function (m) { return ft ? m2ft(m) : m; };
    var elev = toM(num($('#ef-elev').value, NaN), ft), top = toM(num($('#ef-top').value, dv(2500)), ft), bottom = toM(num($('#ef-bottom').value, dv(1500)), ft);
    if (!isFinite(elev)) throw new Error('Falta la elevación del DZ sobre el nivel del mar.');
    if (!(top > bottom)) throw new Error('El límite superior de la ventana tiene que ser mayor que el inferior.');
    var name = $('#ef-name').value.trim(); if (!name) throw new Error('Poné un nombre para la jornada.');
    return Object.assign({}, base, {
      name: name, date: $('#ef-date').value, mode: $('#ef-mode').value, rounds: Math.max(1, Math.min(12, Math.round(num($('#ef-rounds').value, 3)))), teamSize: Math.max(1, Math.min(10, Math.round(num($('#ef-team').value, 3)))),
      dz: $('#ef-dz').value.trim(), lane: $('#ef-lane').value === '1', sepCheck: $('#ef-sep').value === '1', refs: refs,
      units: ft ? 'ft' : 'm',
      judging: { profile: $('#ef-prof').value, reviews: +$('#ef-reviews').value, door: $('#ef-door').value, gpsRule: $('#ef-gps').value, exitRule: $('#ef-exit').value },
      cfg: { elev: elev, top: top, bottom: bottom, exitMin: toM(num($('#ef-exitmin').value, dv(3200)), ft), exitMax: toM(num($('#ef-exitmax').value, dv(3353)), ft) },
      createdAt: base.createdAt || Date.now()
    });
  }

  // ---------- vista de jornada ----------
  function viewEvent() {
    var ev = getEvent(S.route.eventId);
    if (!ev) return S.mode === 'loading' ? '<p class="muted">Cargando…</p>' : '<p class="note warn">No encuentro esa jornada. <a href="#jornadas">Volver a jornadas</a></p>';
    var jumps = S.jumps[ev.id] || [];
    var h = '<div class="stack"><div class="row"><a href="#jornadas" class="small">← Jornadas</a></div><div class="row spread noprint"><div><h1>' + esc(ev.name) + '</h1><p class="muted">' +
      esc([ev.date, ev.dz].filter(Boolean).join(' · ')) + (ev.date || ev.dz ? ' · ' : '') + esc(cfgLine(ev)) + '</p></div>' + modePill(ev) + '</div>';
    var J = judging(ev), diffs = profileDiffs(ev);
    h += '<p class="small noprint"><span class="pill ' + (J.profile === 'fai' && !diffs.length ? 'good' : 'libre') + '">' + esc(J.label) + '</span> ' +
      (diffs.length ? '<span class="muted">Diferencias con el reglamento FAI 2026: ' + esc(diffs.join('; ')) + '.</span>' : '<span class="muted">Sin diferencias con el reglamento FAI 2026.</span>') + '</p>';
    if (ev.demo) h += '<p class="note noprint">Jornada de ejemplo con cinco tracks reales de prueba (alturas ya referidas al suelo). Podés cargar tus archivos acá para probar: nada de esta jornada se guarda.</p>';
    var tabs = [['tabla', 'Clasificación'], ['cargar', 'Cargar salto'], ['replay', 'Replay'], ['orden', 'Orden de salida'], ['acta', 'Acta y exportar'], ['ajustes', 'Ajustes']];
    if (ev.demo) tabs.pop();
    h += '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" data-act="tab" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (S.tab === 'tabla') h += tabTable(ev, jumps);
    else if (S.tab === 'cargar') h += tabUpload(ev, jumps);
    else if (S.tab === 'replay') h += tabReplay(ev, jumps);
    else if (S.tab === 'orden') h += tabOrder(ev);
    else if (S.tab === 'acta') h += jumps.length ? tabActa(ev, jumps) : '<p class="card muted">Todavía no hay saltos para exportar.</p>';
    else h += tabSettings(ev, jumps);
    return h + '</div>';
  }

  function scored(ev, jumps) {
    var copy = jumps.map(function (j) { return Object.assign({}, j); });
    var st = W.standings(copy, null, { tiebreak: ev.tiebreak });
    return { st: st, jumps: copy };
  }

  function tabTable(ev, jumps) {
    if (!jumps.length) return '<p class="card muted">Todavía no hay saltos en esta jornada. Abrí <b>Cargar salto</b> para subir el primer archivo.</p>';
    var r = scored(ev, jumps), st = r.st, h = '';
    var rounds = {};
    W.TASKS.forEach(function (t) {
      rounds[t] = st.rounds[t].slice();
      if (ev.mode === 'comp') for (var i = 1; i <= (ev.rounds || 3); i++) if (rounds[t].indexOf(i) < 0) rounds[t].push(i);
      rounds[t].sort(function (a, b) { return a - b; });
    });
    var tasks = W.TASKS.filter(function (t) { return rounds[t].length; });
    var cv = S.ui.cls || 'general', hasF = st.rows.some(function (r) { return r.jumps && pilotById(r.pilotId).gender === 'F'; }), hasT = st.rows.some(function (r) { return r.jumps && (pilotById(r.pilotId).team || '').trim(); });
    var views = [['general', 'General']].concat(hasF ? [['female', 'Femenina']] : [], hasT ? [['team', 'Equipos']] : [], tasks.map(function (t) { return [t, TASK[t]]; }));
    h += '<div class="seg" role="group" aria-label="Clasificación">' + views.map(function (v) { return '<button type="button" data-act="cls" data-v="' + v[0] + '" aria-pressed="' + (cv === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</div>';
    if (cv !== 'general' && views.some(function (v) { return v[0] === cv; })) {
      h += classView(ev, st, cv) + tieBlock(ev, st) + slotStrip(ev, r.jumps);
      if (S.ui.jumpId) { var jx = r.jumps.filter(function (x) { return jumpId(x) === S.ui.jumpId; })[0]; if (jx) h += jumpDetail(ev, jx); }
      return h;
    }
    h += '<div class="card scroll-x"><table><thead><tr><th rowspan="2">#</th><th rowspan="2" class="l">Piloto</th>';
    tasks.forEach(function (t) { h += '<th class="grp" colspan="' + (rounds[t].length + 1) + '">' + TASK[t] + ' (' + UNIT[t] + ')</th>'; });
    h += '<th rowspan="2" class="g0">Total</th></tr><tr>';
    tasks.forEach(function (t) { rounds[t].forEach(function (n, i) { h += '<th class="' + (i ? '' : 'g0') + '">R' + n + '</th>'; }); h += '<th>Pts</th>'; });
    h += '</tr></thead><tbody>';
    st.rows.forEach(function (row) {
      if (!row.jumps) return;
      var pz = pilotById(row.pilotId);
      h += '<tr><td class="rank">' + row.rank + '</td><td class="l"><b>' + esc(pilotName(row.pilotId)) + '</b>' + (pz.team ? ' <span class="small muted">' + esc(pz.team) + '</span>' : '') + (row.tb != null ? ' <span class="pill small" title="Salto de desempate">D ' + fmtTask(ev.tiebreak.task, row.tb) + '</span>' : '') + '</td>';
      tasks.forEach(function (t) {
        var tk = row.tasks[t] || { points: 0, cells: {} };
        rounds[t].forEach(function (n, i) {
          var j = tk.cells[n];
          h += '<td class="' + (i ? '' : 'g0') + '">';
          if (j) {
            var stt = jumpStatus(ev, j);
            h += '<button class="cell' + (j._isBest ? ' best' : '') + '" data-act="jump" data-id="' + esc(jumpId(j)) + '" title="Ver detalle"><span><b>' +
              (j.ok ? fmtTask(t, j._result) : '0') + '</b>' + '<i class="st st-' + stt.code + '" title="' + esc(stt.label) + '"></i>' + '</span><small>' +
              (j._pen ? '<span class="pen">−' + j._pen + '%</span> · ' : '') + fmt(j._points, 1) + '%</small></button>';
          } else h += '<span class="muted">·</span>';
          h += '</td>';
        });
        h += '<td class="avg">' + fmt(tk.points, 1) + '</td>';
      });
      h += '<td class="total g0">' + fmt(row.totalRounded, 1) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<p class="small muted">Cada resultado vale un porcentaje del mejor de su ronda; por tarea se promedian las rondas voladas y el total es la suma de las tres tareas (FAI 5.10). El mejor de cada ronda va en naranja. Tocá un resultado para ver el detalle.</p>';
    if (ev.mode === 'comp') {
      var chips = '';
      for (var n = 1; n <= (ev.rounds || 3); n++) {
        var full = W.TASKS.every(function (t) { return st.rounds[t].indexOf(n) >= 0; });
        chips += '<span class="pill ' + (full ? 'good' : '') + '">Ronda ' + n + (full ? ' completa' : ' incompleta') + '</span> ';
      }
      h += '<div class="row">' + chips + '<span class="small muted">Una ronda es válida cuando tiene las tres tareas (FAI 5.4.3).</span></div>';
    }
    h += tieBlock(ev, st);
    h += slotStrip(ev, r.jumps);
    if (S.ui.jumpId) {
      var j = r.jumps.filter(function (x) { return jumpId(x) === S.ui.jumpId; })[0];
      if (j) h += jumpDetail(ev, j);
    }
    return h;
  }

  function slotStrip(ev, jumps) {
    var slots = {}, v = ev.validated || {};
    jumps.forEach(function (j) { (slots[slotKey(j)] = slots[slotKey(j)] || []).push(j); });
    var keys = Object.keys(slots).sort(function (a, b) { var x = a.split('|'), y = b.split('|'); return (+x[1] - +y[1]) || W.TASKS.indexOf(x[0]) - W.TASKS.indexOf(y[0]); });
    var h = '<div class="card stack"><div class="row spread"><h3>Validación de tareas</h3><span class="small muted">Una tarea se valida cuando todos sus saltos están revisados (FAI 5.4.2). Hasta entonces, sus resultados son provisorios.</span></div><div class="slots">';
    keys.forEach(function (k) {
      var p = k.split('|'), list = slots[k], live = list.filter(function (j) { return !j.void; });
      var done = live.filter(function (j) { return jumpStatus(ev, j).code === 'ok'; }).length, ready = done === live.length && live.length > 0;
      h += '<div class="slot"><b>' + TASK[p[0]] + ' ' + rl(p[1]) + '</b><span class="small muted">' + done + ' de ' + live.length + ' revisados' + (list.length > live.length ? ' · ' + (list.length - live.length) + ' anulado' + (list.length - live.length > 1 ? 's' : '') : '') + '</span>';
      if (v[k]) h += '<span class="pill good">Validada · ' + esc(v[k].by || '') + '</span>' + ((S.canWrite || ev.demo) ? '<button class="btn sm" data-act="slot-open" data-slot="' + k + '">Reabrir</button>' : '');
      else if (S.canWrite || ev.demo) h += '<span class="pill warn">Provisoria</span><button class="btn sm' + (ready ? ' primary' : '') + '" data-act="slot-validate" data-slot="' + k + '"' + (ready ? '' : ' disabled title="Faltan saltos por revisar"') + '>Validar tarea</button>';
      else h += '<span class="pill warn">Provisoria</span>';
      h += '</div>';
    });
    return h + '</div>' + (S.ui.slotError ? '<p class="note bad small">' + esc(S.ui.slotError) + '</p>' : '') + '</div>';
  }

  function resultCard(j, extra) {
    var m = j.task, ev = getEvent(S.route.eventId), au = altU(ev), cf = ev ? evCfg(ev) : W.DEFAULT_CFG;
    function k(task, v, u) { return '<div class="kpi' + (task === m ? ' main' : '') + '"><div class="v">' + v + '</div><div class="k">' + TASK[task] + ' · ' + u + '</div></div>'; }
    var h = '<div class="kpis">' + k('time', fmt(j.time, 1), 's') + k('distance', fmt(j.distance, 0), 'm') + k('speed', fmt(j.speed, 1), 'km/h') +
      '<div class="kpi"><div class="v">' + altV(ev, j.exitAgl) + '</div><div class="k">Salida · ' + au + ' AGL</div></div>' +
      '<div class="kpi"><div class="v">' + (j.sepMax == null ? '–' : fmt(j.sepMax, 1)) + '</div><div class="k">SEP máx · m</div></div>' +
      '<div class="kpi"><div class="v">' + fmt(j.hz, 0) + '</div><div class="k">GPS · Hz</div></div>';
    if (j.laneDev != null) h += '<div class="kpi"><div class="v">' + fmt(j.laneDev, 0) + '</div><div class="k">Desvío máx del eje · m</div></div>';
    if (j.sepMin != null) h += '<div class="kpi"><div class="v">' + fmt(j.sepMin, 0) + '</div><div class="k">Mín. a otro piloto · m</div></div>';
    h += '</div>';
    var flags = (j.flags || []).map(function (f) {
      if (f.code === 'exit_low') return { level: f.level, text: 'Salida a ' + altV(ev, j.exitAgl) + ' ' + au + ' AGL, por debajo del mínimo de ' + altV(ev, cf.exitMin) + ' ' + au + ' (5.4.6).' };
      if (f.code === 'exit_high') return { level: f.level, text: 'Salida a ' + altV(ev, j.exitAgl) + ' ' + au + ' AGL, por encima del máximo de ' + altV(ev, cf.exitMax) + ' ' + au + ' (5.4.5).' };
      return f;
    });
    if (j.laneOutside > 0) flags.push({ level: 'warn', text: 'Salió ' + fmt(j.laneOutside, 0) + ' m del carril: penalidad de ' + j.lanePen + '% (5.6.2).' });
    if (j.sepViolation) flags.push({ level: 'warn', text: 'Pasó a ' + fmt(j.sepMin, 0) + ' m de ' + pilotName(j.sepWith) + ': resultado cero (5.6.3).' });
    flags.forEach(function (f) { h += '<p class="note ' + (f.level === 'warn' ? 'warn' : '') + ' small">' + esc(f.text) + '</p>'; });
    return h + (extra || '');
  }

  function jumpDetail(ev, j) {
    var J = judging(ev), stt = jumpStatus(ev, j), pend = pendingDecisions(ev, j), canEdit = S.canWrite || ev.demo, jid = jumpId(j);
    var h = '<div class="card stack" id="detail"><div class="row spread"><h2>' + esc(pilotName(j.pilotId)) + ' · ' + TASK[j.task] + ' · ' + rn(j.round) + '</h2><div class="row"><span class="pill ' + stt.cls + '">' + esc(stt.label) + '</span><button class="btn sm" data-act="close-jump">Cerrar</button></div></div>';
    h += resultCard(j);
    h += '<p class="small muted">Resultado: <b>' + (j.void ? 'anulado' : fmtTask(j.task, j._result) + ' ' + UNIT[j.task]) + '</b>' + (j.void ? '' : ' (' + fmt(j._points, 1) + '% del mejor de la ronda)') +
      (j._pen ? ' con penalidad de ' + j._pen + '%. ' + esc(j._penWhy) : '') + ' · ' + esc(j.device) + ' · ' + esc(j.fileName) + '</p>';
    h += '<div class="rvgrid"><div class="stack"><h3>Carril y trayectoria</h3><canvas id="rv-map" aria-label="Mapa del salto con el carril"></canvas><p class="small muted" id="rv-msg">' +
      (ev.lane && j.refIdx != null ? 'Punto rojo: máximo desvío, medido en ángulo recto al eje. Franjas: dentro del carril, −10 %, −20 % y −50 %.' : 'Sin carril: la jornada no lo evalúa o el salto no tiene punto de referencia asignado.') + '</p></div>' +
      '<div class="stack"><h3>Salida, validación y precisión</h3><canvas id="rv-charts" aria-label="Velocidad vertical y precisión del GPS"></canvas><p class="small muted">El carril empieza ' + fmt(9 + (+j.laneShift || 0), 1) + ' s después de llegar a 10 m/s de caída. Franja celeste: validación; naranja: ventana.</p></div></div>';
    h += '<div class="card stack"><h3>Archivo original</h3><p class="small">' + esc(j.fileName) + (j.fileSize ? ' · ' + fmt(j.fileSize / 1024, 0) + ' KB' : '') + ' · cargado el ' + new Date(j.uploadedAt).toLocaleString('es-AR') + (j.uploadedBy ? ' por ' + esc(j.uploadedBy) : '') + '</p>' +
      (j.fileHash ? '<p class="small">Huella SHA-256: <span class="mono hash">' + j.fileHash + '</span></p>' : '<p class="small muted">Este salto se cargó antes de que la plataforma guardara la huella del archivo.</p>') +
      '<div class="row">' + (j.originalSaved ? '<button class="btn sm" data-act="orig-dl">Descargar el original</button>' : '') +
      (j.fileHash ? '<label class="btn sm filebtn">Verificar un archivo<input type="file" data-change="verify-file" accept=".csv,.CSV,.gpx,.kml,.txt"></label>' : '') + '</div>' +
      '<p class="small muted">Para comprobar que un archivo no se modificó, elegilo en "Verificar un archivo": la plataforma calcula su huella y la compara con la de este salto.</p>' +
      (S.ui.verify ? '<p class="note small ' + (S.ui.verify.ok ? 'good' : 'bad') + '">' + esc(S.ui.verify.msg) + '</p>' : '') + '</div>';
    if (pend.length) h += '<p class="note warn">Para revisar este salto falta: ' + esc(pend.join('; ')) + '.</p>';
    if (canEdit) {
      var o = function (v, cur) { return String(v) === String(cur == null ? '' : cur) ? ' selected' : ''; };
      var flagged = (j.flags || []).some(function (f) { return ['sep', 'hz', 'gap', 'exit_low', 'exit_high'].indexOf(f.code) >= 0; });
      h += '<div class="card stack"><h3>Decisiones del juez</h3><div class="form">';
      if (flagged) h += '<label class="f">GPS o salida fuera de norma<select id="dj-flag"><option value=""' + o('', j.flagDecision) + '>' + ((J.gpsRule === 'rejump' || J.exitRule === 'rejump') ? 'Pendiente' : 'Solo aviso, según el perfil') + '</option><option value="accept"' + o('accept', j.flagDecision) + '>Validar el salto</option><option value="rejump"' + o('rejump', j.flagDecision) + '>Conceder re-salto (anula este salto)</option></select></label>';
      if (j.laneDev != null) h += '<label class="f">Carril: propuesta ' + j.lanePen + ' % (' + fmt(j.laneOutside, 0) + ' m afuera)' + (laneEdge(j) ? ', al límite' : '') + '<select id="dj-lane"><option value=""' + o('', j.laneDecision) + '>Usar la propuesta</option>' + [0, 10, 20, 50].map(function (v) { return '<option value="' + v + '"' + o(v, j.laneDecision) + '>' + (v ? v + ' %' : 'Sin penalidad') + '</option>'; }).join('') + '</select></label>' +
        '<label class="f">Corrección del inicio del carril (s)<span class="row"><input id="dj-shift" inputmode="decimal" value="' + esc(j.laneShift || 0) + '" style="width:90px"><button class="btn sm" type="button" data-act="lane-recalc">Recalcular carril</button></span></label>';
      if (j.sepViolation) h += '<label class="f">Separación: ' + fmt(j.sepMin, 0) + ' m de ' + esc(pilotName(j.sepWith)) + '<select id="dj-sep"><option value=""' + (j.sepApply == null ? ' selected' : '') + '>Pendiente (se aplica el cero)</option><option value="yes"' + (j.sepApply === true ? ' selected' : '') + '>Aplicar el cero a este piloto</option><option value="no"' + (j.sepApply === false ? ' selected' : '') + '>No aplicar a este piloto</option></select></label>';
      if (J.door !== 'none') h += '<label class="f">Salida, según ' + (J.door === 'fd' ? 'el Flight Director' : 'el cronómetro y el video') + '<select id="dj-exit"><option value="0"' + o(0, j.exitPen || 0) + '>Sin observaciones</option><option value="50"' + o(50, j.exitPen) + '>Fuera de tiempo, sin justificar: −50 %</option><option value="100"' + o(100, j.exitPen) + '>Reincidencia: −100 %</option></select></label>';
      h += '<label class="f">Penalidad total fijada a mano<select id="dj-manual"><option value=""' + o('', j.penManual) + '>No: usar las decisiones</option>' + [0, 10, 20, 50, 100].map(function (v) { return '<option value="' + v + '"' + o(v, j.penManual) + '>' + (v === 100 ? 'Cero' : v ? v + ' %' : 'Sin penalidad') + '</option>'; }).join('') + '</select></label>' +
        '<label class="f wide">Notas del juez<textarea id="dj-notes" style="min-height:60px;font-family:var(--font-body)">' + esc(j.notes || '') + '</textarea></label></div>' +
        '<div class="row"><button class="btn primary" data-act="save-decision">Guardar decisiones</button><span class="small muted">Si cambiás una decisión, se borran las firmas de revisión de este salto.</span></div></div>';
      var revs = j.reviews || [];
      h += '<div class="card stack"><h3>Revisión</h3><p class="small muted">Este perfil pide ' + (J.reviews > 1 ? J.reviews + ' revisiones de jueces distintos' : 'una revisión') + ' para dar el salto por revisado.</p>' +
        (revs.length ? '<ul class="small">' + revs.map(function (r) { return '<li>' + esc(r.name) + ' · ' + new Date(r.at).toLocaleString('es-AR') + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="row"><label class="f">Tu nombre de juez<input id="rv-name" value="' + esc(judgeName()) + '"></label><button class="btn' + (pend.length || j.void ? '' : ' primary') + '" data-act="sign-review"' + (pend.length || j.void ? ' disabled' : '') + '>Firmar revisión</button>' +
        (revs.length ? '<button class="btn sm" data-act="clear-reviews">Borrar firmas</button>' : '') + '</div>' + (S.ui.revError ? '<p class="note bad small">' + esc(S.ui.revError) + '</p>' : '') + '</div>';
      h += '<div class="row"><button class="btn" data-act="replay-slot" data-task="' + j.task + '" data-round="' + j.round + '">Ver replay de la tanda</button>' +
        (S.ui.confirmDel === jid ? '<button class="btn danger" data-act="del-jump-yes">Sí, borrar este salto</button><button class="btn" data-act="del-jump-no">No</button>' : '<button class="btn danger" data-act="del-jump">Borrar salto</button>') + '</div>';
    }
    return h + '</div>';
  }

  function tabUpload(ev, jumps) {
    var u = S.ui.up = S.ui.up || { task: 'time', round: 1, pilotId: '', refIdx: 0 };
    var h = '<form class="card stack" data-form="upload"><h2>Cargar salto</h2>';
    if (!S.canWrite && !ev.demo) h += '<p class="note">Tenés acceso de lectura: se calcula tu resultado pero no se guarda. Pasale el archivo a quien administra la jornada.</p>';
    h += '<div class="form"><label class="f">Piloto<select id="up-pilot" data-change="up-pilot"><option value="">Elegí…</option>' +
      allPilots().filter(function (p) { return ev.demo || !p.demo; }).map(function (p) { return '<option value="' + esc(p.id) + '"' + (u.pilotId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') +
      '<option value="__new"' + (u.pilotId === '__new' ? ' selected' : '') + '>+ Piloto nuevo</option></select></label>';
    if (u.pilotId === '__new') h += '<label class="f">Nombre del piloto nuevo<input id="up-newname" value="' + esc(u.newName || '') + '"></label>';
    h += '<div class="f"><span class="small muted">Tarea</span><div class="seg" role="group" aria-label="Tarea">' + W.TASKS.map(function (t) { return '<button type="button" data-act="up-task" data-task="' + t + '" aria-pressed="' + (u.task === t) + '">' + TASK[t] + '</button>'; }).join('') + '</div></div>';
    if (ev.mode === 'comp') {
      h += '<label class="f">Ronda<select id="up-round" data-change="up-round">';
      for (var n = 1; n <= (ev.rounds || 3); n++) h += '<option value="' + n + '"' + (u.round === n ? ' selected' : '') + '>Ronda ' + n + '</option>';
      h += '</select></label>';
    } else h += '<label class="f">Ronda<input id="up-round" data-change="up-round" inputmode="numeric" value="' + u.round + '"></label>';
    if (ev.tiebreak) h += '<label class="chk f"><input type="checkbox" data-change="up-tb"' + (u.round === 0 ? ' checked' : '') + '> Salto de desempate (' + TASK[ev.tiebreak.task] + ')</label>';
    if (ev.lane && (ev.refs || []).length) {
      h += '<label class="f">Punto de referencia asignado<select id="up-ref" data-change="up-ref">' + ev.refs.map(function (r, i) { return '<option value="' + i + '"' + (u.refIdx === i ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select></label>';
    }
    h += '<label class="f wide">Archivo del GPS (FlySight .CSV, FlySight 2 TRACK.CSV, Deep and Steep gps_*.csv, .GPX, .KML u otro CSV con hora, latitud, longitud y altura)<input type="file" id="up-file" accept=".csv,.CSV,.gpx,.kml,.txt,text/csv"></label></div>';
    if (ev.lane && !(ev.refs || []).length) h += '<p class="note warn small">La jornada tiene el carril activado pero no hay puntos de referencia cargados: el carril no se evalúa hasta que los agregues en Ajustes.</p>';
    var exists = u.pilotId && jumps.some(function (j) { return j.pilotId === u.pilotId && j.task === u.task && j.round === u.round; });
    var prevJ = u.pilotId && jumps.filter(function (j) { return j.pilotId === u.pilotId && j.task === u.task && j.round === u.round; })[0];
    if (prevJ) h += '<p class="note warn small">' + (prevJ.void ? 'Este salto está anulado por re-salto: el archivo nuevo lo reemplaza' : 'Este piloto ya tiene un salto de ' + TASK[u.task] + ' en la ronda ' + u.round + '. Si cargás otro, lo reemplaza') + ' y el anterior queda archivado.</p>';
    if (S.ui.upError) h += '<p class="note bad">' + esc(S.ui.upError) + '</p>';
    h += '<div class="row"><button class="btn primary" type="submit"' + (S.ui.busy ? ' disabled' : '') + '>' + (S.ui.busy ? 'Calculando…' : (S.canWrite || ev.demo ? 'Calcular y guardar' : 'Calcular')) + '</button></div></form>';
    if (S.ui.upResult) {
      var j = S.ui.upResult;
      h += '<div class="card stack"><div class="row spread"><h2>' + esc(pilotName(j.pilotId)) + ' · ' + TASK[j.task] + ' · ' + rn(j.round) + '</h2><span class="pill ' + (S.ui.upSaved ? 'good' : 'warn') + '">' + (S.ui.upSaved ? 'Guardado' : 'No guardado') + '</span></div>' +
        resultCard(j) + '<div class="row"><button class="btn" data-act="tab" data-tab="tabla">Ver clasificación</button>' +
        (S.ui.upSaved ? '<button class="btn" data-act="replay-slot" data-task="' + j.task + '" data-round="' + j.round + '">Ver replay de la tanda</button>' : '') + '</div></div>';
    }
    return h;
  }

  async function doUpload(ev) {
    var u = S.ui.up, file = $('#up-file').files[0];
    S.ui.upError = null; S.ui.upResult = null;
    try {
      if (u.pilotId === '__new') u.newName = ($('#up-newname').value || '').trim();
      if (!u.pilotId || (u.pilotId === '__new' && !u.newName)) throw new Error('Elegí el piloto.');
      if (!(u.round >= 1) && !(u.round === 0 && ev.tiebreak)) throw new Error('La ronda tiene que ser un número a partir de 1.');
      if (u.round === 0 && u.task !== ev.tiebreak.task) throw new Error('El salto de desempate es de ' + TASK[ev.tiebreak.task].toLowerCase() + '.');
      if (!file) throw new Error('Elegí el archivo del GPS.');
      S.ui.busy = true; render();
      var fbuf = await file.arrayBuffer(), text = new TextDecoder().decode(fbuf), fhash = await sha256Hex(fbuf);
      var parsed = W.parseTrack(text, file.name);
      var ref = ev.lane && ev.refs && ev.refs.length ? ev.refs[u.refIdx || 0] : null;
      var sc = W.scoreJump(parsed.pts, evCfg(ev), ref);
      if (!sc.ok) throw new Error(sc.error + ' Revisá que sea el archivo correcto y la elevación del DZ (' + altV(ev, evCfg(ev).elev) + ' ' + altU(ev) + ').');
      var pilotId = u.pilotId, canSave = S.canWrite || ev.demo;
      if (pilotId === '__new') {
        pilotId = (ev.demo ? 'demo' : 'p') + newId();
        var pdoc = { name: u.newName, suit: '', createdAt: Date.now() };
        if (ev.demo || !canSave) DEMO.pilots.push(Object.assign({ id: pilotId, demo: true }, pdoc));
        else { await Store.set('pilots/' + pilotId, pdoc); if (!S.pilots.some(function (p) { return p.id === pilotId; })) S.pilots.push(Object.assign({ id: pilotId }, pdoc)); }
        u.pilotId = pilotId; u.newName = '';
      }
      var j = jumpDoc(sc, { pilotId: pilotId, task: u.task, round: u.round, refIdx: ref ? (u.refIdx || 0) : null, device: parsed.device, fileName: file.name, fileHash: fhash, fileSize: fbuf.byteLength, uploadedBy: judgeName() || null });
      var jid = jumpId(j), packed = W.packTrack(W.trimTrack(parsed.pts, sc));
      S.ui.upSaved = false;
      if (canSave) {
        var base = 'events/' + ev.id;
        var prev = await Store.get(base + '/jumps/' + jid);
        if (prev && !ev.demo) {
          var prevTr = await Store.get(base + '/tracks/' + jid), prevOrig = await Store.get(base + '/originals/' + jid);
          await Store.set(base + '/archive/' + jid + '-' + Date.now(), { jump: prev, track: prevTr, original: prevOrig, archivedAt: Date.now(), by: judgeName() || null });
          await logAction(ev, 'Se reemplazó el salto de ' + pilotName(pilotId) + ', ' + TASK[u.task] + ' R' + u.round + (prev.void ? ' (re-salto)' : '') + '; el anterior quedó archivado', jid);
        } else await logAction(ev, 'Se cargó el salto de ' + pilotName(pilotId) + ', ' + TASK[u.task] + ' R' + u.round + ' (' + file.name + ')', jid);
        await Store.set(base + '/tracks/' + jid, packed);
        j.originalSaved = await saveOriginal(ev, jid, file, fbuf, fhash).catch(function (x) { console.warn(x); return false; });
        await saveJump(ev, j);
        S.tracks[ev.id + '/' + jid] = W.unpackTrack(packed);
        S.ui.upSaved = true; S.allLoaded = false;
        if (ev.sepCheck) { await checkSeparation(ev, j); j = (S.jumps[ev.id] || []).filter(function (x) { return jumpId(x) === jid; })[0] || j; }
      }
      S.ui.upResult = j;
    } catch (e) {
      S.ui.upError = e && e.code ? 'No pude guardar (' + e.code + '). ' + (e.code === 'invalid_argument' ? 'Tu acceso es de solo lectura.' : 'Probá de nuevo en un momento.') : (e.message || String(e));
    }
    S.ui.busy = false; render();
  }

  async function getTrack(evId, jid) {
    var key = evId + '/' + jid;
    if (S.tracks[key]) return S.tracks[key];
    var doc = await Store.get('events/' + evId + '/tracks/' + jid);
    if (!doc) return null;
    return (S.tracks[key] = W.unpackTrack(doc));
  }

  // Separación (5.6.3): compara el salto nuevo con los demás de la misma tarea y ronda.
  async function checkSeparation(ev, j) {
    var cfg = evCfg(ev), base = 'events/' + ev.id, jid = jumpId(j);
    var others = (await Store.list(base + '/jumps')).filter(function (o) { return o.task === j.task && o.round === j.round && o.pilotId !== j.pilotId && o.ok; });
    var mine = await getTrack(ev.id, jid); if (!mine) return;
    var best = null;
    for (var i = 0; i < others.length; i++) {
      var o = others[i], tr = await getTrack(ev.id, jumpId(o)); if (!tr) continue;
      var m = W.minSeparation(mine, j, tr, o); if (!m) continue;
      if (!best || m.d3 < best.d3) best = { d3: m.d3, withId: o.pilotId };
      if (o.sepMin == null || m.d3 < o.sepMin) {
        var upd = Object.assign({}, o, { sepMin: m.d3, sepWith: j.pilotId, sepViolation: m.d3 < cfg.separation });
        await Store.set(base + '/jumps/' + jumpId(o), upd); await sleep(120);
      }
    }
    var mineDoc = Object.assign({}, j, best ? { sepMin: best.d3, sepWith: best.withId, sepViolation: best.d3 < cfg.separation } : { sepMin: null, sepWith: null, sepViolation: false });
    await Store.set(base + '/jumps/' + jid, mineDoc);
    if (S.jumps[ev.id]) S.jumps[ev.id] = S.jumps[ev.id].filter(function (x) { return jumpId(x) !== jid; }).concat([Object.assign({ id: jid }, mineDoc)]);
  }

  async function recalcEvent(ev) {
    var base = 'events/' + ev.id, cfg = evCfg(ev), jumps = await Store.list(base + '/jumps'), done = 0;
    for (var i = 0; i < jumps.length; i++) {
      var o = jumps[i], jid = jumpId(o), tr = await getTrack(ev.id, jid);
      if (!tr) continue;
      var ref = ev.lane && ev.refs && o.refIdx != null ? ev.refs[o.refIdx] : null;
      var sc = W.scoreJump(tr, Object.assign({}, cfg, { valDelay: 9 + (+o.laneShift || 0) }), ref);
      var nj = jumpDoc(sc, { pilotId: o.pilotId, task: o.task, round: o.round, refIdx: o.refIdx, penManual: o.penManual, device: o.device, fileName: o.fileName, uploadedAt: o.uploadedAt });
      KEEP.forEach(function (k) { if (o[k] !== undefined) nj[k] = o[k]; });
      if (!sc.ok) nj.flags = [{ code: 'error', level: 'warn', text: sc.error }];
      jumps[i] = nj; done++;
    }
    // separación por tanda
    var slots = {};
    jumps.forEach(function (j) { if (j.ok) (slots[j.task + '|' + j.round] = slots[j.task + '|' + j.round] || []).push(j); });
    if (ev.sepCheck) {
      for (var key in slots) {
        var g = slots[key];
        for (var a = 0; a < g.length; a++) for (var b = a + 1; b < g.length; b++) {
          var ta = await getTrack(ev.id, jumpId(g[a])), tb = await getTrack(ev.id, jumpId(g[b]));
          if (!ta || !tb) continue;
          var m = W.minSeparation(ta, g[a], tb, g[b]); if (!m) continue;
          [[g[a], g[b]], [g[b], g[a]]].forEach(function (p) {
            if (p[0].sepMin == null || m.d3 < p[0].sepMin) { p[0].sepMin = m.d3; p[0].sepWith = p[1].pilotId; p[0].sepViolation = m.d3 < cfg.separation; }
          });
        }
      }
    }
    for (var n = 0; n < jumps.length; n++) { await Store.set(base + '/jumps/' + jumpId(jumps[n]), jumps[n]); await sleep(150); }
    await logAction(ev, 'Se recalcularon ' + done + ' saltos con los ajustes de la jornada');
    S.allLoaded = false;
    return done;
  }

  function tabSettings(ev, jumps) {
    if (!S.canWrite) return '<p class="card muted">Solo quien administra la página puede cambiar los ajustes.</p>';
    var h = eventForm(ev);
    h += '<div class="card stack"><h2>Recalcular</h2><p class="muted">Si cambiaste la elevación, la ventana, el carril o los puntos de referencia, recalculá para volver a puntuar los ' + jumps.length + ' saltos guardados con los ajustes nuevos.</p>' +
      '<div class="row"><button class="btn" data-act="recalc"' + (S.ui.busy ? ' disabled' : '') + '>' + (S.ui.busy ? 'Recalculando…' : 'Recalcular todos los saltos') + '</button>' + (S.ui.recalcMsg ? '<span class="small">' + esc(S.ui.recalcMsg) + '</span>' : '') + '</div></div>';
    h += '<div class="card stack"><h2>Historial de cambios</h2><p class="muted">Cada carga, reemplazo, decisión, firma y validación queda registrada con fecha y nombre del juez. Los saltos reemplazados quedan archivados.</p>' +
      (S.ui.log ? (S.ui.log.length ? '<div class="scroll-x"><table><thead><tr><th class="l">Fecha</th><th class="l">Juez</th><th class="l">Qué pasó</th></tr></thead><tbody>' + S.ui.log.map(function (l) { return '<tr><td class="l small">' + new Date(l.at).toLocaleString('es-AR') + '</td><td class="l small">' + esc(l.who) + '</td><td class="l small" style="white-space:normal">' + esc(l.text) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">Todavía no hay cambios registrados.</p>') : '') +
      '<div class="row"><button class="btn" data-act="show-log">' + (S.ui.log ? 'Actualizar historial' : 'Ver historial') + '</button></div></div>';
    h += '<div class="card stack"><h2>Borrar jornada</h2><div class="row">' + (S.ui.confirmDelEv ? '<span>Se borran la jornada y sus ' + jumps.length + ' saltos. No se puede deshacer.</span><button class="btn danger" data-act="del-event-yes">Sí, borrar</button><button class="btn" data-act="del-event-no">No</button>' : '<button class="btn danger" data-act="del-event">Borrar esta jornada</button>') + '</div></div>';
    return h;
  }

  // ---------- replay (selección; el dibujo está en replay.js) ----------
  function tabReplay(ev, jumps) {
    var ok = jumps.filter(function (j) { return j.ok; });
    if (!ok.length) return '<p class="card muted">Cuando haya saltos cargados vas a poder reproducir la tanda acá.</p>';
    var slots = {};
    ok.forEach(function (j) { slots[j.task + '|' + j.round] = true; });
    var keys = Object.keys(slots).sort(function (a, b) { var x = a.split('|'), y = b.split('|'); return (+x[1] - +y[1]) || W.TASKS.indexOf(x[0]) - W.TASKS.indexOf(y[0]); });
    var rp = S.ui.rp = S.ui.rp || {};
    if (!rp.slot || !slots[rp.slot]) { rp.slot = keys[0]; rp.off = {}; }
    var parts = rp.slot.split('|'), inSlot = ok.filter(function (j) { return j.task === parts[0] && String(j.round) === parts[1]; });
    var h = '<div class="row"><label class="f">Tanda<select id="rp-slot" data-change="rp-slot">' + keys.map(function (k) { var p = k.split('|'); return '<option value="' + k + '"' + (k === rp.slot ? ' selected' : '') + '>' + TASK[p[0]] + ' · Ronda ' + p[1] + '</option>'; }).join('') + '</select></label>' +
      '<div class="row">' + inSlot.map(function (j, i) { return '<label class="chk" style="--c:' + COLORS[i % COLORS.length] + '"><input type="checkbox" data-change="rp-pilot" data-id="' + esc(j.pilotId) + '"' + (rp.off[j.pilotId] ? '' : ' checked') + '><i></i>' + esc(pilotName(j.pilotId)) + '</label>'; }).join('') + '</div></div>';
    var cam = rp.cam || 'auto';
    h += '<div id="rp-stage" class="stack"><div class="replay"><div class="view3d" id="rp-3d"><canvas id="cv3d" aria-label="Vista 3D de la tanda"></canvas><div id="rp-labels"></div><p class="no3d-msg">Este navegador no puede mostrar la vista 3D. Abajo tenés el perfil y la vista desde arriba.</p><span class="hint3d">Arrastrá para girar · rueda para acercar</span></div><div class="board" id="rp-board"></div></div>' +
      '<div class="card row ctrl"><button class="btn primary" data-act="rp-play" id="rp-play">Reproducir</button><button class="btn" data-act="rp-restart">Reiniciar</button><span class="clock" id="rp-clock">0,0 s</span>' +
      '<input type="range" id="rp-seek" min="0" max="1000" value="0" aria-label="Posición"><div class="seg" role="group" aria-label="Velocidad">' + [1, 2, 4, 8].map(function (s) { return '<button type="button" data-act="rp-speed" data-speed="' + s + '" aria-pressed="' + ((rp.speed || 4) === s) + '">×' + s + '</button>'; }).join('') + '</div>' +
      '<button class="btn" data-act="rp-full">Pantalla completa</button>' +
      '<label class="f">Cámara<select id="rp-cam" data-change="rp-cam">' + [['auto', 'Automática'], ['behind', 'Desde atrás'], ['side', 'De costado'], ['top', 'Desde arriba']].map(function (o) { return '<option value="' + o[0] + '"' + (cam === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">Sincronizar<select id="rp-sync" data-change="rp-sync"><option value="window"' + (rp.sync === 'window' || !rp.sync ? ' selected' : '') + '>Entrada a la ventana</option><option value="exit"' + (rp.sync === 'exit' ? ' selected' : '') + '>Salida del avión</option><option value="real"' + (rp.sync === 'real' ? ' selected' : '') + '>Hora real del GPS</option></select></label>' +
      '<label class="f">Posiciones<select id="rp-plan" data-change="rp-plan"><option value="race"' + (rp.plan !== 'real' ? ' selected' : '') + '>Carrera: carriles superpuestos</option><option value="real"' + (rp.plan === 'real' ? ' selected' : '') + '>Posición real (norte arriba)</option></select></label></div></div>' +
      '<div class="twoup"><canvas id="cvProfile" aria-label="Perfil del vuelo"></canvas><canvas id="cvPlan" aria-label="Vista desde arriba"></canvas></div>';
    return h;
  }
  S.replayItems = async function () {
    var ev = getEvent(S.route.eventId), rp = S.ui.rp; if (!ev || !rp) return null;
    var parts = rp.slot.split('|');
    var r = scored(ev, S.jumps[ev.id] || []);
    var inSlot = r.jumps.filter(function (j) { return j.ok && j.task === parts[0] && String(j.round) === parts[1]; });
    var items = [];
    for (var i = 0; i < inSlot.length; i++) {
      var j = inSlot[i]; if (rp.off[j.pilotId]) continue;
      var pts = await getTrack(ev.id, jumpId(j)); if (!pts) continue;
      items.push({ jump: j, pts: pts, name: pilotName(j.pilotId), color: COLORS[i % COLORS.length], ref: ev.lane && ev.refs && j.refIdx != null ? ev.refs[j.refIdx] : null });
    }
    return { items: items, task: parts[0], cfg: evCfg(ev), sync: rp.sync || 'window', plan: rp.plan || 'race', speed: rp.speed || 4, cam: rp.cam || 'auto', altFt: isFt(ev) };
  };

  // ---------- histórico ----------
  async function ensureAllJumps() {
    if (S.allLoaded || S.loadingAll || S.mode === 'loading') return;
    S.loadingAll = true;
    try {
      var evs = allEvents();
      for (var i = 0; i < evs.length; i++) if (!S.jumps[evs[i].id] || evs[i].id !== S.route.eventId) S.jumps[evs[i].id] = await Store.list('events/' + evs[i].id + '/jumps');
      S.allLoaded = true;
    } catch (e) { console.warn(e); }
    S.loadingAll = false; render();
  }
  function everyJump(includeDemo) {
    var out = [];
    allEvents().forEach(function (ev) {
      if (ev.demo && !includeDemo) return;
      var r = scored(ev, S.jumps[ev.id] || []);
      r.jumps.forEach(function (j) { j._ev = ev; out.push(j); });
    });
    return out;
  }
  function viewRanking() {
    var h = '<div><h1>Ranking histórico</h1><p class="muted">Mejor marca de cada piloto en cada tarea, entre todas las jornadas guardadas.</p></div>';
    if (!S.allLoaded) return h + '<p class="muted">Cargando saltos…</p>';
    var onlyStd = S.ui.onlyStd !== false;
    var jumps = everyJump(false).filter(function (j) { return j.ok && j._pen < 100; });
    if (onlyStd) jumps = jumps.filter(function (j) { var c = evCfg(j._ev); return Math.abs(c.top - 2500) < 1 && Math.abs(c.bottom - 1500) < 1; });
    h += '<label class="chk"><input type="checkbox" data-change="only-std"' + (onlyStd ? ' checked' : '') + '>Solo saltos con ventana FAI 2500–1500 m</label>';
    if (!jumps.length) return h + '<p class="card muted">Todavía no hay saltos guardados para armar el ranking. La jornada de ejemplo no cuenta.</p>';
    h += '<div class="form">';
    W.TASKS.forEach(function (t) {
      var best = {};
      jumps.filter(function (j) { return j.task === t; }).forEach(function (j) { if (!best[j.pilotId] || j._result > best[j.pilotId]._result) best[j.pilotId] = j; });
      var rows = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return b._result - a._result; });
      h += '<div class="card"><h2>' + TASK[t] + '</h2><div class="scroll-x"><table><thead><tr><th>#</th><th class="l">Piloto</th><th>' + UNIT[t] + '</th><th class="l">Jornada</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (j, i) { return '<tr><td class="rank">' + (i + 1) + '</td><td class="l"><b>' + esc(pilotName(j.pilotId)) + '</b></td><td class="total">' + fmtTask(t, j._result) + '</td><td class="l small"><a href="#jornada-' + esc(j._ev.id) + '">' + esc(j._ev.name) + '</a><br><span class="muted">' + esc(j._ev.date || '') + '</span></td></tr>'; }).join('') : '<tr><td colspan="4" class="l muted">Sin saltos</td></tr>') +
        '</tbody></table></div></div>';
    });
    h += '</div><div class="card"><h2>Ganadores por jornada</h2><div class="scroll-x"><table><thead><tr><th class="l">Jornada</th><th class="l">Fecha</th><th class="l">1.º</th><th class="l">2.º</th><th class="l">3.º</th></tr></thead><tbody>';
    S.events.forEach(function (ev) {
      var st = scored(ev, S.jumps[ev.id] || []).st, rows = st.rows.filter(function (r) { return r.jumps; });
      function pod(n) { var r = rows.filter(function (x) { return x.rank === n; }); return r.length ? r.map(function (x) { return esc(pilotName(x.pilotId)) + ' <span class="muted">' + fmt(x.totalRounded, 1) + '</span>'; }).join('<br>') : '–'; }
      h += '<tr><td class="l"><a href="#jornada-' + esc(ev.id) + '">' + esc(ev.name) + '</a> ' + modePill(ev) + '</td><td class="l">' + esc(ev.date || '') + '</td><td class="l">' + pod(1) + '</td><td class="l">' + pod(2) + '</td><td class="l">' + pod(3) + '</td></tr>';
    });
    return h + '</tbody></table></div></div>';
  }

  function viewPilots() {
    var h = '<div class="row spread"><div><h1>Pilotos</h1><p class="muted">Historial de saltos de cada uno.</p></div></div>';
    if (S.canWrite) h += '<form class="card row" data-form="pilot"><label class="f">Nombre<input id="pf-name"></label><label class="f">Traje<input id="pf-suit"></label><label class="f">Categoría<select id="pf-gender"><option value="">General</option><option value="F">Femenina</option></select></label><label class="f">Equipo o club<input id="pf-team"></label><button class="btn primary" type="submit">Agregar piloto</button></form>';
    if (!S.pilots.length) return h + '<p class="card muted">Todavía no hay pilotos. También se pueden crear al cargar un salto.</p>';
    var jumps = S.allLoaded ? everyJump(false) : [];
    h += '<div class="list">';
    S.pilots.forEach(function (p) {
      var mine = jumps.filter(function (j) { return j.pilotId === p.id; });
      var open = S.ui.pilotOpen === p.id;
      h += '<div class="card stack"><div class="row spread"><div><h3>' + esc(p.name) + '</h3><p class="small muted">' + esc(p.suit || 'Sin traje cargado') + (p.gender === 'F' ? ' · Femenina' : '') + (p.team ? ' · ' + esc(p.team) : '') + ' · ' + (S.allLoaded ? mine.length + ' saltos' : '…') + '</p></div><div class="row">' +
        '<button class="btn sm" data-act="pilot-open" data-id="' + esc(p.id) + '">' + (open ? 'Ocultar saltos' : 'Ver saltos') + '</button>' +
        (S.canWrite ? (S.ui.confirmDelPilot === p.id ? '<button class="btn sm danger" data-act="del-pilot-yes" data-id="' + esc(p.id) + '">Sí, borrar</button><button class="btn sm" data-act="del-pilot-no">No</button>' : '<button class="btn sm danger" data-act="del-pilot" data-id="' + esc(p.id) + '">Borrar</button>') : '') + '</div></div>';
      if (open && S.canWrite) h += '<div class="row"><label class="f">Categoría<select id="pe-gender-' + esc(p.id) + '"><option value="">General</option><option value="F"' + (p.gender === 'F' ? ' selected' : '') + '>Femenina</option></select></label><label class="f">Equipo o club<input id="pe-team-' + esc(p.id) + '" value="' + esc(p.team || '') + '"></label><label class="f">Traje<input id="pe-suit-' + esc(p.id) + '" value="' + esc(p.suit || '') + '"></label><button class="btn sm" data-act="pilot-save" data-id="' + esc(p.id) + '">Guardar</button></div>';
      if (open) {
        if (!mine.length) h += '<p class="muted small">Sin saltos guardados.</p>';
        else {
          mine.sort(function (a, b) { return (b.tExit || 0) - (a.tExit || 0); });
          h += '<div class="scroll-x"><table><thead><tr><th class="l">Jornada</th><th class="l">Tarea</th><th>Ronda</th><th>Tiempo s</th><th>Distancia m</th><th>Velocidad km/h</th><th>Puntos</th></tr></thead><tbody>' +
            mine.map(function (j) { return '<tr><td class="l"><a href="#jornada-' + esc(j._ev.id) + '">' + esc(j._ev.name) + '</a> <span class="muted small">' + esc(j._ev.date || '') + '</span></td><td class="l">' + TASK[j.task] + '</td><td>' + j.round + '</td><td>' + fmt(j.time, 1) + '</td><td>' + fmt(j.distance, 0) + '</td><td>' + fmt(j.speed, 1) + '</td><td>' + fmt(j._points, 1) + '%' + (j._pen ? ' <span class="pill bad">−' + j._pen + '%</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
        }
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  function viewRules() {
    return document.getElementById('rules-tpl').innerHTML;
  }

  // ---------- acciones ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act'), ev = getEvent(S.route.eventId);
    if (a === 'new-event') { S.ui.eventForm = { mode: 'libre', rounds: 3, lane: true, sepCheck: true, refs: [], cfg: {}, judging: { profile: 'arg' } }; S.ui.editing = true; render(); }
    else if (a === 'cancel-form') { S.ui.eventForm = null; S.ui.editing = false; S.ui.formError = null; render(); }
    else if (a === 'tab') { S.tab = el.getAttribute('data-tab'); S.ui.jumpId = null; S.ui.formError = null; if (window.Replay) window.Replay.stop(); render(); }
    else if (a === 'jump') { S.ui.jumpId = el.getAttribute('data-id'); S.ui.confirmDel = null; S.ui.verify = null; S.ui.revError = null; render(); var d = $('#detail'); if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else if (a === 'close-jump') { S.ui.jumpId = null; render(); }
    else if (a === 'del-jump') { S.ui.confirmDel = S.ui.jumpId; render(); }
    else if (a === 'del-jump-no') { S.ui.confirmDel = null; render(); }
    else if (a === 'del-jump-yes') {
      var id = S.ui.jumpId, jd = curJump(ev), bp = 'events/' + ev.id; S.ui.jumpId = null; S.ui.confirmDel = null; S.allLoaded = false;
      (async function () {
        if (!ev.demo && jd) {
          var tr = await Store.get(bp + '/tracks/' + id), og = await Store.get(bp + '/originals/' + id);
          await Store.set(bp + '/archive/' + id + '-' + Date.now(), { jump: jd, track: tr, original: og, archivedAt: Date.now(), by: judgeName() || null, deleted: true });
          await logAction(ev, 'Se borró el salto de ' + pilotName(jd.pilotId) + ', ' + TASK[jd.task] + ' R' + jd.round + '; quedó archivado', id);
        }
        await Store.del(bp + '/jumps/' + id); await Store.del(bp + '/tracks/' + id); await Store.del(bp + '/originals/' + id).catch(function () {});
        delete S.tracks[ev.id + '/' + id];
      })().catch(function (x) { console.warn(x); });
    }
    else if (a === 'save-decision') saveDecision(ev);
    else if (a === 'cls') { S.ui.cls = el.getAttribute('data-v'); render(); }
    else if (a === 'tb-draw') { var tks = topTies(scored(ev, S.jumps[ev.id] || []).st); var tt = W.TASKS[rnd(3)]; saveEventPatch(ev, { tiebreak: { task: tt, at: Date.now(), by: judgeName() || null, pilots: [].concat.apply([], tks.map(function (g) { return g.rows.map(function (r) { return r.pilotId; }); })) } }).then(function () { return logAction(ev, 'Se sorteó la tarea de desempate: ' + TASK[tt]); }).then(function () { if (ev.demo) render(); }); }
    else if (a === 'tb-clear') { saveEventPatch(ev, { tiebreak: null }).then(function () { return logAction(ev, 'Se quitó el desempate'); }).then(function () { if (ev.demo) render(); }); }
    else if (a === 'draw-tasks') { var to = shuffle(W.TASKS); saveEventPatch(ev, { taskOrder: to, taskOrderBy: judgeName() || null, taskOrderAt: Date.now() }).then(function () { return logAction(ev, 'Se sorteó el orden de tareas: ' + to.map(function (t) { return TASK[t]; }).join(', ')); }).then(function () { if (ev.demo) render(); }); }
    else if (a === 'ord-make') makeOrder(ev, +el.getAttribute('data-round')).catch(function (x) { console.warn(x); });
    else if (a === 'ord-clear') { var oc = Object.assign({}, ev.order || {}); delete oc[el.getAttribute('data-round')]; saveEventPatch(ev, { order: oc }).then(function () { if (ev.demo) render(); }); }
    else if (a === 'ord-more') { S.ui.ordRounds = (S.ui.ordRounds || 3) + 1; render(); }
    else if (a === 'pilot-save') {
      var pid2 = el.getAttribute('data-id'), pp = allPilots().filter(function (x) { return x.id === pid2; })[0]; if (!pp) return;
      var upd = { gender: $('#pe-gender-' + pid2).value, team: $('#pe-team-' + pid2).value.trim(), suit: $('#pe-suit-' + pid2).value.trim() };
      if (pp.demo) { Object.assign(pp, upd); render(); }
      else { var pd = Object.assign({}, pp, upd); delete pd.id; Store.set('pilots/' + pid2, pd).catch(function (x) { console.warn(x); }); }
    }
    else if (a === 'print') window.print();
    else if (a === 'export-csv') exportCsv(ev);
    else if (a === 'export-json') exportBackup(ev);
    else if (a === 'orig-dl') { var jo = curJump(ev); if (jo) downloadOriginal(ev, jo).catch(function (x) { console.warn(x); }); }
    else if (a === 'sign-review') signReview(ev);
    else if (a === 'clear-reviews') { var jc = curJump(ev); if (jc) saveJump(ev, Object.assign({}, jc, { reviews: [] }), 'Se borraron las firmas de revisión de ' + pilotName(jc.pilotId) + ', ' + TASK[jc.task] + ' R' + jc.round).then(function () { if (ev.demo) render(); }).catch(function (x) { console.warn(x); }); }
    else if (a === 'lane-recalc') laneRecalc(ev);
    else if (a === 'slot-validate' || a === 'slot-open') {
      var k = el.getAttribute('data-slot'), nv = Object.assign({}, ev.validated || {}), p = k.split('|');
      S.ui.slotError = null;
      if (a === 'slot-validate') { if (!judgeName()) { S.ui.slotError = 'Firmá al menos una revisión con tu nombre de juez antes de validar una tarea.'; render(); return; } nv[k] = { by: judgeName(), at: Date.now() }; }
      else delete nv[k];
      saveEventPatch(ev, { validated: nv }).then(function () { return logAction(ev, (a === 'slot-validate' ? 'Se validó' : 'Se reabrió') + ' la tarea ' + TASK[p[0]] + ' ' + rl(p[1])); }).then(function () { if (ev.demo) render(); }).catch(function (x) { console.warn(x); });
    }
    else if (a === 'show-log') loadLog(ev);
    else if (a === 'up-task') { S.ui.up.task = el.getAttribute('data-task'); keepUpload(); render(); }
    else if (a === 'replay-slot') { S.ui.rp = { slot: el.getAttribute('data-task') + '|' + el.getAttribute('data-round'), off: {} }; S.tab = 'replay'; S.ui.jumpId = null; render(); }
    else if (a === 'recalc') { S.ui.busy = true; S.ui.recalcMsg = ''; render(); recalcEvent(ev).then(function (n) { S.ui.recalcMsg = 'Listo: ' + n + ' saltos recalculados.'; }).catch(function (x) { S.ui.recalcMsg = 'No pude terminar: ' + (x.code || x.message); }).then(function () { S.ui.busy = false; render(); }); }
    else if (a === 'del-event') { S.ui.confirmDelEv = true; render(); }
    else if (a === 'del-event-no') { S.ui.confirmDelEv = false; render(); }
    else if (a === 'del-event-yes') { deleteEvent(ev); }
    else if (a === 'pilot-open') { var pid = el.getAttribute('data-id'); S.ui.pilotOpen = S.ui.pilotOpen === pid ? null : pid; render(); }
    else if (a === 'del-pilot') { S.ui.confirmDelPilot = el.getAttribute('data-id'); render(); }
    else if (a === 'del-pilot-no') { S.ui.confirmDelPilot = null; render(); }
    else if (a === 'del-pilot-yes') { S.ui.confirmDelPilot = null; Store.del('pilots/' + el.getAttribute('data-id')).catch(function (x) { console.warn(x); }); }
    else if (a.indexOf('rp-') === 0 && window.Replay) {
      if (a === 'rp-play') window.Replay.toggle();
      else if (a === 'rp-restart') window.Replay.restart();
      else if (a === 'rp-full') { var stg = $('#rp-stage'); try { if (document.fullscreenElement) document.exitFullscreen(); else if (stg && stg.requestFullscreen) stg.requestFullscreen().catch(function () {}); } catch (x) {} }
      else if (a === 'rp-speed') { S.ui.rp.speed = +el.getAttribute('data-speed'); window.Replay.setSpeed(S.ui.rp.speed); document.querySelectorAll('[data-act="rp-speed"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); }); }
    }
  });
  function curJump(ev) { return (S.jumps[ev.id] || []).filter(function (x) { return jumpId(x) === S.ui.jumpId; })[0]; }
  async function saveDecision(ev) {
    var j = curJump(ev); if (!j) return;
    var val = function (id) { var e = $(id); return e ? e.value : undefined; };
    var n = Object.assign({}, j), changed = [];
    function set(k, v, label) { if (v === undefined) return; if (String(n[k] == null ? '' : n[k]) !== String(v == null ? '' : v)) { n[k] = v; changed.push(label); } }
    var f = val('#dj-flag');
    if (f !== undefined) { set('flagDecision', f || null, 'GPS o salida: ' + (f === 'rejump' ? 're-salto' : f === 'accept' ? 'validado' : 'pendiente')); n.void = f === 'rejump'; }
    var l = val('#dj-lane'); if (l !== undefined) set('laneDecision', l === '' ? null : +l, 'carril: ' + (l === '' ? 'propuesta' : l + ' %'));
    var sp = val('#dj-sep'); if (sp !== undefined) set('sepApply', sp === '' ? null : sp === 'yes', 'separación: ' + (sp === 'yes' ? 'aplicar cero' : sp === 'no' ? 'no aplicar' : 'pendiente'));
    var ex = val('#dj-exit'); if (ex !== undefined && +ex !== (+j.exitPen || 0)) set('exitPen', +ex, 'salida: ' + ex + ' %');
    var m = val('#dj-manual'); if (m !== undefined) set('penManual', m === '' ? null : +m, 'penalidad a mano: ' + (m === '' ? 'no' : m + ' %'));
    var nt = val('#dj-notes'); if (nt !== undefined && nt !== (j.notes || '')) { n.notes = nt; changed.push('notas'); }
    if (!changed.length) return;
    if ((n.reviews || []).length && changed.some(function (c) { return c !== 'notas'; })) n.reviews = [];
    S.allLoaded = false; S.ui.revError = null;
    try { await saveJump(ev, n, 'Decisión sobre ' + pilotName(j.pilotId) + ', ' + TASK[j.task] + ' ' + rl(j.round) + ': ' + changed.join('; ')); }
    catch (x) { S.ui.revError = 'No pude guardar (' + (x.code || x.message) + ').'; }
    if (ev.demo) render();
  }
  async function signReview(ev) {
    var j = curJump(ev); if (!j) return;
    var name = ($('#rv-name').value || '').trim();
    if (!name) { S.ui.revError = 'Escribí tu nombre de juez para firmar.'; render(); return; }
    setJudgeName(name);
    var revs = (j.reviews || []).slice();
    if (revs.some(function (r) { return r.name.toLowerCase() === name.toLowerCase(); })) { S.ui.revError = 'Ya firmaste este salto. La otra revisión tiene que ser de otro juez.'; render(); return; }
    if (pendingDecisions(ev, j).length) { S.ui.revError = 'Primero tomá las decisiones pendientes.'; render(); return; }
    revs.push({ name: name, uid: S.uid || null, at: Date.now() });
    S.ui.revError = null;
    try { await saveJump(ev, Object.assign({}, j, { reviews: revs }), 'Revisión firmada por ' + name + ': ' + pilotName(j.pilotId) + ', ' + TASK[j.task] + ' ' + rl(j.round)); }
    catch (x) { S.ui.revError = 'No pude guardar (' + (x.code || x.message) + ').'; }
    if (ev.demo) render();
  }
  async function laneRecalc(ev) {
    var j = curJump(ev); if (!j) return;
    var sh = num($('#dj-shift').value, 0);
    if (Math.abs(sh) > 5) { S.ui.revError = 'La corrección del inicio del carril tiene que estar entre −5 y +5 s.'; render(); return; }
    var tr = await getTrack(ev.id, jumpId(j)); if (!tr) return;
    var ref = ev.lane && ev.refs && j.refIdx != null ? ev.refs[j.refIdx] : null;
    var sc = W.scoreJump(tr, Object.assign({}, evCfg(ev), { valDelay: 9 + sh }), ref);
    if (!sc.ok || !sc.lane) { S.ui.revError = 'No pude recalcular el carril de este salto.'; render(); return; }
    var n = Object.assign({}, j, { laneShift: sh, tVal: sc.tVal, laneDev: sc.lane.dev, laneOutside: sc.lane.outside, lanePen: sc.lane.penalty, reviews: [] });
    S.allLoaded = false; S.ui.revError = null;
    await saveJump(ev, n, 'Inicio del carril corregido ' + (sh >= 0 ? '+' : '') + sh + ' s en ' + pilotName(j.pilotId) + ', ' + TASK[j.task] + ' ' + rl(j.round) + ': ' + fmt(sc.lane.outside, 0) + ' m afuera');
    if (ev.demo) render();
  }
  async function loadLog(ev) {
    try { var docs = await Store.list('events/' + ev.id + '/log'); S.ui.log = docs.sort(function (a, b) { return b.at - a.at; }).slice(0, 200); }
    catch (x) { S.ui.log = []; }
    render();
  }

  // ---------- huella del archivo original y exportación ----------
  async function sha256Hex(buf) {
    var h = await crypto.subtle.digest('SHA-256', buf);
    return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function b64(u8) { var s = '', n = 0x8000; for (var i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); }
  function unb64(s) { var bin = atob(s), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
  async function gzipB64(buf) {
    if (typeof CompressionStream === 'undefined') return { enc: 'raw', data: b64(new Uint8Array(buf)) };
    var out = await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return { enc: 'gzip', data: b64(new Uint8Array(out)) };
  }
  async function ungzip(doc) {
    var u8 = unb64(doc.data);
    if (doc.enc !== 'gzip') return u8.buffer;
    return await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  var ORIG_MAX = 900000; // caracteres en base64 por documento
  async function saveOriginal(ev, jid, file, buf, hash) {
    var z = await gzipB64(buf);
    if (z.data.length > ORIG_MAX) return false;
    await Store.set('events/' + ev.id + '/originals/' + jid, { name: file.name, size: buf.byteLength, sha256: hash, enc: z.enc, data: z.data, at: Date.now() });
    return true;
  }
  var DL_OK = /\.(csv|json|txt|pdf|html|md|xlsx|zip)$/i;
  async function download(name, mime, content) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    if (!DL_OK.test(name)) name += '.txt';
    var dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); S.ui.exportMsg = null; }
      catch (e) { S.ui.exportMsg = e && e.code === 'declined' ? 'Descarga cancelada.' : 'No se pudo descargar en esta vista (' + ((e && e.code) || 'error') + ').'; render(); }
      return;
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function slug(s) { return String(s || 'jornada').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'jornada'; }
  async function downloadOriginal(ev, j) {
    var doc = await Store.get('events/' + ev.id + '/originals/' + jumpId(j));
    if (!doc) { S.ui.verify = { bad: true, msg: 'Este salto no tiene el archivo original guardado (se cargó antes de esta función o era demasiado grande).' }; render(); return; }
    var buf = await ungzip(doc), h = await sha256Hex(buf);
    if (h !== j.fileHash) { S.ui.verify = { bad: true, msg: 'El original guardado no coincide con la huella del salto. Avisá al organizador.' }; render(); return; }
    await download(doc.name, 'text/csv', new Blob([buf]));
  }
  async function verifyFile(ev, j, file) {
    var buf = await file.arrayBuffer(), h = await sha256Hex(buf);
    if (!j.fileHash) S.ui.verify = { bad: true, msg: 'Este salto se cargó antes de que la plataforma guardara huellas: no hay con qué comparar.' };
    else if (h === j.fileHash) S.ui.verify = { ok: true, msg: 'Coincide: ' + file.name + ' es idéntico, byte por byte, al archivo con el que se puntuó este salto.' };
    else S.ui.verify = { bad: true, msg: 'No coincide: ' + file.name + ' es distinto del archivo con el que se puntuó este salto (huella ' + h.slice(0, 12) + '…).' };
    render();
  }
  function csvCell(v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv(ev) {
    var r = scored(ev, S.jumps[ev.id] || []), rows = [], dec = function (x, d) { return x == null || x === '' ? '' : fmt(x, d); };
    rows.push(['Jornada', ev.name], ['Fecha', ev.date || ''], ['DZ', ev.dz || ''], ['Configuración', cfgLine(ev)], ['Perfil', judging(ev).label], ['Diferencias con FAI 2026', profileDiffs(ev).join('; ') || 'ninguna'], []);
    rows.push(['Puesto', 'Piloto'].concat(W.TASKS.map(function (t) { return TASK[t] + ' (pts)'; }), ['Total']));
    r.st.rows.forEach(function (row) { if (!row.jumps) return; rows.push([row.rank, pilotName(row.pilotId)].concat(W.TASKS.map(function (t) { return dec((row.tasks[t] || {}).points, 1); }), [dec(row.totalRounded, 1)])); });
    rows.push([]);
    rows.push(['Piloto', 'Tarea', 'Ronda', 'Resultado', 'Unidad', 'Tiempo (s)', 'Distancia (m)', 'Velocidad (km/h)', 'Salida (m AGL)', 'Penalidad (%)', 'Motivo', 'Puntos (%)', 'Estado', 'Revisado por', 'Tarea validada', 'Equipo', 'Archivo', 'SHA-256', 'Notas']);
    r.jumps.slice().sort(function (a, b) { return a.round - b.round || W.TASKS.indexOf(a.task) - W.TASKS.indexOf(b.task) || pilotName(a.pilotId).localeCompare(pilotName(b.pilotId)); }).forEach(function (j) {
      var v = (ev.validated || {})[slotKey(j)];
      rows.push([pilotName(j.pilotId), TASK[j.task], j.round, j.void ? 'anulado' : fmtTask(j.task, j._result), UNIT[j.task], dec(j.time, 2), dec(j.distance, 1), dec(j.speed, 1), j.exitAgl, j._pen || 0, j._penWhy || '', dec(j._points, 1), jumpStatus(ev, j).label,
        (j.reviews || []).map(function (x) { return x.name; }).join(', '), v ? 'sí, ' + (v.by || '') : 'no', j.device, j.fileName, j.fileHash || '', j.notes || '']);
    });
    download(slug(ev.name) + '-resultados.csv', 'text/csv;charset=utf-8', '﻿' + rows.map(function (rw) { return rw.map(csvCell).join(';'); }).join('\r\n'));
  }
  async function exportBackup(ev) {
    S.ui.exportMsg = 'Preparando la copia…'; render();
    try {
      var base = 'events/' + ev.id, jumps = S.jumps[ev.id] || [], tracks = {}, originals = {};
      for (var i = 0; i < jumps.length; i++) {
        var id = jumpId(jumps[i]);
        tracks[id] = await Store.get(base + '/tracks/' + id);
        originals[id] = await Store.get(base + '/originals/' + id);
      }
      var log = []; try { log = await Store.list(base + '/log'); } catch (e) {}
      var pids = {}; jumps.forEach(function (j) { pids[j.pilotId] = 1; });
      var out = { format: 'wingsuit-performance-backup', version: 1, exportedAt: new Date().toISOString(), exportedBy: judgeName() || null,
        event: Object.assign({}, ev), pilots: allPilots().filter(function (p) { return pids[p.id]; }), jumps: jumps, tracks: tracks, originals: originals, log: log };
      await download(slug(ev.name) + '-copia-completa.json', 'application/json', JSON.stringify(out));
      S.ui.exportMsg = null;
    } catch (e) { S.ui.exportMsg = 'No pude armar la copia (' + (e.code || e.message) + ').'; }
    render();
  }
  function tabActa(ev, jumps) {
    var r = scored(ev, jumps), J = judging(ev), diffs = profileDiffs(ev), v = ev.validated || {};
    var slots = {}; r.jumps.forEach(function (j) { slots[slotKey(j)] = 1; });
    var keys = Object.keys(slots), provis = keys.filter(function (k) { return !v[k]; });
    var h = '<div class="noprint card stack"><div class="row"><button class="btn primary" data-act="print">Imprimir o guardar como PDF</button><button class="btn" data-act="export-csv">Descargar planilla (CSV)</button><button class="btn" data-act="export-json">Descargar copia completa</button></div>' +
      '<p class="small muted">La planilla abre en Excel o Google Sheets. La copia completa incluye la jornada, los saltos, los tracks, los archivos originales y el historial.</p>' + (S.ui.exportMsg ? '<p class="note small">' + esc(S.ui.exportMsg) + '</p>' : '') + '</div>';
    h += '<div class="acta card stack"><div class="row spread"><div><h2>Acta de resultados · ' + esc(ev.name) + '</h2><p class="small">' + esc([ev.date, ev.dz].filter(Boolean).join(' · ')) + ' · ' + esc(cfgLine(ev)) + '</p></div>' +
      '<span class="pill ' + (provis.length ? 'warn' : 'good') + '">' + (provis.length ? 'Provisoria' : 'Oficial: todas las tareas validadas') + '</span></div>';
    h += '<p class="small"><b>Reglamento:</b> FAI ISC Wingsuit Flying 2026, Performance. <b>Perfil:</b> ' + esc(J.label) + '. ' + (diffs.length ? '<b>Diferencias:</b> ' + esc(diffs.join('; ')) + '.' : 'Sin diferencias con el reglamento FAI.') + '</p>';
    if (provis.length) h += '<p class="small"><b>Tareas sin validar:</b> ' + provis.map(function (k) { var p = k.split('|'); return TASK[p[0]] + ' ' + rl(p[1]); }).join(', ') + '.</p>';
    h += '<table class="acta-t"><thead><tr><th>#</th><th class="l">Piloto</th>' + W.TASKS.map(function (t) { return '<th>' + TASK[t] + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>' +
      r.st.rows.filter(function (row) { return row.jumps; }).map(function (row) { return '<tr><td>' + row.rank + '</td><td class="l">' + esc(pilotName(row.pilotId)) + '</td>' + W.TASKS.map(function (t) { return '<td>' + fmt((row.tasks[t] || {}).points || 0, 1) + '</td>'; }).join('') + '<td><b>' + fmt(row.totalRounded, 1) + '</b></td></tr>'; }).join('') + '</tbody></table>';
    var fem = reRank(r.st.rows.filter(function (row) { return row.jumps && pilotById(row.pilotId).gender === 'F'; }), function (row) { return row.totalRounded + '|' + row.tb; });
    if (fem.length) h += '<h3>Clasificación femenina' + (fem.length < 4 ? ' <span class="pill warn">menos de 4: sin medallas (5.1.2)</span>' : '') + '</h3><table class="acta-t"><tbody>' + fem.map(function (row) { return '<tr><td>' + row._rank + '</td><td class="l">' + esc(pilotName(row.pilotId)) + '</td><td><b>' + fmt(row.totalRounded, 1) + '</b></td></tr>'; }).join('') + '</tbody></table>';
    var tms = teamTable(ev, r.st).filter(function (t) { return t.state !== 'pick'; }); reRank(tms, function (t) { return t.totalRounded; });
    if (tms.length) h += '<h3>Clasificación por equipos' + (tms.length < 4 ? ' <span class="pill warn">menos de 4: sin medallas (5.1.2)</span>' : '') + '</h3><table class="acta-t"><tbody>' + tms.map(function (t) { return '<tr><td>' + t._rank + '</td><td class="l">' + esc(t.name) + ' <span class="muted">(' + t.members.map(function (m) { return esc(pilotName(m.pilotId)); }).join(', ') + ')</span></td><td><b>' + fmt(t.totalRounded, 1) + '</b></td></tr>'; }).join('') + '</tbody></table>';
    if (ev.tiebreak) h += '<p class="small"><b>Desempate (FAI 5.10.6):</b> tarea sorteada ' + TASK[ev.tiebreak.task].toLowerCase() + '. ' + (r.st.tiebreak || []).map(function (j) { return esc(pilotName(j.pilotId)) + ' ' + fmtTask(j.task, j._result) + ' ' + UNIT[j.task]; }).join(' · ') + '</p>';
    h += '<h3>Detalle por salto</h3><table class="acta-t small"><thead><tr><th class="l">Piloto</th><th class="l">Tarea</th><th>Resultado</th><th>Pen.</th><th>Pts</th><th class="l">Estado</th><th class="l">Huella del archivo</th></tr></thead><tbody>' +
      r.jumps.slice().sort(function (a, b) { return a.round - b.round || W.TASKS.indexOf(a.task) - W.TASKS.indexOf(b.task) || (b._points || 0) - (a._points || 0); }).map(function (j) {
        return '<tr><td class="l">' + esc(pilotName(j.pilotId)) + '</td><td class="l">' + TASK[j.task] + ' ' + rl(j.round) + '</td><td>' + (j.void ? 'anulado' : fmtTask(j.task, j._result) + ' ' + UNIT[j.task]) + '</td><td>' + (j._pen ? j._pen + '%' : '') + '</td><td>' + fmt(j._points || 0, 1) + '</td>' +
          '<td class="l">' + esc(jumpStatus(ev, j).label) + ((j.reviews || []).length ? ' (' + esc(j.reviews.map(function (x) { return x.name; }).join(', ')) + ')' : '') + (j._penWhy ? '<br><span class="muted">' + esc(j._penWhy) + '</span>' : '') + '</td><td class="l mono">' + (j.fileHash ? j.fileHash.slice(0, 16) + '…' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
    h += '<p class="small muted">La huella es el SHA-256 del archivo del GPS tal como se cargó. Cualquiera puede verificar que un archivo es el mismo comparando su huella en el detalle del salto. Generada el ' + new Date().toLocaleString('es-AR') + (judgeName() ? ' por ' + esc(judgeName()) : '') + '.</p>';
    h += '<div class="firmas"><div>Juez</div><div>Juez</div><div>Director del evento</div></div></div>';
    return h;
  }

  // ---------- clasificaciones, desempate y orden de salida ----------
  function rl(r) { return +r === 0 ? 'Desempate' : 'R' + r; }
  function rn(r) { return +r === 0 ? 'Salto de desempate' : 'Ronda ' + r; }
  function pilotById(id) { return allPilots().filter(function (p) { return p.id === id; })[0] || {}; }
  function reRank(rows, key) {
    rows.forEach(function (r, i) { var p = rows[i - 1]; r._rank = p && key(p) === key(r) ? p._rank : i + 1; });
    return rows;
  }
  function teamSize(ev) { return ev.teamSize || 3; }
  function teamTable(ev, st) {
    var teams = {}, pick = ev.teamPick || {}, size = teamSize(ev);
    st.rows.forEach(function (row) { if (!row.jumps) return; var t = (pilotById(row.pilotId).team || '').trim(); if (t) (teams[t] = teams[t] || []).push(row); });
    return Object.keys(teams).map(function (name) {
      var all = teams[name], chosen = all, state = 'ok';
      if (all.length > size) {
        var ids = (pick[name] || []).filter(function (id) { return all.some(function (r) { return r.pilotId === id; }); });
        if (ids.length === size) chosen = all.filter(function (r) { return ids.indexOf(r.pilotId) >= 0; }); else { chosen = []; state = 'pick'; }
      } else if (all.length < size) state = 'short';
      var total = chosen.reduce(function (s, r) { return s + r.total; }, 0);
      return { name: name, all: all, members: chosen, state: state, total: total, totalRounded: W.roundHalfUp ? W.roundHalfUp(total, 1) : Math.round(total * 10) / 10 };
    }).sort(function (a, b) { return (a.state === 'pick') - (b.state === 'pick') || b.totalRounded - a.totalRounded; });
  }
  function minNote(n, what) {
    return n < 4 ? '<p class="note warn small">' + what + ' tiene ' + n + ' participante' + (n === 1 ? '' : 's') + '. Con menos de cuatro, la clasificación no es válida para entregar medallas (FAI 5.1.2).</p>' : '';
  }
  function classView(ev, st, view) {
    var h = '<div class="card scroll-x">';
    if (view === 'female') {
      var rows = reRank(st.rows.filter(function (r) { return r.jumps && pilotById(r.pilotId).gender === 'F'; }), function (r) { return r.totalRounded + '|' + r.tb; });
      h += '<table><thead><tr><th>#</th><th class="l">Piloto</th>' + W.TASKS.map(function (t) { return '<th>' + TASK[t] + '</th>'; }).join('') + '<th>Total</th><th class="l">General</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td class="rank">' + r._rank + '</td><td class="l"><b>' + esc(pilotName(r.pilotId)) + '</b></td>' + W.TASKS.map(function (t) { return '<td>' + fmt((r.tasks[t] || {}).points || 0, 1) + '</td>'; }).join('') + '<td class="total">' + fmt(r.totalRounded, 1) + '</td><td class="l muted">' + r.rank + '.º</td></tr>'; }).join('') + '</tbody></table></div>';
      if (!rows.length) return '<p class="card muted">No hay pilotos marcados en la categoría femenina. Se marca en <a href="#pilotos">Pilotos</a>.</p>';
      return h + minNote(rows.length, 'La clasificación femenina') + '<p class="small muted">Mismos puntajes que la general, ordenados solo entre las pilotos de la categoría (FAI 5.1.1, 5.1.4 y 5.10.9).</p>';
    }
    if (view === 'team') {
      var tt = teamTable(ev, st), size = teamSize(ev), ok = tt.filter(function (t) { return t.state !== 'pick'; });
      reRank(ok, function (t) { return t.totalRounded; });
      if (!tt.length) return '<p class="card muted">No hay equipos. El equipo de cada piloto se carga en <a href="#pilotos">Pilotos</a>.</p>';
      h += '<table><thead><tr><th>#</th><th class="l">Equipo</th><th class="l">Integrantes</th><th>Total</th></tr></thead><tbody>' + tt.map(function (t) {
        var mem = (t.state === 'pick' ? t.all : t.members).map(function (r) { return esc(pilotName(r.pilotId)) + ' <span class="muted">' + fmt(r.totalRounded, 1) + '</span>'; }).join(' · ');
        return '<tr><td class="rank">' + (t.state === 'pick' ? '' : t._rank) + '</td><td class="l"><b>' + esc(t.name) + '</b>' + (t.state === 'short' ? ' <span class="pill warn">' + t.members.length + ' de ' + size + '</span>' : '') + '</td><td class="l small">' + mem + '</td><td class="total">' + (t.state === 'pick' ? '<span class="pill warn">Falta nominar</span>' : fmt(t.totalRounded, 1)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      tt.filter(function (t) { return t.state === 'pick'; }).forEach(function (t) {
        var cur = (ev.teamPick || {})[t.name] || [];
        h += '<div class="card stack"><h3>Nominar ' + size + ' integrantes de ' + esc(t.name) + '</h3><p class="small muted">El equipo tiene ' + t.all.length + ' pilotos en la jornada. El reglamento pide nominar ' + size + ' (FAI 8.4.2).</p><div class="row">' +
          t.all.map(function (r) { return '<label class="chk"><input type="checkbox" data-change="team-pick" data-team="' + esc(t.name) + '" data-id="' + esc(r.pilotId) + '"' + (cur.indexOf(r.pilotId) >= 0 ? ' checked' : '') + ((S.canWrite || ev.demo) ? '' : ' disabled') + '> ' + esc(pilotName(r.pilotId)) + '</label>'; }).join('') + '</div></div>';
      });
      return h + minNote(ok.length, 'La clasificación por equipos') + '<p class="small muted">Puntaje del equipo: suma del total de cada integrante (FAI 5.10.10). Integrantes por equipo: ' + size + ' (FAI 8.4; se cambia en Ajustes).</p>';
    }
    // por tarea
    var t = view, rows2 = reRank(st.rows.filter(function (r) { return r.tasks[t]; }).slice().sort(function (a, b) { return b.tasks[t].points - a.tasks[t].points; }), function (r) { return fmt(r.tasks[t].points, 1); });
    var rounds = st.rounds[t];
    h += '<table><thead><tr><th>#</th><th class="l">Piloto</th>' + rounds.map(function (n) { return '<th>R' + n + '</th>'; }).join('') + '<th>Puntos</th></tr></thead><tbody>' +
      rows2.map(function (r) { return '<tr><td class="rank">' + r._rank + '</td><td class="l"><b>' + esc(pilotName(r.pilotId)) + '</b></td>' + rounds.map(function (n) { var j = r.tasks[t].cells[n]; return '<td>' + (j ? fmtTask(t, j._result) + ' <span class="muted small">' + fmt(j._points, 1) + '%</span>' : '<span class="muted">·</span>') + '</td>'; }).join('') + '<td class="total">' + fmt(r.tasks[t].points, 1) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return h + '<p class="small muted">Clasificación de la tarea ' + TASK[t].toLowerCase() + ': promedio de sus rondas (FAI 5.10.3, medallas por tarea en 8.5.1).</p>';
  }
  function topTies(st) {
    var groups = {};
    st.rows.forEach(function (r) { if (r.jumps && r.rank <= 3) (groups[r.rank] = groups[r.rank] || []).push(r); });
    return Object.keys(groups).filter(function (k) { return groups[k].length > 1; }).map(function (k) { return { rank: +k, rows: groups[k] }; });
  }
  function tieBlock(ev, st) {
    var ties = topTies(st), tb = ev.tiebreak, canEdit = S.canWrite || ev.demo, h = '';
    if (!ties.length && !tb) return '';
    h += '<div class="card stack"><h3>Desempate</h3>';
    ties.forEach(function (g) { h += '<p>Empate en el puesto ' + g.rank + ' entre ' + g.rows.map(function (r) { return '<b>' + esc(pilotName(r.pilotId)) + '</b>'; }).join(' y ') + ' (' + fmt(g.rows[0].totalRounded, 1) + ' puntos).</p>'; });
    if (tb) {
      h += '<p>Tarea de desempate sorteada: <b>' + TASK[tb.task] + '</b>' + (tb.by ? ' (sorteó ' + esc(tb.by) + ', ' + new Date(tb.at).toLocaleString('es-AR') + ')' : '') + '. Cargá cada salto de desempate en <b>Cargar salto</b> marcando "Salto de desempate".</p>';
      var tbj = (st.tiebreak || []).filter(function (j) { return j.task === tb.task; });
      if (tbj.length) h += '<p class="small">' + tbj.map(function (j) { return esc(pilotName(j.pilotId)) + ': ' + fmtTask(j.task, j._result) + ' ' + UNIT[j.task]; }).join(' · ') + '</p>';
      if (ties.length && tbj.length) h += '<p class="small muted">Si el empate sigue después del salto de desempate, los pilotos comparten el puesto (FAI 5.10.6.2).</p>';
      if (canEdit) h += '<div class="row"><button class="btn sm" data-act="tb-clear">Quitar el desempate</button></div>';
    } else if (canEdit) h += '<p class="small muted">FAI 5.10.6: un empate en los tres primeros puestos se define con un salto de desempate. La tarea la sortea el Juez Principal.</p><div class="row"><button class="btn primary" data-act="tb-draw">Sortear la tarea de desempate</button></div>';
    return h + '</div>';
  }
  function rnd(n) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var k = rnd(i + 1), t = a[i]; a[i] = a[k]; a[k] = t; } return a; }
  function rotate(arr, k) { if (!arr.length) return arr; k = ((k % arr.length) + arr.length) % arr.length; return arr.slice(k).concat(arr.slice(0, k)); }
  function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
  function roster(ev) {
    if (ev.roster && ev.roster.length) return ev.roster.filter(function (id) { return allPilots().some(function (p) { return p.id === id; }); });
    var ids = []; (S.jumps[ev.id] || []).forEach(function (j) { if (ids.indexOf(j.pilotId) < 0) ids.push(j.pilotId); });
    return ids;
  }
  function otherEvents(ev) { return (S.events || []).filter(function (e) { return e.id !== ev.id && !e.demo; }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }); }
  async function reverseOrderFrom(ev, sourceId, ids) {
    var src = [];
    if (sourceId === 'self') src = scored(ev, S.jumps[ev.id] || []).st.rows.filter(function (r) { return r.jumps; });
    else if (sourceId) {
      var js = S.jumps[sourceId]; if (!js) { js = await Store.list('events/' + sourceId + '/jumps'); }
      src = W.standings(js.map(function (j) { return Object.assign({}, j); }), null, { tiebreak: (getEvent(sourceId) || {}).tiebreak }).rows.filter(function (r) { return r.jumps; });
    }
    var ranked = src.map(function (r) { return r.pilotId; }).filter(function (id) { return ids.indexOf(id) >= 0; }).reverse();
    var unranked = shuffle(ids.filter(function (id) { return ranked.indexOf(id) < 0; }));
    return { order: unranked.concat(ranked), unranked: unranked.length };
  }
  function taskOrder(ev) { return ev.taskOrder && ev.taskOrder.length === 3 ? ev.taskOrder : W.TASKS.slice(); }
  function passPlan(ev, round) {
    var o = (ev.order || {})[round]; if (!o) return null;
    var size = ev.passSize || 5, passes = chunk(o.ids, size);
    return taskOrder(ev).map(function (t, k) { return { task: t, passes: rotate(passes, k).map(function (p) { return rotate(p, k); }) }; }); // 5.5.6
  }
  function tabOrder(ev) {
    var canEdit = S.canWrite || ev.demo, ids = roster(ev), nR = ev.mode === 'comp' ? (ev.rounds || 3) : Math.max(1, (S.ui.ordRounds || 3)), h = '';
    h += '<div class="card stack noprint"><h2>Participantes</h2><p class="small muted">Elegí quiénes vuelan en la jornada. Si no elegís, se toman los que ya tienen saltos.</p><div class="row">' +
      allPilots().filter(function (p) { return ev.demo || !p.demo; }).map(function (p) { return '<label class="chk"><input type="checkbox" data-change="roster" data-id="' + esc(p.id) + '"' + (ids.indexOf(p.id) >= 0 ? ' checked' : '') + (canEdit ? '' : ' disabled') + '> ' + esc(p.name) + '</label>'; }).join('') + '</div>' +
      '<div class="form"><label class="f">Pilotos por pasada<input id="ord-pass" inputmode="numeric" value="' + (ev.passSize || 5) + '" data-change="ord-pass"' + (canEdit ? '' : ' disabled') + '></label></div></div>';
    var to = taskOrder(ev);
    h += '<div class="card stack"><div class="row spread"><h2>Orden de las tareas</h2>' + (canEdit ? '<button class="btn sm noprint" data-act="draw-tasks">' + (ev.taskOrder ? 'Volver a sortear' : 'Sortear') + '</button>' : '') + '</div>' +
      '<p>' + to.map(function (t, i) { return (i + 1) + '. ' + TASK[t]; }).join(' · ') + (ev.taskOrder ? ' <span class="small muted">(sorteado' + (ev.taskOrderBy ? ' por ' + esc(ev.taskOrderBy) : '') + ')</span>' : ' <span class="pill warn">Sin sortear</span>') + '</p>' +
      '<p class="small muted">FAI 5.4.8: el orden de las tareas lo sortea el Juez Principal en la reunión de competidores.</p></div>';
    var others = otherEvents(ev), src = S.ui.ordSrc || (others[0] ? others[0].id : '');
    for (var r = 1; r <= nR; r++) {
      var o = (ev.order || {})[r], plan = passPlan(ev, r);
      h += '<div class="card stack order-round"><div class="row spread"><h2>Ronda ' + r + '</h2>';
      if (canEdit) {
        h += '<div class="row noprint">';
        if (r === 1) h += '<select id="ord-src" data-change="ord-src"><option value="">Sorteo</option>' + others.map(function (e) { return '<option value="' + esc(e.id) + '"' + (src === e.id ? ' selected' : '') + '>Inverso de ' + esc(e.name) + (e.date ? ' (' + esc(e.date) + ')' : '') + '</option>'; }).join('') + '</select>';
        h += '<button class="btn sm' + (o ? '' : ' primary') + '" data-act="ord-make" data-round="' + r + '">' + (o ? 'Rehacer' : 'Armar orden') + '</button>' + (o ? '<button class="btn sm" data-act="ord-clear" data-round="' + r + '">Borrar</button>' : '') + '</div>';
      }
      h += '</div>';
      h += '<p class="small muted">' + (r === 1 ? 'FAI 5.5.2: orden inverso a la clasificación de la última competencia; los que no participaron saltan primero, en orden sorteado.' : 'FAI 5.5.3: orden inverso a la clasificación de esta jornada después de la ronda ' + (r - 1) + (r > 2 ? ' (recalcularlo después de la ronda 2 es opcional)' : '') + '.') + '</p>';
      if (o) {
        h += '<p class="small">' + esc(o.how) + (o.by ? ' · ' + esc(o.by) : '') + ' · ' + new Date(o.at).toLocaleString('es-AR') + '</p><div class="plan">';
        plan.forEach(function (tk, k) {
          h += '<div class="plan-task"><h3>' + (k + 1) + '. ' + TASK[tk.task] + '</h3>' + tk.passes.map(function (p, i) { return '<div class="pass"><b>Pasada ' + (i + 1) + '</b><ol>' + p.map(function (id) { return '<li>' + esc(pilotName(id)) + '</li>'; }).join('') + '</ol></div>'; }).join('') + '</div>';
        });
        h += '</div><p class="small muted">Entre tareas rotan las pasadas y el orden dentro de cada pasada (FAI 5.5.6).</p>';
      }
      h += '</div>';
    }
    if (ev.mode !== 'comp') h += '<div class="row noprint"><button class="btn sm" data-act="ord-more">Agregar una ronda</button></div>';
    h += '<div class="row noprint"><button class="btn" data-act="print">Imprimir el orden de salida</button></div>';
    return h;
  }
  async function makeOrder(ev, r) {
    var ids = roster(ev);
    if (!ids.length) { alertNote('Elegí los participantes primero.'); return; }
    var res, how;
    if (r === 1) {
      var src = $('#ord-src') ? $('#ord-src').value : '';
      if (src) { res = await reverseOrderFrom(ev, src, ids); how = 'Inverso de la clasificación de ' + ((getEvent(src) || {}).name || 'otra jornada') + (res.unranked ? '; ' + res.unranked + ' sin resultado previo, sorteados al principio' : ''); }
      else { res = { order: shuffle(ids) }; how = 'Sorteo'; }
    } else { res = await reverseOrderFrom(ev, 'self', ids); how = 'Inverso de la clasificación de esta jornada' + (res.unranked ? '; ' + res.unranked + ' sin resultado, sorteados al principio' : ''); }
    var o = Object.assign({}, ev.order || {}); o[r] = { ids: res.order, how: how, at: Date.now(), by: judgeName() || null };
    await saveEventPatch(ev, { order: o });
    await logAction(ev, 'Orden de salida de la ronda ' + r + ': ' + how);
    if (ev.demo) render();
  }
  function alertNote(msg) { S.ui.ordMsg = msg; render(); }

  function keepUpload() { var n = $('#up-newname'); if (n) S.ui.up.newName = n.value; }
  async function deleteEvent(ev) {
    try {
      var jumps = await Store.list('events/' + ev.id + '/jumps');
      for (var i = 0; i < jumps.length; i++) { await Store.del('events/' + ev.id + '/tracks/' + jumps[i].id); await Store.del('events/' + ev.id + '/originals/' + jumps[i].id).catch(function () {}); await Store.del('events/' + ev.id + '/jumps/' + jumps[i].id); await sleep(100); }
      await Store.del('events/' + ev.id); S.allLoaded = false;
    } catch (e) { console.warn(e); }
    location.hash = '#jornadas';
  }
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]'); if (!el) return;
    var c = el.getAttribute('data-change'), ev = getEvent(S.route.eventId);
    if (c === 'verify-file') { var jv = curJump(ev); if (jv && el.files[0]) verifyFile(ev, jv, el.files[0]).catch(function (x) { console.warn(x); }); return; }
    if (c === 'up-tb') { keepUpload(); if (el.checked) { S.ui.up.round = 0; S.ui.up.task = ev.tiebreak.task; } else S.ui.up.round = 1; render(); return; }
    if (c === 'team-pick') {
      var tm = el.getAttribute('data-team'), tp = Object.assign({}, ev.teamPick || {}), lst = (tp[tm] || []).slice(), pid3 = el.getAttribute('data-id');
      if (el.checked) { if (lst.indexOf(pid3) < 0) lst.push(pid3); } else lst = lst.filter(function (x) { return x !== pid3; });
      tp[tm] = lst; saveEventPatch(ev, { teamPick: tp }).then(function () { if (ev.demo) render(); }); return;
    }
    if (c === 'roster') {
      var rs = roster(ev).slice(), pid4 = el.getAttribute('data-id');
      if (el.checked) { if (rs.indexOf(pid4) < 0) rs.push(pid4); } else rs = rs.filter(function (x) { return x !== pid4; });
      saveEventPatch(ev, { roster: rs }).then(function () { if (ev.demo) render(); }); return;
    }
    if (c === 'ord-pass') { saveEventPatch(ev, { passSize: Math.max(1, Math.min(30, Math.round(num(el.value, 5)))) }).then(function () { if (ev.demo) render(); }); return; }
    if (c === 'ord-src') { S.ui.ordSrc = el.value; return; }
    if (c === 'up-pilot') { S.ui.up.pilotId = el.value; render(); }
    else if (c === 'up-round') { keepUpload(); S.ui.up.round = Math.max(1, Math.round(num(el.value, 1))); render(); }
    else if (c === 'up-ref') { S.ui.up.refIdx = +el.value; }
    else if (c === 'pen-old') { var j = (S.jumps[ev.id] || []).filter(function (x) { return jumpId(x) === S.ui.jumpId; })[0]; if (j) { S.allLoaded = false; Store.set('events/' + ev.id + '/jumps/' + jumpId(j), Object.assign({}, j, { penManual: el.value === '' ? null : +el.value })).catch(function (x) { console.warn(x); }); } }
    else if (c === 'rp-slot') { S.ui.rp.slot = el.value; S.ui.rp.off = {}; window.Replay.stop(); render(); }
    else if (c === 'rp-pilot') { S.ui.rp.off[el.getAttribute('data-id')] = !el.checked; window.Replay.stop(); render(); }
    else if (c === 'rp-sync') { S.ui.rp.sync = el.value; window.Replay.stop(); render(); }
    else if (c === 'rp-plan') { S.ui.rp.plan = el.value; window.Replay.stop(); render(); }
    else if (c === 'ef-prof') {
      var P = PROFILES[el.value]; if (!P) return;
      $('#ef-reviews').value = String(P.reviews); $('#ef-door').value = P.door; $('#ef-gps').value = P.gpsRule; $('#ef-exit').value = P.exitRule;
    }
    else if (c === 'ef-jud') { $('#ef-prof').value = 'custom'; }
    else if (c === 'ef-units') {
      var toFt = el.value === 'ft';
      document.querySelectorAll('[data-form="event"] input[data-alt]').forEach(function (inp) {
        var v = num(inp.value, NaN); if (!isFinite(v)) return;
        inp.value = toFt ? m2ft(v) : toM(v, true);
      });
      document.querySelectorAll('[data-form="event"] .u').forEach(function (sp) { sp.textContent = toFt ? 'ft' : 'm'; });
    }
    else if (c === 'rp-cam') { S.ui.rp.cam = el.value; if (window.Replay3D) window.Replay3D.setMode(el.value); }
    else if (c === 'only-std') { S.ui.onlyStd = el.checked; render(); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    var kind = f.getAttribute('data-form'), ev = getEvent(S.route.eventId);
    if (kind === 'event') {
      var base = S.route.view === 'evento' ? ev : (S.ui.eventForm || {});
      try {
        var doc = readEventForm(base), id = base.id || ('e' + newId());
        S.ui.formError = null;
        Store.set('events/' + id, doc).then(function () {
          S.ui.eventForm = null; S.ui.editing = false;
          if (!base.id) location.hash = '#jornada-' + id; else { S.ui.recalcMsg = 'Ajustes guardados. Recalculá si cambiaste elevación, ventana o carril.'; render(); }
        }).catch(function (x) { S.ui.formError = 'No pude guardar (' + (x.code || x.message) + ').'; render(); });
      } catch (err) { S.ui.formError = err.message; render(); }
    } else if (kind === 'upload') { keepUpload(); doUpload(ev); }
    else if (kind === 'pilot') {
      var name = $('#pf-name').value.trim(); if (!name) return;
      Store.set('pilots/p' + newId(), { name: name, suit: $('#pf-suit').value.trim(), gender: $('#pf-gender').value, team: $('#pf-team').value.trim(), createdAt: Date.now() }).catch(function (x) { console.warn(x); });
    }
  });

  window.WSApp = { S: S, fmt: fmt, TASK: TASK, UNIT: UNIT, render: render };
  boot();
})();
