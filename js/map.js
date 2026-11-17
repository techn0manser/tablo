// Схема дороги «вид сверху»: машины едут сверху вниз к переходу.
import { roadWidth } from './logic.js';
import { camU } from './tracker.js';

const COLORS = { clear: '#3dff7a', info: '#3dff7a', warn: '#ffc21a', danger: '#ff3b30' };

export function drawMap(canvas, objects, result, cfg, { range, showCamera }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (!cw || !ch) return;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);

  const w = roadWidth(cfg);
  const sMin = -12;
  const roadPx = Math.min(cw * 0.36, 150);
  const x0 = Math.min(64, (cw - roadPx) / 2); // дорога слева — справа место для подписей
  const X = (u) => x0 + (u / w) * roadPx;
  const Y = (s) => ch - 8 - ((s - sMin) / (range - sMin)) * (ch - 16);

  // обочины и полотно
  g.fillStyle = '#10161b';
  g.fillRect(0, 0, cw, ch);
  g.fillStyle = '#2a3138';
  g.fillRect(x0, 0, roadPx, ch);
  g.strokeStyle = '#e8e8e8';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, 0); g.lineTo(x0, ch);
  g.moveTo(x0 + roadPx, 0); g.lineTo(x0 + roadPx, ch);
  g.stroke();
  g.setLineDash([10, 10]);
  g.lineWidth = 1.5;
  for (let i = 1; i < cfg.lanes; i++) {
    g.beginPath(); g.moveTo(X(i * cfg.laneWidth), 0); g.lineTo(X(i * cfg.laneWidth), ch); g.stroke();
  }
  g.setLineDash([]);

  // зебра
  const zy = Y(0);
  g.fillStyle = '#f2f2f2';
  const stripes = cfg.lanes * 4;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) g.fillRect(x0 + (i / stripes) * roadPx, zy - 6, roadPx / stripes, 12);
  }

  g.font = '11px system-ui, sans-serif';
  g.textBaseline = 'middle';

  // метки расстояния
  g.fillStyle = '#6b7780';
  g.textAlign = 'right';
  const step = range > 100 ? 50 : range > 40 ? 20 : 10;
  for (let s = step; s < range; s += step) {
    g.fillRect(x0 - 8, Y(s), 6, 1);
    g.fillText(`${s} м`, x0 - 12, Y(s));
  }

  // табло водителя и камера
  g.textAlign = 'left';
  if (cfg.boardDistance <= range) {
    g.fillStyle = '#ffc21a';
    g.fillRect(x0 + roadPx + 4, Y(cfg.boardDistance) - 5, 16, 9);
    g.fillText('табло водителя', x0 + roadPx + 26, Y(cfg.boardDistance));
  }
  if (showCamera) {
    const cx = X(camU(cfg));
    const cy = Y(-cfg.camToCross);
    g.fillStyle = '#5ac8fa';
    g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx - 7, cy + 5); g.lineTo(cx + 7, cy + 5); g.fill();
    g.textAlign = cfg.camSide === 'right' ? 'right' : 'left';
    g.fillText('камера', cx + (cfg.camSide === 'right' ? -10 : 10), cy);
  }

  // прогноз траектории машины, от которой считается опасность
  const threat = result.ped.vehicle;
  if (threat) {
    g.strokeStyle = COLORS[result.ped.level];
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.beginPath();
    g.moveTo(X(threat.u), Y(threat.distance));
    g.lineTo(X(Math.max(0, Math.min(w, threat.uAtCross))), zy);
    g.stroke();
    g.setLineDash([]);
  }

  let lastLabelY = -Infinity;
  for (const o of [...objects].sort((a, b) => b.s - a.s)) {
    if (o.s > range || o.s < sMin) continue;
    const x = Math.max(8, Math.min(cw - 8, X(o.u)));
    const y = Y(o.s);
    if (o.kind === 'vehicle') {
      const isThreat = threat && threat.id === o.id;
      const moto = o.cls === 'motorcyclist' || o.cls === 'motorcycle' || o.cls === 'cyclist' || o.cls === 'bicycle';
      g.fillStyle = o.colorCss || '#9fb2c0';
      g.beginPath();
      if (moto) g.roundRect(x - 3.5, y - 10, 7, 20, 3);
      else g.roundRect(x - 7, y - 12, 14, 24, 4);
      g.fill();
      g.lineWidth = isThreat ? 3 : 1;
      g.strokeStyle = isThreat ? COLORS[result.ped.level] : '#000';
      g.stroke();
      const flags = [o.ranRed && 'красный свет', o.weaving && 'виляет',
        o.vs * 3.6 > cfg.speedLimit + 5 && 'превышение'].filter(Boolean);
      g.fillStyle = flags.length ? '#ff6b61' : '#e6edf2';
      g.textAlign = 'left';
      // в плотном потоке подписываем не каждую машину, чтобы подписи не слипались
      if (y - lastLabelY < 13 && !flags.length && !isThreat) continue;
      lastLabelY = y;
      g.fillText(`${Math.round(o.vs * 3.6)} км/ч${flags.length ? ' · ' + flags.join(', ') : ''}`, x0 + roadPx + 10, y);
    } else {
      g.fillStyle = o.kind === 'person' ? '#ffffff' : '#ff9f0a';
      g.beginPath(); g.arc(x, y, o.large ? 8 : 5.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
    }
  }
}

// Рамки поверх видео с камеры
export function drawOverlay(canvas, video, objects) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw) return;
  if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, vw, vh);
  const k = Math.max(vw, vh) / 640;
  g.lineWidth = 2.5 * k;
  g.font = `600 ${15 * k}px system-ui, sans-serif`;
  g.textBaseline = 'bottom';
  for (const o of objects) {
    if (!o.bbox) continue;
    const [x, y, w, h] = o.bbox;
    const color = o.kind === 'vehicle' ? '#ffc21a' : o.kind === 'person' ? '#3dff7a' : '#ff9f0a';
    g.strokeStyle = color;
    g.strokeRect(x, y, w, h);
    const dist = Math.max(0, o.s).toFixed(o.s < 20 ? 1 : 0);
    const text = o.kind === 'vehicle'
      ? `${o.color ? o.color + ' ' : ''}${o.label} ${dist} м · ${Math.round(Math.max(0, o.vs) * 3.6)} км/ч${o.weaving ? ' · виляет' : ''}`
      : `${o.label} ${dist} м`;
    const tw = g.measureText(text).width + 8 * k;
    g.fillStyle = color;
    g.fillRect(x, Math.max(0, y - 20 * k), tw, 20 * k);
    g.fillStyle = '#000';
    g.fillText(text, x + 4 * k, Math.max(20 * k, y));
  }
}
