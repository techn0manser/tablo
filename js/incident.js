// Фиксация происшествий (ДТП) и тексты оповещений.
// МАКЕТ: никакие службы на самом деле не вызываются, номеров здесь нет.
import { laneOf, zoneOf, KMH } from './logic.js';

// Ищет столкновение среди объектов на дороге.
// vehicles: false — не искать столкновения машин между собой (режим камеры:
// там одна машина иногда даёт два объекта, и это выглядело бы как авария).
export function detectCollision(objects, cfg, { vehicles = true } = {}) {
  const cars = objects.filter((o) => o.kind === 'vehicle' && !o.crashed);
  for (const v of cars) {
    if (v.vs < 2) continue; // медленнее 7 км/ч — не наезд
    for (const b of objects) {
      if (b.kind === 'vehicle' || b.down) continue;
      if (zoneOf(b.u, cfg) !== 'road') continue;
      if (Math.abs(v.s - b.s) < 2.2 && Math.abs(v.u - b.u) < 1.1) {
        return { type: b.kind, vehicle: v, other: b };
      }
    }
  }
  if (vehicles) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        if (Math.abs(a.s - b.s) < 4.2 && Math.abs(a.u - b.u) < 1.4 && Math.abs(a.vs - b.vs) > 3) {
          const [fast, slow] = a.vs > b.vs ? [a, b] : [b, a];
          return { type: 'crash', vehicle: fast, other: slow };
        }
      }
    }
  }
  return null;
}

const SERVICES = {
  person: 'ДПС и скорая помощь',
  crash: 'ДПС и скорая помощь',
  animal: 'ДПС',
  manual: 'ДПС и скорая помощь',
};

const CAUSE = {
  person: 'Сбит пешеход — возможно, ранен человек',
  crash: 'Столкновение автомобилей — возможны пострадавшие',
  animal: 'Сбито животное',
  manual: 'Сообщение очевидца о происшествии',
};

let nextId = 1;

// c — результат detectCollision() или { type: 'manual' }
export function makeIncident(c, cfg, now = Date.now()) {
  const v = c.vehicle;
  const where = c.other || v;
  const factors = [];
  if (v) {
    const kmh = v.vs * KMH;
    if (v.ranRed) factors.push('проехал на красный свет');
    if (v.weaving) factors.push('вилял');
    if (kmh > cfg.speedLimit + 5) factors.push('превышал скорость');
  }
  return {
    id: nextId++,
    type: c.type,
    time: now,
    cause: c.type === 'animal' && c.other?.large ? 'Сбито крупное животное' : CAUSE[c.type],
    services: SERVICES[c.type],
    vehicle: v
      ? { text: [v.color, v.label].filter(Boolean).join(' ').toLowerCase(), speedKmh: Math.round(v.vs * KMH), factors }
      : null,
    lane: where ? laneOf(where.u, cfg) : null,
    s: where ? where.s : 0,
    notified: null, // { by: 'auto' | 'button', time }
  };
}

export function notifyServices(incident, by, now = Date.now()) {
  if (!incident.notified) incident.notified = { by, time: now };
  return incident;
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Строка с подробностями: какая машина, скорость, полоса, что нарушил
export function incidentDetail(inc) {
  const parts = [];
  if (inc.vehicle) {
    parts.push(cap(inc.vehicle.text), `${inc.vehicle.speedKmh} км/ч`);
  }
  if (inc.lane) parts.push(`полоса ${inc.lane}`);
  if (inc.vehicle?.factors.length) parts.push(inc.vehicle.factors.join(', '));
  return parts.join(' · ');
}

export function incidentStatus(inc) {
  return inc.notified ? `${inc.services} оповещены` : 'Службы ещё не оповещены';
}

// Что произносит голос
export function incidentSpeech(inc) {
  const tail = inc.notified
    ? `${inc.services} оповещены.`
    : 'Нажмите кнопку на табло, чтобы вызвать экстренные службы.';
  return `Внимание! Произошло ДТП. ${inc.cause.replace(' — ', ', ')}. ${tail}`;
}
