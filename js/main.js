import { DEFAULTS, loadSettings, saveSettings } from './settings.js';
import { assess } from './logic.js';
import { Simulator, SPAWN_S } from './sim.js';
import { Tracker, CLASSES } from './tracker.js';
import { Detector } from './detector.js';
import { Beeper } from './audio.js';
import { renderPedBoard, renderDrvBoard } from './boards.js';
import { drawMap, drawOverlay } from './map.js';

const el = (id) => document.getElementById(id);
const video = el('video');

let cfg = loadSettings();
let mode = 'sim';
let objects = [];       // текущие объекты на дороге (из симулятора или с камеры)
let result = assess([], cfg);
let rawDets = [];       // последние «сырые» рамки детектора — для калибровки

const sim = new Simulator();
const tracker = new Tracker();
const detector = new Detector(video);
const beeper = new Beeper();
const status = (text) => { el('status').textContent = text; };

// ---------- главный цикл ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'sim') objects = sim.step(dt, cfg, result.ped.level);
  result = assess(objects, cfg);

  renderPedBoard(el('pedBoard'), result.ped);
  renderDrvBoard(el('drvBoard'), result.drv, cfg);
  if (!el('debug').classList.contains('off')) {
    drawMap(el('map'), objects, result, cfg, {
      range: mode === 'sim' ? SPAWN_S : 60,
      showCamera: mode === 'camera',
    });
  }

  const { level, critical } = result.ped;
  const snd = critical ? 'critical' : level === 'danger' ? 'danger' : level === 'warn' ? 'warn' : 'off';
  beeper.setLevel(cfg.sound ? snd : 'off');
  requestAnimationFrame(frame);
}

// ---------- режим камеры ----------
// Цвет машины: усредняем пиксели капота (середина рамки, чуть ниже лобового стекла)
const probe = document.createElement('canvas');
probe.width = probe.height = 8;
const probeCtx = probe.getContext('2d', { willReadFrequently: true });
function sampleColor([x, y, w, h]) {
  try {
    probeCtx.drawImage(video, x + w * 0.25, y + h * 0.4, w * 0.5, h * 0.22, 0, 0, 8, 8);
    const d = probeCtx.getImageData(0, 0, 8, 8).data;
    const rgb = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { rgb[0] += d[i]; rgb[1] += d[i + 1]; rgb[2] += d[i + 2]; }
    return rgb.map((v) => v / 64);
  } catch {
    return null;
  }
}

async function cameraLoop() {
  while (mode === 'camera' && detector.running) {
    try {
      rawDets = await detector.detect(cfg.minScore);
      objects = tracker.update(rawDets, performance.now() / 1000, video.videoWidth, video.videoHeight, cfg, sampleColor);
      drawOverlay(el('overlay'), video, objects);
    } catch (e) {
      status('Ошибка распознавания: ' + e.message);
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
}

async function setMode(next) {
  if (next === 'camera') {
    try {
      await detector.start(status);
    } catch (e) {
      status(e.name === 'NotAllowedError' ? 'Нет разрешения на камеру.' : e.message);
      detector.stop();
      next = 'sim';
    }
  } else {
    detector.stop();
  }
  mode = next;
  objects = [];
  tracker.reset();
  el('videoWrap').hidden = mode !== 'camera';
  el('simbar').hidden = mode !== 'sim';
  for (const b of el('modeSeg').children) b.classList.toggle('on', b.dataset.mode === mode);
  if (mode === 'camera') cameraLoop();
}

// ---------- управление ----------
el('modeSeg').addEventListener('click', (e) => {
  const m = e.target.dataset.mode;
  if (m && m !== mode) setMode(m);
});

el('viewSeg').addEventListener('click', (e) => {
  const v = e.target.dataset.view;
  if (!v) return;
  el('boards').dataset.view = v;
  for (const b of el('viewSeg').children) b.classList.toggle('on', b === e.target);
});

el('mapBtn').addEventListener('click', () => {
  el('mapBtn').classList.toggle('on', !el('debug').classList.toggle('off'));
});

function syncSound() { el('soundBtn').classList.toggle('on', cfg.sound); }
el('soundBtn').addEventListener('click', () => {
  cfg.sound = !cfg.sound;
  saveSettings(cfg);
  beeper.unlock();
  syncSound();
});

el('fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});

el('simbar').addEventListener('click', (e) => {
  switch (e.target.dataset.spawn) {
    case 'car': sim.spawnCar(cfg); break;
    case 'moto': sim.spawnCar(cfg, { type: 'moto' }); break;
    case 'reckless': sim.spawnCar(cfg, { type: 'reckless' }); break;
    case 'red': sim.spawnCar(cfg, { type: 'red' }); break;
    case 'weaving': sim.spawnCar(cfg, { type: 'weaving' }); break;
    case 'jam': sim.spawnJam(cfg); break;
    case 'moose': sim.spawnAnimal(cfg, { large: true }); break;
    case 'person': sim.spawnPerson(cfg); break;
    case 'jaywalker': sim.spawnPerson(cfg, { obey: false }); break;
    case 'animal': sim.spawnAnimal(cfg); break;
    case 'clear': sim.clear(); break;
    case 'auto':
      sim.auto = !sim.auto;
      el('autoBtn').classList.toggle('on', sim.auto);
      break;
  }
});

// не давать экрану гаснуть, пока табло работает
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* не поддерживается */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock) keepAwake();
});

