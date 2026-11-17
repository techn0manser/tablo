// Симулятор: создаёт машины, пешеходов и животных, чтобы проверять табло без камеры.
import { roadWidth } from './logic.js';

const rand = (a, b) => a + Math.random() * (b - a);
export const SPAWN_S = 180;

export class Simulator {
  constructor() {
    this.objects = [];
    this.nextId = 1;
    this.auto = false;
    this.autoT = 1;
  }

  clear() { this.objects = []; }

  spawnCar(cfg, { reckless = false } = {}) {
    const lane = 1 + Math.floor(Math.random() * cfg.lanes);
    const u = (lane - 0.5) * cfg.laneWidth;
    if (this.objects.some((o) => o.kind === 'vehicle' && Math.abs(o.u - u) < 1.5 && o.s > SPAWN_S - 30)) return;
    const v = (reckless ? rand(75, 100) : rand(30, 65)) / 3.6;
    this.objects.push({
      id: this.nextId++, kind: 'vehicle', cls: 'car', label: reckless ? 'Лихач' : 'Автомобиль',
      s: SPAWN_S, u, vs: v, vu: 0, target: v, reckless,
    });
  }

  spawnPerson(cfg, { obey = true } = {}) {
    const fromRight = Math.random() < 0.5;
    this.objects.push({
      id: this.nextId++, kind: 'person', cls: 'person', label: 'Пешеход',
      s: rand(-1.5, 1.5), u: fromRight ? -2 : roadWidth(cfg) + 2, vs: 0, vu: 0,
      dir: fromRight ? 1 : -1, speed: rand(1.1, 1.5), obey, state: 'wait', wait: 0.6,
    });
  }

  spawnAnimal(cfg) {
    const fromRight = Math.random() < 0.5;
    this.objects.push({
      id: this.nextId++, kind: 'animal', cls: 'dog', label: 'Собака',
      s: rand(8, 70), u: fromRight ? -2 : roadWidth(cfg) + 2, vs: 0, vu: 0,
      dir: fromRight ? 1 : -1, speed: rand(2, 4), obey: false, state: 'go', wait: 0,
    });
  }

  // pedLevel — что сейчас показывает табло пешехода (послушные пешеходы ему следуют)
  step(dt, cfg, pedLevel) {
    const w = roadWidth(cfg);

    if (this.auto) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.autoT = rand(4, 9);
        const r = Math.random();
        if (r < 0.55) this.spawnCar(cfg, { reckless: Math.random() < 0.15 });
        else if (r < 0.9) this.spawnPerson(cfg, { obey: Math.random() < 0.7 });
        else this.spawnAnimal(cfg);
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
