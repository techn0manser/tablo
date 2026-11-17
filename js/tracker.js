// Превращает рамки детектора в объекты на дороге: оценивает дальность по
// высоте рамки (модель камеры-обскуры), ведёт треки и сглаживает скорость.
import { roadWidth, updateWeaving, colorName } from './logic.js';

// Классы COCO, которые нас интересуют, и типичная высота объекта в метрах
export const CLASSES = {
  car: { kind: 'vehicle', h: 1.5, label: 'Автомобиль' },
  truck: { kind: 'vehicle', h: 3.0, label: 'Грузовик' },
  bus: { kind: 'vehicle', h: 3.0, label: 'Автобус' },
  motorcycle: { kind: 'vehicle', h: 1.3, label: 'Мотоцикл' },
  bicycle: { kind: 'vehicle', h: 1.1, label: 'Велосипед' },
  // мотоцикл/велосипед вместе с седоком — собираются в mergeRiders()
  motorcyclist: { kind: 'vehicle', h: 1.6, label: 'Мотоциклист' },
  cyclist: { kind: 'vehicle', h: 1.7, label: 'Велосипедист' },
  person: { kind: 'person', h: 1.7, label: 'Пешеход' },
  dog: { kind: 'animal', h: 0.5, label: 'Собака' },
  cat: { kind: 'animal', h: 0.25, label: 'Кошка' },
  sheep: { kind: 'animal', h: 0.8, label: 'Овца' },
  // Крупные животные. Лося и оленя в наборе COCO нет — модель обычно
  // относит их к лошади или корове, поэтому на табло пишем просто «крупное животное».
  horse: { kind: 'animal', h: 1.6, label: 'Лошадь', large: true },
  cow: { kind: 'animal', h: 1.4, label: 'Корова', large: true },
  bear: { kind: 'animal', h: 1.1, label: 'Медведь', large: true },
  elephant: { kind: 'animal', h: 2.8, label: 'Слон', large: true },
  zebra: { kind: 'animal', h: 1.4, label: 'Зебра', large: true },
  giraffe: { kind: 'animal', h: 4.5, label: 'Жираф', large: true },
};

// Человек на мотоцикле или велосипеде — это не пешеход. Склеиваем его рамку
// с рамкой мотоцикла в один объект «мотоциклист» / «велосипедист».
export function mergeRiders(dets) {
  const dropped = new Set();
  const out = [];
  for (const d of dets) {
    if (d.class !== 'motorcycle' && d.class !== 'bicycle') continue;
    const [x, y, w, h] = d.bbox;
    const rider = dets.find((p) => {
      if (p.class !== 'person' || dropped.has(p)) return false;
      const [px, py, pw, ph] = p.bbox;
      const cx = px + pw / 2;
      return cx > x && cx < x + w && py < y + h * 0.6 && py + ph > y && py + ph < y + h * 1.25;
    });
    if (!rider) continue;
    dropped.add(rider);
    dropped.add(d);
    const [px, py, pw, ph] = rider.bbox;
    const x1 = Math.min(x, px);
    const y1 = Math.min(y, py);
    out.push({
      class: d.class === 'motorcycle' ? 'motorcyclist' : 'cyclist',
      score: Math.max(d.score, rider.score),
      bbox: [x1, y1, Math.max(x + w, px + pw) - x1, Math.max(y + h, py + ph) - y1],
    });
  }
  return out.concat(dets.filter((d) => !dropped.has(d)));
}

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
  // sampleColor(bbox) → [r, g, b] — необязательная функция, берёт цвет из кадра
  update(dets, t, w, h, cfg, sampleColor) {
    const used = new Set();
    const sorted = mergeRiders(dets)
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
      best.large = !!c.large;
      best.weaving = c.kind === 'vehicle' && best.hits >= MIN_HITS_SPEED && updateWeaving(best, t);
      if (c.kind === 'vehicle' && sampleColor) {
        const rgb = sampleColor(d.bbox);
        if (rgb) best.rgb = best.rgb ? best.rgb.map((v, i) => v * 0.7 + rgb[i] * 0.3) : rgb;
      }
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
          large: tr.large, weaving: tr.weaving,
          color: tr.rgb ? colorName(tr.rgb) : null,
          colorCss: tr.rgb ? `rgb(${tr.rgb.map(Math.round).join(',')})` : null,
        };
      });
  }
}
