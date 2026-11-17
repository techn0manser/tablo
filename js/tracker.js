// Превращает рамки детектора в объекты на дороге: оценивает дальность по
// высоте рамки (модель камеры-обскуры), ведёт треки и сглаживает скорость.
import { roadWidth } from './logic.js';

// Классы COCO, которые нас интересуют, и типичная высота объекта в метрах
export const CLASSES = {
  car: { kind: 'vehicle', h: 1.5, label: 'Автомобиль' },
  truck: { kind: 'vehicle', h: 3.0, label: 'Грузовик' },
  bus: { kind: 'vehicle', h: 3.0, label: 'Автобус' },
  motorcycle: { kind: 'vehicle', h: 1.3, label: 'Мотоцикл' },
  bicycle: { kind: 'vehicle', h: 1.1, label: 'Велосипед' },
  person: { kind: 'person', h: 1.7, label: 'Пешеход' },
  dog: { kind: 'animal', h: 0.5, label: 'Собака' },
  cat: { kind: 'animal', h: 0.25, label: 'Кошка' },
  horse: { kind: 'animal', h: 1.6, label: 'Лошадь' },
  cow: { kind: 'animal', h: 1.4, label: 'Корова' },
  sheep: { kind: 'animal', h: 0.8, label: 'Овца' },
  bear: { kind: 'animal', h: 1.0, label: 'Животное' },
};

// Фокусное расстояние в пикселях для кадра w×h
export function focalPx(w, h, cfg) {
  return (Math.max(w, h) / 2) / Math.tan((cfg.hfov * Math.PI) / 360);
}

export function camU(cfg) {
  return cfg.camSide === 'right' ? -cfg.camOffset : roadWidth(cfg) + cfg.camOffset;
}

// Рамка [x, y, w, h] → координаты на дороге
export function locate(det, w, h, cfg) {
  const c = CLASSES[det.class];
  const [bx, by, bw, bh] = det.bbox;
  const f = focalPx(w, h, cfg);
  const z = (f * c.h) / Math.max(bh, 1);
  const x = ((bx + bw / 2 - w / 2) * z) / f;
  // Камера смотрит навстречу машинам: правая сторона кадра — левая для водителя
  return { z, s: z - cfg.camToCross, u: camU(cfg) + x };
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[2] * a[3] + b[2] * b[3] - inter || 1);
}

const ALPHA = 0.45;
const BETA = 0.12;
const MAX_AGE = 0.7; // с — сколько живёт трек без подтверждения
const MIN_HITS_SPEED = 4;

export class Tracker {
  constructor() {
    this.tracks = [];
    this.nextId = 1;
  }

  reset() {
    this.tracks = [];
  }

  // dets: [{class, score, bbox:[x,y,w,h]}], t — время в секундах
  update(dets, t, w, h, cfg) {
    const used = new Set();
    const sorted = dets
      .filter((d) => CLASSES[d.class] && d.score >= cfg.minScore)
      .sort((a, b) => b.score - a.score);

    for (const d of sorted) {
      const c = CLASSES[d.class];
      const pos = locate(d, w, h, cfg);
      let best = null;
      let bestScore = 0.15;
      for (const tr of this.tracks) {
        if (used.has(tr) || tr.kind !== c.kind) continue;
        const sc = iou(tr.bbox, d.bbox);
        if (sc > bestScore) { best = tr; bestScore = sc; }
      }
      if (!best) {
        best = {
          id: this.nextId++, kind: c.kind, cls: d.class, label: c.label,
          s: pos.s, u: pos.u, vs: 0, vu: 0, hits: 0, t, bbox: d.bbox,
        };
        this.tracks.push(best);
      } else {
        const dt = Math.max(t - best.t, 1e-3);
        // альфа-бета фильтр: прогноз + поправка по измерению
        const sPred = best.s - best.vs * dt;
        const rs = pos.s - sPred;
        best.s = sPred + ALPHA * rs;
        best.vs -= (BETA * rs) / dt;
        const uPred = best.u + best.vu * dt;
        const ru = pos.u - uPred;
        best.u = uPred + ALPHA * ru;
        best.vu += (BETA * ru) / dt;
        best.cls = d.class;
        best.label = c.label;
        best.bbox = d.bbox;
        best.t = t;
      }
      best.hits++;
      best.score = d.score;
      used.add(best);
    }

    this.tracks = this.tracks.filter((tr) => t - tr.t <= MAX_AGE);

    return this.tracks
      .filter((tr) => tr.hits >= 2)
      .map((tr) => {
        const ready = tr.hits >= MIN_HITS_SPEED;
        return {
          id: tr.id, kind: tr.kind, cls: tr.cls, label: tr.label,
          s: tr.s, u: tr.u,
          vs: ready ? tr.vs : 0,
          vu: ready ? tr.vu : 0,
          bbox: tr.bbox, score: tr.score,
        };
      });
  }
}
