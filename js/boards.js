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

export function renderPedBoard(root, ped) {
  const v = ped.vehicle;
  let [head, sub] = PED_TEXT[ped.level];
  if (ped.critical) {
    head = 'ОПАСНОСТЬ!';
    sub = v && !v.canStop ? 'Автомобиль не успеет остановиться!' : 'Автомобиль близко — освободите дорогу';
  } else if (ped.level === 'danger' && v && !v.canStop) {
    sub = 'Автомобиль не успеет остановиться';
  } else if (ped.level === 'clear' && ped.stopped) {
    sub = 'Автомобиль остановился';
  }
  root.dataset.level = ped.critical ? 'critical' : ped.level;
  setText($(root, '.headline'), head);
  setText($(root, '.sub'), sub);

  setText($(root, '[data-m=speed]'), v ? String(Math.round(v.speedKmh)) : '—');
  setText($(root, '[data-m=dist]'), v ? String(Math.round(v.distance)) : '—');
  setText($(root, '[data-m=ttc]'), v ? (v.ttc < 10 ? v.ttc.toFixed(1) : String(Math.round(v.ttc))) : '—');
  setText($(root, '.foot'), `На переход нужно около ${Math.ceil(ped.crossTime)} с`);

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
const ICON = { person: '🚶', animal: '🐕' };

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

  let head = 'ПЕРЕХОД СВОБОДЕН';
  let sub = 'Счастливого пути';
  let where = '';
  let activeKey = null;
  if (t) {
    const noun = NOUN[t.kind];
    if (t.zone === 'road') {
      head = `${noun} НА ДОРОГЕ`;
      where = `ПОЛОСА ${t.lane}`;
      activeKey = String(t.lane);
      sub = drv.level === 'brake' ? 'ТОРМОЗИТЕ!' : 'СНИЗЬТЕ СКОРОСТЬ';
    } else {
      head = `${noun} У ДОРОГИ`;
      where = t.side === 'right' ? 'СПРАВА' : 'СЛЕВА';
      activeKey = t.side;
      sub = 'БУДЬТЕ ВНИМАТЕЛЬНЫ';
    }
  }
  setText($(root, '.headline'), head);
  setText($(root, '.sub'), sub);
  setText($(root, '.where'), where);
  // расстояние округляем до 5 м — водителю не нужна ложная точность
  setText($(root, '[data-m=dist]'), t ? String(Math.max(5, Math.round(t.distance / 5) * 5)) : '—');
  setText($(root, '[data-m=speed]'),
    drv.vehicleSpeedKmh != null ? `Скорость автомобиля: ${Math.round(drv.vehicleSpeedKmh)} км/ч` : '');

  for (const el of root.querySelectorAll('.lane')) {
    const on = el.dataset.key === activeKey;
    el.classList.toggle('active', on);
    setText($(el, '.icon'), on ? ICON[t.kind] : '');
  }
}
