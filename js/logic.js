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
const SLOW = 2.8;   // м/с (10 км/ч) — «ползёт», как в пробке
const LEVELS = ['clear', 'info', 'warn', 'danger'];

// ---------- Цвет машины ----------
// [r, g, b] 0..255 → русское название (мужской род: «красный автомобиль»)
export function colorName([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  const sat = max ? d / max : 0;
  if (max < 0.2) return 'чёрный';
  if (sat < 0.18) return max > 0.8 ? 'белый' : max > 0.5 ? 'серебристый' : 'серый';
  let h;
  if (max === r / 255) h = ((g - b) / 255 / d) % 6;
  else if (max === g / 255) h = (b - r) / 255 / d + 2;
  else h = (r - g) / 255 / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 335) return 'красный';
  if (h < 45) return max < 0.55 ? 'коричневый' : 'оранжевый';
  if (h < 70) return 'жёлтый';
  if (h < 165) return 'зелёный';
  if (h < 200) return 'голубой';
  if (h < 260) return 'синий';
  return 'фиолетовый';
}

// ---------- Виляние ----------
// Считает развороты поперечного движения с размахом от 0,5 м. Три и больше
// разворотов за 6 секунд — машина виляет (одно перестроение сюда не попадает).
// Состояние хранится в самом объекте (o._lat). Возвращает true/false.
export function updateWeaving(o, t) {
  const SWING = 0.5;
  const h = (o._lat ||= { ext: o.u, dir: 0, turns: [] });
  if (h.dir === 0) {
    if (Math.abs(o.u - h.ext) >= SWING) { h.dir = Math.sign(o.u - h.ext); h.ext = o.u; }
  } else if ((o.u - h.ext) * h.dir > 0) {
    h.ext = o.u;
  } else if (Math.abs(o.u - h.ext) >= SWING) {
    h.turns.push(t);
    h.dir = -h.dir;
    h.ext = o.u;
  }
  h.turns = h.turns.filter((x) => t - x <= 6);
  return h.turns.length >= 3;
}

