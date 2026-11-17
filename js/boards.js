// Отрисовка двух табло по результату assess().

const $ = (root, sel) => root.querySelector(sel);

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

const PED_TEXT = {
  clear: ['МАШИН НЕТ', 'Перед переходом убедитесь в безопасности'],
  info: ['АВТОМОБИЛЬ ДАЛЕКО', 'Можно переходить, будьте внимательны'],
  warn: ['ВНИМАНИЕ!', 'Приближается автомобиль'],
  danger: ['СТОЙТЕ!', 'Автомобиль близко — переходить опасно'],
};

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function renderPedBoard(root, ped) {
  const v = ped.vehicle;
  const tr = ped.traffic;
  let [head, sub] = PED_TEXT[ped.level];

  // почему эта машина опасна
  const reasons = [];
  if (v?.ranRed) reasons.push('проехал на красный свет');
  if (v?.weaving) reasons.push('виляет — опасное вождение');
  if (v?.speeding) reasons.push('превышает скорость');

  if (ped.critical) {
    head = 'ОПАСНОСТЬ!';
    sub = !v.canStop ? 'Автомобиль не успеет остановиться!' : 'Автомобиль близко — освободите дорогу';
  } else if (ped.level === 'danger' && !v.canStop) {
    sub = 'Автомобиль не успеет остановиться';
  } else if (tr.jam && ped.level !== 'danger') {
    sub = ped.level === 'clear' ? 'Пробка — машины стоят' : 'Пробка — машины движутся медленно';
    if (ped.level === 'info') head = 'ПРОБКА';
  } else if (ped.level === 'clear' && ped.stopped) {
    sub = 'Автомобиль остановился';
  }
  if (reasons.length && (ped.level === 'warn' || ped.level === 'danger')) {
    if (v.reckless && !ped.critical) head = 'ОПАСНЫЙ ВОДИТЕЛЬ!';
    sub = cap(reasons.join(', '));
  }

  root.dataset.level = ped.critical ? 'critical' : ped.level;
  setText($(root, '.headline'), head);
  setText($(root, '.sub'), sub);

  // какая машина: цвет и тип
  const who = $(root, '.who');
  setText($(who, 'span'), v ? [v.color, v.label].filter(Boolean).join(' ').toUpperCase() : '');
  const sw = $(who, 'i');
  sw.hidden = !v?.colorCss;
  if (v?.colorCss) sw.style.background = v.colorCss;

  // второй опасный водитель, если он не главная угроза
  const hz = ped.hazard;
  let alert = '';
  if (hz) {
    const why = hz.ranRed ? 'проехал на красный' : hz.weaving ? 'виляет' : 'сильно превышает';
    alert = `⚠ ${[hz.color, hz.label].filter(Boolean).join(' ')} ${why} · ${Math.round(hz.distance)} м`;
  }
  setText($(root, '.alert'), alert);

  setText($(root, '[data-m=speed]'), v ? String(Math.round(v.speedKmh)) : '—');
  setText($(root, '[data-m=dist]'), v ? String(Math.round(v.distance)) : '—');
  setText($(root, '[data-m=ttc]'), v ? (v.ttc < 10 ? v.ttc.toFixed(1) : String(Math.round(v.ttc))) : '—');
  $(root, '.metric').classList.toggle('over', !!v?.speeding);

  const foot = [`Едут к переходу: ${tr.moving}`];
  if (tr.speeding) foot.push(`превышают: ${tr.speeding}`);
  if (tr.stopped) foot.push(`стоят: ${tr.stopped}`);
  foot.push(`на переход ≈ ${Math.ceil(ped.crossTime)} с`);
  setText($(root, '.foot'), foot.join(' · '));

  // полоса сближения: машина едет слева направо к переходу
  const car = $(root, '.approach .car');
  if (v) {
    const p = 1 - Math.min(1, v.distance / 150);
    car.style.left = `${(p * 92).toFixed(1)}%`;
    car.hidden = false;
  } else {
    car.hidden = true;
  }
}

const NOUN = { person: 'ПЕШЕХОД', animal: 'ЖИВОТНОЕ' };
const iconOf = (t) => (t.kind === 'person' ? '🚶' : t.large ? '🦌' : '🐕');

export function buildLanes(root, lanes) {
  const box = $(root, '.lanes');
  if (Number(box.dataset.lanes) === lanes) return;
  box.dataset.lanes = lanes;
  box.innerHTML = '';
  const cell = (cls, key, caption) => {
    const el = document.createElement('div');
    el.className = `lane ${cls}`;
    el.dataset.key = key;
    el.innerHTML = `<span class="icon"></span><span class="cap">${caption}</span>`;
    box.appendChild(el);
  };
  // глазами водителя: слева обочина, затем полосы N…1, справа обочина
  cell('side', 'left', '');
  for (let i = lanes; i >= 1; i--) cell('', String(i), String(i));
  cell('side', 'right', '');
}

export function renderDrvBoard(root, drv, cfg) {
  buildLanes(root, cfg.lanes);
  const t = drv.target;
  root.dataset.level = drv.level;
  root.dataset.target = t ? 'yes' : 'no';

  let head = 'ПЕРЕХОД СВОБОДЕН';
  let sub = 'Счастливого пути';
  let where = '';
  let activeKey = null;
  if (t) {
    const noun = NOUN[t.kind];
    const big = t.large ? 'КРУПНОЕ · ' : '';
    if (t.zone === 'road') {
      head = `${noun} НА ДОРОГЕ`;
      where = `${big}ПОЛОСА ${t.lane}`;
      activeKey = String(t.lane);
      sub = drv.level === 'brake' ? 'ТОРМОЗИТЕ!' : 'СНИЗЬТЕ СКОРОСТЬ';
    } else {
      head = `${noun} У ДОРОГИ`;
      where = big + (t.side === 'right' ? 'СПРАВА' : 'СЛЕВА');
      activeKey = t.side;
      sub = 'БУДЬТЕ ВНИМАТЕЛЬНЫ';
    }
  } else if (drv.speeding) {
    head = 'СНИЗЬТЕ СКОРОСТЬ';
    sub = `ОГРАНИЧЕНИЕ ${cfg.speedLimit} км/ч`;
  }
  setText($(root, '.headline'), head);
  setText($(root, '.sub'), sub);
  setText($(root, '.where'), where);
  // расстояние округляем до 5 м — водителю не нужна ложная точность
  setText($(root, '[data-m=dist]'), t ? String(Math.max(5, Math.round(t.distance / 5) * 5)) : '—');
  setText($(root, '[data-m=speed]'),
    drv.vehicleSpeedKmh != null
      ? `Скорость автомобиля: ${Math.round(drv.vehicleSpeedKmh)} км/ч${drv.speeding ? ' — ПРЕВЫШЕНИЕ' : ''}`
      : '');
  $(root, '.speed').classList.toggle('over', drv.speeding);

  for (const el of root.querySelectorAll('.lane')) {
    const on = el.dataset.key === activeKey;
    el.classList.toggle('active', on);
    setText($(el, '.icon'), on ? iconOf(t) : '');
  }
}
