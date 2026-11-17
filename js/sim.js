// Симулятор: создаёт машины, пешеходов и животных, чтобы проверять табло без камеры.
import { roadWidth, updateWeaving } from './logic.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const SPAWN_S = 180;

const COLORS = [
  ['белый', '#f2f2f2'], ['чёрный', '#1c1c1e'], ['серебристый', '#b8c0c8'], ['серый', '#6e7780'],
  ['красный', '#e0352b'], ['синий', '#2f62d9'], ['зелёный', '#2e9e55'], ['жёлтый', '#f2c81d'],
];

export class Simulator {
  constructor() {
    this.objects = [];
    this.nextId = 1;
    this.auto = false;
    this.autoT = 1;
    this.t = 0;
  }

  clear() { this.objects = []; }

  // type: 'normal' | 'reckless' (лихач) | 'red' (проехал на красный) |
  //       'weaving' (виляет) | 'moto' (мотоциклист)
  spawnCar(cfg, { type = 'normal', s = SPAWN_S, kmh } = {}) {
    const lane = 1 + Math.floor(Math.random() * cfg.lanes);
    const u = (lane - 0.5) * cfg.laneWidth;
    if (this.objects.some((o) => o.kind === 'vehicle' && Math.abs(o.u - u) < 1.5 && Math.abs(o.s - s) < 12)) return;
    const fast = type === 'reckless' || type === 'red';
    const v = (kmh ?? (fast ? rand(cfg.speedLimit + 20, cfg.speedLimit + 45) : rand(30, cfg.speedLimit))) / 3.6;
    const [color, colorCss] = pick(COLORS);
    this.objects.push({
      id: this.nextId++, kind: 'vehicle',
      cls: type === 'moto' ? 'motorcyclist' : 'car',
      label: type === 'moto' ? 'Мотоциклист' : 'Автомобиль',
      color, colorCss,
      s, u, u0: u, vs: v, vu: 0, target: v,
      reckless: fast,            // не тормозит перед пешеходами
      // В реальной системе этот признак приходит от контроллера предыдущего светофора
      ranRed: type === 'red',
      weave: type === 'weaving' ? { phase: rand(0, 6), amp: 1.1, period: 2.4 } : null,
      weaving: false,
    });
  }

  // Пробка: колонна медленно ползущих машин перед переходом
  spawnJam(cfg) {
    this.objects = this.objects.filter((o) => o.kind !== 'vehicle');
    for (let lane = 1; lane <= cfg.lanes; lane++) {
      for (let s = rand(6, 12); s < 90; s += rand(8, 11)) {
        const [color, colorCss] = pick(COLORS);
        const v = rand(4, 7) / 3.6;
        this.objects.push({
          id: this.nextId++, kind: 'vehicle', cls: 'car', label: 'Автомобиль', color, colorCss,
          s, u: (lane - 0.5) * cfg.laneWidth, vs: v, vu: 0, target: v,
          reckless: false, ranRed: false, weave: null, weaving: false,
        });
      }
    }
  }

  spawnPerson(cfg, { obey = true } = {}) {
    const fromRight = Math.random() < 0.5;
    this.objects.push({
      id: this.nextId++, kind: 'person', cls: 'person', label: 'Пешеход',
      s: rand(-1.5, 1.5), u: fromRight ? -2 : roadWidth(cfg) + 2, vs: 0, vu: 0,
      dir: fromRight ? 1 : -1, speed: rand(1.1, 1.5), obey, state: 'wait', wait: 0.6,
    });
  }

  spawnAnimal(cfg, { large = false } = {}) {
    const fromRight = Math.random() < 0.5;
    this.objects.push({
      id: this.nextId++, kind: 'animal', cls: large ? 'horse' : 'dog',
      label: large ? 'Лось' : 'Собака', large,
      s: rand(8, 70), u: fromRight ? -2 : roadWidth(cfg) + 2, vs: 0, vu: 0,
      dir: fromRight ? 1 : -1, speed: large ? rand(1.2, 2.5) : rand(2, 4),
      obey: false, state: 'go', wait: 0,
    });
  }

  // pedLevel — что сейчас показывает табло пешехода (послушные пешеходы ему следуют)
  step(dt, cfg, pedLevel) {
    const w = roadWidth(cfg);
    this.t += dt;

    if (this.auto) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.autoT = rand(4, 9);
        const r = Math.random();
        if (r < 0.55) this.spawnCar(cfg, { type: pick(['normal', 'normal', 'normal', 'normal', 'moto', 'reckless', 'red', 'weaving']) });
        else if (r < 0.9) this.spawnPerson(cfg, { obey: Math.random() < 0.7 });
        else this.spawnAnimal(cfg, { large: Math.random() < 0.4 });
      }
    }

    const onRoad = this.objects.filter((o) => o.kind !== 'vehicle' && o.u > -0.5 && o.u < w + 0.5);
    const cars = this.objects.filter((o) => o.kind === 'vehicle');

    for (const o of this.objects) {
      if (o.kind === 'vehicle') {
        // ближайшая точка, перед которой надо остановиться
        let gap = Infinity;
        if (!o.reckless) {
          for (const p of onRoad) if (p.s < o.s - 1) gap = Math.min(gap, o.s - (p.s + 4));
        }
        for (const c of cars) {
          if (c !== o && Math.abs(c.u - o.u) < 1.5 && c.s < o.s && c.vs < o.vs) {
            gap = Math.min(gap, o.s - (c.s + 7));
          }
        }
        const allowed = Math.sqrt(2 * 2.5 * Math.max(gap, 0));
        if (o.vs > allowed) {
          const need = gap > 0.1 ? (o.vs * o.vs) / (2 * gap) : 8;
          o.vs = Math.max(0, o.vs - Math.min(8, Math.max(need, 2.5)) * dt);
        } else {
          o.vs = Math.min(o.target, allowed, o.vs + 2 * dt);
        }
        o.s -= o.vs * dt;
        if (o.weave) {
          const k = (2 * Math.PI) / o.weave.period;
          const u = o.u0 + o.weave.amp * Math.sin(k * this.t + o.weave.phase);
          o.vu = (u - o.u) / dt;
          o.u = u;
        }
        // виляние определяется тем же алгоритмом, что и в режиме камеры
        o.weaving = updateWeaving(o, this.t);
      } else {
        if (o.state === 'wait') {
          o.wait -= dt;
          const free = pedLevel === 'clear' || pedLevel === 'info';
          if (o.wait <= 0 && (!o.obey || free)) o.state = 'go';
          o.vu = 0;
        } else {
          o.vu = o.dir * o.speed;
          o.u += o.vu * dt;
        }
      }
    }

    this.objects = this.objects.filter((o) =>
      o.kind === 'vehicle' ? o.s > -40 : o.u > -3.5 && o.u < w + 3.5);
    return this.objects;
  }
}