function start(withCamera) {
  el('start').hidden = true;
  beeper.unlock();
  keepAwake();
  if (withCamera) setMode('camera');
  else { sim.auto = true; el('autoBtn').classList.add('on'); }
}
el('startSim').addEventListener('click', () => start(false));
el('startCam').addEventListener('click', () => start(true));

// ---------- настройки ----------
const FIELDS = [
  ['lanes', 'Число полос', { min: 1, max: 6, step: 1 }],
  ['laneWidth', 'Ширина полосы, м', { min: 2.5, max: 4.5, step: 0.25 }],
  ['speedLimit', 'Ограничение скорости, км/ч', { min: 10, max: 130, step: 10 }],
  ['boardDistance', 'Табло водителя — за сколько метров до перехода', { min: 20, max: 500, step: 10 }],
  ['camToCross', 'От камеры до перехода, м', { min: 0, max: 50, step: 1 }],
  ['camSide', 'Камера у обочины (для водителя)', { options: { right: 'правой', left: 'левой' } }],
  ['camOffset', 'Отступ камеры от края дороги, м', { min: 0, max: 10, step: 0.5 }],
  ['hfov', 'Угол обзора камеры, °', { min: 30, max: 120, step: 0.5 }],
  ['minScore', 'Порог уверенности детектора', { min: 0.3, max: 0.9, step: 0.05 }],
  ['walkSpeed', 'Скорость пешехода, м/с', { min: 0.6, max: 2, step: 0.1 }],
  ['margin', 'Запас времени пешеходу, с', { min: 0, max: 10, step: 0.5 }],
  ['reactionTime', 'Время реакции водителя, с', { min: 0.5, max: 2.5, step: 0.1 }],
  ['decel', 'Экстренное замедление, м/с²', { min: 2, max: 9, step: 0.5 }],
];

function buildFields() {
  const box = el('fields');
  box.innerHTML = '';
  for (const [key, label, o] of FIELDS) {
    const row = document.createElement('label');
    row.className = 'field';
    const span = document.createElement('span');
    span.textContent = label;
    let input;
    if (o.options) {
      input = document.createElement('select');
      for (const [v, t] of Object.entries(o.options)) input.add(new Option(t, v));
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      Object.assign(input, o);
    }
    input.value = cfg[key];
    input.addEventListener('change', () => {
      if (o.options) cfg[key] = input.value;
      else {
        const n = Number(input.value);
        if (!Number.isFinite(n)) { input.value = cfg[key]; return; }
        cfg[key] = Math.min(o.max, Math.max(o.min, n));
        input.value = cfg[key];
      }
      saveSettings(cfg);
    });
    row.append(span, input);
    box.appendChild(row);
  }
}

el('setBtn').addEventListener('click', () => { buildFields(); el('settings').showModal(); });
el('resetBtn').addEventListener('click', () => {
  cfg = { ...DEFAULTS };
  saveSettings(cfg);
  syncSound();
  buildFields();
});

// Калибровка: человек встаёт на известном расстоянии от камеры, по высоте
// его рамки в кадре вычисляется реальный угол обзора.
el('calibBtn').addEventListener('click', () => {
  if (mode !== 'camera') { alert('Сначала включите режим «Камера».'); return; }
  const person = rawDets
    .filter((d) => d.class === 'person')
    .sort((a, b) => b.bbox[3] - a.bbox[3])[0];
  if (!person) { alert('Человек в кадре не найден. Он должен быть виден в полный рост.'); return; }
  const dist = Number(prompt('На каком расстоянии от камеры стоит человек, м?', '5'));
  if (!(dist > 0)) return;
  const f = (person.bbox[3] * dist) / CLASSES.person.h;
  const half = Math.max(video.videoWidth, video.videoHeight) / 2;
  cfg.hfov = Math.round((2 * Math.atan(half / f) * 180) / Math.PI * 2) / 2;
  saveSettings(cfg);
  buildFields();
});

syncSound();
el('simbar').hidden = false;
requestAnimationFrame(frame);

// для отладки и автотестов
window.tablo = { sim, get cfg() { return cfg; }, get result() { return result; }, get objects() { return objects; } };
