const fs = require('fs');
const W = require('./engine.js');
const dir = process.argv[2];
function load(f) { return W.parseTrack(fs.readFileSync(dir + '/' + f, 'utf8'), f); }
function show(name, f, cfg, expect) {
  const tr = load(f);
  const s = W.scoreJump(tr.pts, cfg);
  if (!s.ok) { console.log(name, 'ERROR', s.error); return; }
  // re-puntuar desde el track compacto: debe dar lo mismo
  const packed = W.packTrack(W.trimTrack(tr.pts, s));
  const s2 = W.scoreJump(W.unpackTrack(packed), cfg);
  console.log(name, tr.device, 'pts', tr.pts.length,
    '\n  tiempo', s.time.toFixed(2), 'dist', s.distance.toFixed(1), 'vel', s.speed.toFixed(1),
    '| compacto:', s2.time.toFixed(2), s2.distance.toFixed(1), s2.speed.toFixed(1),
    '\n  esperado (Skyderby):', expect || '-',
    '\n  salida AGL', Math.round(s.exitAgl), 'hz', s.hz, 'sepMax', s.sepMax, 'deploy+', s.tDeploy ? (s.tDeploy - s.tBot).toFixed(1) : null,
    'bytes', JSON.stringify(packed).length, 'flags', s.flags.map(f => f.code).join(','));
}
show('Ravenna 3000-2000 msl0', '13-31-51_Ravenna.CSV', { elev: 0, top: 3000, bottom: 2000 }, 'tiempo 92.16, dist 3410.8, vel 133.2');
// Csaba: sin lugar => Skyderby usa la altura mínima registrada como suelo
const cs = load('2014-Csaba-Round-1.CSV');
let mn = Infinity; cs.pts.forEach(p => { if ((p.sep == null || p.sep * 1 < 1e9) && p.alt < mn) mn = p.alt; });
console.log('Csaba min alt', mn);
show('Csaba 3000-2000', '2014-Csaba-Round-1.CSV', { elev: mn, top: 3000, bottom: 2000 }, 'tiempo 38.5, dist 2110, vel 197.4');
['flysight.csv', 'fs2-track.csv', 'distance_2645.csv', 'distance_2454.csv', 'distance_3107.csv', 'cyber_eye.csv', 'flysight2_2762_noisy_climb.csv', 'one_track.gpx'].forEach(f => {
  try {
    const tr = load(f); let m = Infinity; tr.pts.forEach(p => { if (p.alt < m) m = p.alt; });
    show(f + ' (suelo=min ' + Math.round(m) + ')', f, { elev: m });
  } catch (e) { console.log(f, 'EXC', e.message); }
});
// redondeo y clasificación
console.log('round', W.roundHalfUp(23.5, 0), W.roundHalfUp(1.005, 2), W.roundHalfUp(92.15, 1));
const J = (p, task, round, v, extra) => Object.assign({ pilotId: p, task, round, ok: true, time: 0, distance: 0, speed: 0, [task]: v, tExit: round * 10 + ['time', 'distance', 'speed'].indexOf(task) }, extra || {});
const st = W.standings([
  J('a', 'time', 1, 80), J('b', 'time', 1, 60), J('a', 'distance', 1, 4000), J('b', 'distance', 1, 4400.4),
  J('a', 'speed', 1, 250, { lanePen: 50, laneOutside: 320 }), J('b', 'speed', 1, 200),
  J('a', 'time', 2, 70, { lanePen: 50, laneOutside: 400 }), J('b', 'time', 2, 70)
], ['a', 'b', 'c']);
st.rows.forEach(r => console.log(r.rank, r.pilotId, r.totalRounded, JSON.stringify(Object.fromEntries(Object.entries(r.tasks).map(([k, v]) => [k, +v.points.toFixed(2)])))));
