import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, laneOf, zoneOf, stoppingDistance, crossingTime } from '../js/logic.js';
import { DEFAULTS } from '../js/settings.js';
import { locate, focalPx, Tracker } from '../js/tracker.js';
import { Simulator } from '../js/sim.js';

const cfg = { ...DEFAULTS };
const car = (s, kmh, u = 1.75) => ({ id: 1, kind: 'vehicle', label: 'Автомобиль', s, u, vs: kmh / 3.6, vu: 0 });
const person = (u, s = 0) => ({ id: 2, kind: 'person', label: 'Пешеход', s, u, vs: 0, vu: 0 });

test('геометрия полос', () => {
  assert.equal(laneOf(1, cfg), 1);
  assert.equal(laneOf(5, cfg), 2);
  assert.equal(laneOf(7, cfg), 2);
  assert.equal(laneOf(-1, cfg), null);
  assert.equal(zoneOf(-1, cfg), 'roadside');
  assert.equal(zoneOf(-5, cfg), 'away');
  assert.equal(zoneOf(3, cfg), 'road');
});

test('тормозной путь и время перехода', () => {
  // 60 км/ч: 16.67 м реакция + 23.1 м торможение
  assert.ok(Math.abs(stoppingDistance(60 / 3.6, cfg) - 39.8) < 0.2);
  assert.ok(Math.abs(crossingTime(cfg) - 7 / 1.2) < 1e-9);
});

test('пешеход: пусто — свободно', () => {
  const r = assess([], cfg);
  assert.equal(r.ped.level, 'clear');
  assert.equal(r.drv.level, 'clear');
});

test('пешеход: уровни по времени до перехода', () => {
  assert.equal(assess([car(170, 40)], cfg).ped.level, 'info');   // 15.3 с
  assert.equal(assess([car(120, 40)], cfg).ped.level, 'warn');   // 10.8 с
  assert.equal(assess([car(60, 40)], cfg).ped.level, 'danger');  // 5.4 с
  const r = assess([car(60, 40)], cfg);
  assert.equal(Math.round(r.ped.vehicle.speedKmh), 40);
  assert.equal(Math.round(r.ped.vehicle.distance), 60);
  assert.equal(r.ped.vehicle.canStop, true);
});

test('пешеход: стоящая и уехавшая машины не опасны', () => {
  assert.equal(assess([car(5, 0)], cfg).ped.level, 'clear');
  assert.equal(assess([car(5, 0)], cfg).ped.stopped, true);
  assert.equal(assess([car(-10, 50)], cfg).ped.level, 'clear');
});

test('пешеход: критическая ситуация, когда человек на дороге', () => {
  const r = assess([car(20, 60), person(3)], cfg);
  assert.equal(r.ped.level, 'danger');
  assert.equal(r.ped.critical, true);
  assert.equal(r.ped.vehicle.canStop, false);
});

test('водитель: полоса и расстояние', () => {
  const r = assess([person(5)], cfg);
  assert.equal(r.drv.level, 'warn');
  assert.equal(r.drv.target.lane, 2);
  assert.equal(r.drv.target.distance, 100);
  const side = assess([person(-1.5)], cfg);
  assert.equal(side.drv.level, 'caution');
  assert.equal(side.drv.target.side, 'right');
  assert.equal(assess([person(-6)], cfg).drv.level, 'clear');
});

test('водитель: «тормозите», когда спокойно остановиться уже нельзя', () => {
  assert.equal(assess([car(150, 50), person(3)], cfg).drv.level, 'warn');
  assert.equal(assess([car(30, 50), person(3)], cfg).drv.level, 'brake');
});

test('водитель: человек на дороге важнее человека у дороги', () => {
  const r = assess([{ ...person(-1, 30), id: 5 }, { ...person(2, 0), id: 6 }], cfg);
  assert.equal(r.drv.target.id, 6);
});

test('камера: дальность по высоте рамки', () => {
  const w = 1280, h = 720;
  const f = focalPx(w, h, cfg);
  // человек 1.7 м на расстоянии 10 м по центру кадра
  const bh = (f * 1.7) / 10;
  const pos = locate({ class: 'person', bbox: [w / 2 - 20, 200, 40, bh] }, w, h, cfg);
  assert.ok(Math.abs(pos.z - 10) < 1e-6);
  assert.ok(Math.abs(pos.s - 5) < 1e-6);
  assert.ok(Math.abs(pos.u - -1) < 1e-6); // камера на 1 м правее края дороги
});

test('трекер: оценивает скорость приближающейся машины', () => {
  const w = 1280, h = 720;
  const f = focalPx(w, h, cfg);
  const tr = new Tracker();
  let out = [];
  for (let i = 0; i <= 40; i++) {
    const t = i * 0.1;
    const z = 60 - 10 * t; // 10 м/с = 36 км/ч
    const bh = (f * 1.5) / z;
    out = tr.update([{ class: 'car', score: 0.9, bbox: [600, 300, bh * 1.4, bh] }], t, w, h, cfg);
  }
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0].vs - 10) < 1, `vs=${out[0].vs}`);
  assert.ok(Math.abs(out[0].s - (20 - 5)) < 1.5, `s=${out[0].s}`);
});

test('симуляция: машина останавливается перед пешеходом', () => {
  const sim = new Simulator();
  sim.spawnCar(cfg);
  sim.objects.push({ id: 99, kind: 'person', label: 'Пешеход', s: 0, u: 3.5, vs: 0, vu: 0, dir: 1, speed: 0, obey: false, state: 'go', wait: 0 });
  for (let i = 0; i < 60 * 40; i++) sim.step(1 / 60, cfg, 'clear');
  const c = sim.objects.find((o) => o.kind === 'vehicle');
  assert.ok(c.s > 2 && c.s < 8, `s=${c.s}`);
  assert.ok(c.vs < 0.5);
});
