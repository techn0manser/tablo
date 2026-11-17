// Чистая логика оценки опасности. Не зависит от браузера — тестируется в Node.
//
// Система координат дороги (общая для камеры и симуляции):
//   s — расстояние вдоль дороги до перехода, м (s > 0: объект ещё не доехал до перехода)
//   u — поперечная координата, м: 0 — правый (для водителя) край проезжей части,
//       lanes * laneWidth — левый край
//   vs — скорость сближения с переходом, м/с (> 0: приближается)
//   vu — поперечная скорость, м/с

export const KMH = 3.6;
export const ROADSIDE = 2.5; // полоса у дороги, где пешеход считается «у дороги», м

export const roadWidth = (cfg) => cfg.lanes * cfg.laneWidth;
export const crossingTime = (cfg) => roadWidth(cfg) / cfg.walkSpeed;

export function stoppingDistance(v, cfg, decel = cfg.decel) {
  return v * cfg.reactionTime + (v * v) / (2 * decel);
}

// 'road' — на проезжей части, 'roadside' — у дороги, 'away' — далеко
export function zoneOf(u, cfg) {
  const w = roadWidth(cfg);
  if (u >= 0 && u <= w) return 'road';
  if (u >= -ROADSIDE && u <= w + ROADSIDE) return 'roadside';
  return 'away';
}

// Номер полосы: 1 — крайняя правая для водителя
export function laneOf(u, cfg) {
  if (u < 0 || u > roadWidth(cfg)) return null;
  return Math.min(cfg.lanes, Math.floor(u / cfg.laneWidth) + 1);
}

const MOVING = 0.5; // м/с — ниже считаем, что машина стоит

export function assess(objects, cfg) {
  const vehicles = objects.filter((o) => o.kind === 'vehicle' && o.s > -2);
  const beings = objects.filter((o) => o.kind === 'person' || o.kind === 'animal');
  const tCross = crossingTime(cfg);

  // ---------- Табло пешехода ----------
  let threat = null;
  for (const v of vehicles) {
    if (v.vs <= MOVING || v.s <= 0) continue;
    const ttc = v.s / v.vs;
    if (!threat || ttc < threat.ttc) {
      threat = {
        id: v.id,
        label: v.label,
        distance: v.s,
        speedKmh: v.vs * KMH,
        ttc,
        canStop: stoppingDistance(v.vs, cfg) < v.s,
        u: v.u,
        // куда машина приедет на линии перехода (прогноз траектории)
        uAtCross: v.u + (v.vu || 0) * ttc,
        lane: laneOf(v.u, cfg),
      };
    }
  }
  const stopped = vehicles.some((v) => v.vs <= MOVING && v.s >= 0 && v.s < 20);
  const peopleOnRoad = beings.some(
    (b) => b.kind === 'person' && zoneOf(b.u, cfg) === 'road' && Math.abs(b.s) < 8,
  );

  let pedLevel = 'clear';
  if (threat) {
    if (threat.ttc < tCross + cfg.margin || !threat.canStop) pedLevel = 'danger';
    else if (threat.ttc < tCross + cfg.margin + 5) pedLevel = 'warn';
    else pedLevel = 'info';
  }
  const ped = {
    level: pedLevel,
    critical: pedLevel === 'danger' && peopleOnRoad,
    vehicle: threat,
    stopped,
    crossTime: tCross,
    peopleOnRoad,
  };

  // ---------- Табло водителя ----------
  let target = null;
  for (const b of beings) {
    const zone = zoneOf(b.u, cfg);
    if (zone === 'away') continue;
    if (b.s < -5 || b.s > cfg.boardDistance) continue;
    const cand = {
      id: b.id,
      kind: b.kind,
      label: b.label,
      zone,
      lane: laneOf(b.u, cfg),
      side: b.u < 0 ? 'right' : 'left', // для зоны 'roadside': у какой обочины
      s: b.s,
      distance: Math.max(0, cfg.boardDistance - b.s),
    };
    // приоритет: на дороге важнее, чем у дороги; затем — ближайший к табло
    const better =
      !target ||
      (cand.zone === 'road' && target.zone !== 'road') ||
      (cand.zone === target.zone && cand.distance < target.distance);
    if (better) target = cand;
  }

  let drvLevel = 'clear';
  let vehicleSpeedKmh = null;
  if (target) {
    drvLevel = target.zone === 'road' ? 'warn' : 'caution';
    // ближайшая машина, которая ещё не доехала до цели
    let nearest = null;
    for (const v of vehicles) {
      const gap = v.s - target.s;
      if (gap <= 0 || v.vs <= MOVING) continue;
      if (!nearest || gap < nearest.gap) nearest = { gap, v: v.vs };
    }
    if (nearest) {
      vehicleSpeedKmh = nearest.v * KMH;
      // спокойного торможения (3 м/с²) уже не хватает — пора тормозить всерьёз
      if (target.zone === 'road' && stoppingDistance(nearest.v, cfg, 3) > nearest.gap) {
        drvLevel = 'brake';
      }
    }
  }
  const drv = { level: drvLevel, target, vehicleSpeedKmh };

  return { ped, drv };
}