export function assess(objects, cfg) {
  const vehicles = objects.filter((o) => o.kind === 'vehicle' && o.s > -2);
  const beings = objects.filter((o) => o.kind === 'person' || o.kind === 'animal');
  const tCross = crossingTime(cfg);
  const need = tCross + cfg.margin;

  // ---------- Табло пешехода ----------
  // Каждая приближающаяся машина оценивается отдельно, на табло — самая опасная.
  let threat = null;
  let hazard = null;
  const list = []; // все машины в поле распознавания — для списка на табло пешехода // ближайший опасный водитель — показывается, даже если главная угроза не он
  let moving = 0;
  let speedingCount = 0;
  for (const v of vehicles) {
    if (v.vs <= MOVING || v.s <= 0) {
      // стоит или уже на переходе — опасности не несёт, но в списке показывается
      list.push({
        id: v.id, label: v.label, color: v.color || null, colorCss: v.colorCss || null,
        distance: Math.max(0, v.s), speedKmh: Math.max(0, v.vs) * KMH, ttc: null, lvl: 0,
        stopped: v.vs <= MOVING, speeding: false, weaving: !!v.weaving, ranRed: !!v.ranRed,
        reckless: false, lane: laneOf(v.u, cfg),
      });
      continue;
    }
    moving++;
    const ttc = v.s / v.vs;
    const speedKmh = v.vs * KMH;
    const canStop = stoppingDistance(v.vs, cfg) < v.s;
    const speeding = speedKmh > cfg.speedLimit + 5;
    if (speeding) speedingCount++;
    // опасное вождение: проехал на красный, виляет или грубо превышает
    const reckless = !!v.ranRed || !!v.weaving || speedKmh > cfg.speedLimit + 20;

    let lvl = ttc < need || !canStop ? 3 : ttc < need + 5 ? 2 : 1;
    if (v.vs < SLOW) lvl = Math.min(lvl, 2);                 // ползущая машина — не «стойте», а «внимание»
    if (reckless && lvl < 3 && ttc < need + 15) lvl++;       // опасному водителю доверяем меньше

    const info = {
        id: v.id, label: v.label, color: v.color || null, colorCss: v.colorCss || null,
        distance: v.s, speedKmh, ttc, canStop, lvl,
        speeding, weaving: !!v.weaving, ranRed: !!v.ranRed, reckless,
        u: v.u,
        // куда машина приедет на линии перехода (прогноз траектории)
        uAtCross: v.u + (v.vu || 0) * ttc,
        lane: laneOf(v.u, cfg),
        stopped: false,
    };
    list.push(info);
    if (!threat || lvl > threat.lvl || (lvl === threat.lvl && ttc < threat.ttc)) threat = info;
    if (reckless && (!hazard || ttc < hazard.ttc)) hazard = info;
  }
  const near = vehicles.filter((v) => v.s >= 0 && v.s < 100);
  const slowNear = near.filter((v) => v.vs < SLOW);
  const stoppedCount = near.filter((v) => v.vs <= MOVING).length;
  const peopleOnRoad = beings.some(
    (b) => b.kind === 'person' && zoneOf(b.u, cfg) === 'road' && Math.abs(b.s) < 8,
  );

  const pedLevel = threat ? LEVELS[threat.lvl] : 'clear';
  const ped = {
    level: pedLevel,
    critical: pedLevel === 'danger' && peopleOnRoad,
    vehicle: threat,
    // сначала самые опасные, внутри уровня — кто раньше доедет; стоящие в конце
    vehicles: list.sort((a, b) => b.lvl - a.lvl || (a.ttc ?? 1e9) - (b.ttc ?? 1e9) || a.distance - b.distance),
    hazard: hazard && hazard.id !== threat.id ? hazard : null,
    stopped: stoppedCount > 0,
    crossTime: tCross,
    peopleOnRoad,
    traffic: {
      moving,
      speeding: speedingCount,
      stopped: stoppedCount,
      // пробка: рядом три и больше машин, и почти все стоят или ползут
      jam: slowNear.length >= 3 && slowNear.length >= near.length * 0.6,
    },
  };

  // ---------- Табло водителя ----------
  // Учитываются все люди и животные: на скольких угодно полосах одновременно.
  const all = [];
  for (const b of beings) {
    const zone = zoneOf(b.u, cfg);
    if (zone === 'away') continue;
    if (b.s < -5 || b.s > cfg.boardDistance) continue;
    all.push({
      id: b.id,
      kind: b.kind,
      label: b.label,
      large: !!b.large,
      zone,
      lane: laneOf(b.u, cfg),
      side: b.u < 0 ? 'right' : 'left', // для зоны 'roadside': у какой обочины
      s: b.s,
      distance: Math.max(0, cfg.boardDistance - b.s),
    });
  }
  // главная цель: на дороге важнее, чем у дороги; затем — ближайшая к табло
  all.sort((x, y) => (x.zone === 'road' ? 0 : 1) - (y.zone === 'road' ? 0 : 1) || x.distance - y.distance);
  const target = all[0] || null;

  // занятость полос и обочин: ключ — номер полосы или 'left' / 'right'
  const lanes = {};
  for (const b of all) {
    const key = b.zone === 'road' ? String(b.lane) : b.side;
    const c = (lanes[key] ||= { key, zone: b.zone, count: 0, people: 0, animals: 0, large: false, distance: Infinity });
    c.count++;
    if (b.kind === 'person') c.people++;
    else c.animals++;
    if (b.large) c.large = true;
    c.distance = Math.min(c.distance, b.distance);
  }
  const roadLanes = Object.values(lanes)
    .filter((c) => c.zone === 'road')
    .map((c) => Number(c.key))
    .sort((x, y) => x - y);
  const onRoad = all.filter((b) => b.zone === 'road');
  const summary = {
    people: onRoad.filter((b) => b.kind === 'person').length,
    animals: onRoad.filter((b) => b.kind === 'animal').length,
    large: onRoad.some((b) => b.large),
    roadside: all.length - onRoad.length,
    roadLanes,
    allLanes: roadLanes.length === cfg.lanes,
  };

  // ближайшая машина, которая ещё не доехала до цели (или до перехода, если цели нет)
  const ref = target ? target.s : 0;
  let nearest = null;
  for (const v of vehicles) {
    const gap = v.s - ref;
    if (gap <= 0 || v.vs <= MOVING) continue;
    if (!nearest || gap < nearest.gap) nearest = { gap, v: v.vs };
  }
  const vehicleSpeedKmh = nearest ? nearest.v * KMH : null;
  const speeding = nearest ? vehicleSpeedKmh > cfg.speedLimit + 5 : false;

  let drvLevel = 'clear';
  if (target) {
    drvLevel = target.zone === 'road' ? 'warn' : 'caution';
    // спокойного торможения (3 м/с²) уже не хватает — пора тормозить всерьёз
    if (nearest && target.zone === 'road' && stoppingDistance(nearest.v, cfg, 3) > nearest.gap) {
      drvLevel = 'brake';
    }
  } else if (speeding) {
    drvLevel = 'caution';
  }
  const drv = { level: drvLevel, target, all, lanes, summary, vehicleSpeedKmh, speeding };

  return { ped, drv };
}
