const fs = require('fs'), path = require('path');
const W = require('./engine.js');
const fx = process.argv[2];
const demo = [
  ['Piloto A', 'fs2-track.csv'], ['Piloto B', 'cyber_eye.csv'], ['Piloto C', 'distance_3107.csv'],
  ['Piloto D', 'flysight2_2762_noisy_climb.csv'], ['Piloto E', '13-31-51_Ravenna.CSV']
].map(([name, f]) => {
  const tr = W.parseTrack(fs.readFileSync(path.join(fx, f), 'utf8'), f);
  let ground = f.includes('Ravenna') ? 0 : Infinity;
  if (ground) tr.pts.forEach(p => { if (p.alt < ground) ground = p.alt; });
  tr.pts.forEach(p => { p.alt -= ground; });
  const sc = W.scoreJump(tr.pts, { elev: 0 });
  if (!sc.ok) throw new Error(f + ': ' + sc.error);
  // 5 Hz alcanza para el ejemplo
  let pts = W.trimTrack(tr.pts, sc), out = [], last = -1;
  pts.forEach(p => { if (p.t - last >= 0.19) { out.push(p); last = p.t; } });
  return { name, device: tr.device, file: 'track de prueba', track: W.packTrack(out) };
});
const here = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
let html = here('index.template.html');
const rep = (k, v) => { html = html.split('/*__' + k + '__*/').join(v); };
rep('CSS', here('styles.css'));
rep('DEMO', JSON.stringify(demo).replace(/</g, '\\u003c'));
rep('ENGINE', here('engine.js'));
rep('REPLAY', here('replay.js'));
rep('REPLAY3D', here('replay3d.js'));
rep('REVIEW', here('review.js'));
rep('APP', here('app.js'));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), html);
console.log('ok', html.length, 'bytes');
