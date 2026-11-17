// Отрисовка двух табло по результату assess().
import { incidentDetail, incidentStatus } from './incident.js';

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

// Экран происшествия поверх табло пешехода
function renderIncident(root, inc) {
  const box = $(root, '.incident');
  box.hidden = !inc;
  if (!inc) return;
  setText($(box, '.inc-cause'), inc.cause);
  setText($(box, '.inc-detail'), incidentDetail(inc));
  const done = !!inc.notified;
  $(box, '.inc-call').hidden = done;
  const st = $(box, '.inc-status');
  st.hidden = !done;
  if (done) {
    const at = new Date(inc.notified.time).toLocaleTimeString('ru-RU');
    const how = inc.notified.by === 'auto' ? 'автоматически' : 'по нажатию на табло';
    setText(st, `✔ ${incidentStatus(inc)} · ${at} · ${how}`);
  }
}

export function renderPedBoard(root, ped, incident = null) {
  renderIncident(root, incident);
  if (incident) { root.dataset.level = 'incident'; return; }
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

  renderApproach($(root, '.approach'), ped.vehicles, v);
  renderCarList($(root, '.cars'), ped.vehicles, v);
}

// Полоса сближения: все машины в поле распознавания едут слева направо к переходу
function renderApproach(box, list, threat) {
  const keep = new Set();
  for (const c of list) {
    const key = String(c.id);
    keep.add(key);
    let el = box.querySelector(`[data-id="${key}"]`);
    if (!el) {
      el = document.createElement('i');
      el.className = 'car';
      el.dataset.id = key;
      box.prepend(el);
    }
    const p = 1 - Math.min(1, c.distance / 150);
    el.style.left = `${(p * 92).toFixed(1)}%`;
    el.style.background = c.colorCss || '';
    el.classList.toggle('main', !!threat && c.id === threat.id);
    el.classList.toggle('bad', c.reckless || c.speeding);
  }
  for (const el of box.querySelectorAll('.car')) if (!keep.has(el.dataset.id)) el.remove();
}

const ROWS = 4;

// Список всех машин: цвет, полоса, скорость, расстояние, время до перехода, нарушения
function renderCarList(box, list, threat) {
  const rows = list.slice(0, ROWS).map((c) => {
    const flags = [c.ranRed && 'красный свет', c.weaving && 'виляет', c.speeding && 'превышение'].filter(Boolean);
    const time = c.stopped ? 'стоит' : c.ttc == null ? 'проезжает' : `${c.ttc < 10 ? c.ttc.toFixed(1) : Math.round(c.ttc)} с`;
    return {
      key: `${c.id}|${c.colorCss}|${c.lvl}|${!!threat && c.id === threat.id}`,
      cells: [
        [c.color, c.label].filter(Boolean).join(' ').toLowerCase(),
        c.lane ? `пол. ${c.lane}` : '',
        c.stopped ? '0 км/ч' : `${Math.round(c.speedKmh)} км/ч`,
        `${Math.round(c.distance)} м`,
        time,
      ],
      flags: flags.join(', '),
      c,
    };
  });
  if (list.length > ROWS) rows.push({ more: `и ещё ${list.length - ROWS}` });

  // перестраиваем только при изменении набора строк, иначе меняем текст
  const sig = rows.map((r) => r.key || r.more).join(';');
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = '';
    for (const r of rows) {
      const row = document.createElement('div');
      if (r.more) {
        row.className = 'row more';
        row.textContent = r.more;
      } else {
        row.className = `row l${r.c.lvl}` + (threat && r.c.id === threat.id ? ' main' : '');
        const sw = document.createElement('i');
        if (r.c.colorCss) sw.style.background = r.c.colorCss;
        row.appendChild(sw);
        for (let k = 0; k < 6; k++) row.appendChild(document.createElement('span'));
      }
      box.appendChild(row);
    }
  }
  box.hidden = rows.length === 0;
  [...box.children].forEach((row, i) => {
    const r = rows[i];
    if (!r || r.more) return;
    const spans = row.querySelectorAll('span');
    r.cells.forEach((t, k) => setText(spans[k], t));
    setText(spans[5], r.flags);
  });
}

const iconOf = (t) => (t.kind === 'person' ? '🚶' : t.large ? '🦌' : '🐕');
const laneIcons = (c) =>
  (c.people ? '🚶' : '') + (c.animals ? (c.large ? '🦌' : '🐕') : '');

// «ПОЛОСЫ 1 И 2», «ПОЛОСЫ 1, 2 И 3»
function lanesText(list) {
  if (list.length === 1) return `ПОЛОСА ${list[0]}`;
  return `ПОЛОСЫ ${list.slice(0, -1).join(', ')} И ${list[list.length - 1]}`;
}

// Заголовок по тому, кто на дороге
function roadHead({ people, animals }) {
  if (people && animals) return 'ЛЮДИ И ЖИВОТНЫЕ НА ДОРОГЕ';
  if (people > 1) return 'ПЕШЕХОДЫ НА ДОРОГЕ';
  if (people) return 'ПЕШЕХОД НА ДОРОГЕ';
  return animals > 1 ? 'ЖИВОТНЫЕ НА ДОРОГЕ' : 'ЖИВОТНОЕ НА ДОРОГЕ';
}

export function buildLanes(root, lanes) {
  const box = $(root, '.lanes');
  if (Number(box.dataset.lanes) === lanes) return;
  box.dataset.lanes = lanes;
  box.innerHTML = '';
  const cell = (cls, key, caption) => {
    const el = document.createElement('div');
    el.className = `lane ${cls}`;
    el.dataset.key = key;
    el.innerHTML = '<span class="icon"></span><span class="n"></span><span class="ld"></span>' +
      `<span class="cap">${caption}</span>`;
    box.appendChild(el);
  };
  // глазами водителя: слева обочина, затем полосы N…1, справа обочина
  cell('side', 'left', '');
  for (let i = lanes; i >= 1; i--) cell('', String(i), String(i));
  cell('side', 'right', '');
}

const round5 = (d) => Math.max(5, Math.round(d / 5) * 5);

export function renderDrvBoard(root, drv, cfg, incident = null) {
  buildLanes(root, cfg.lanes);
  const t = drv.target;
  const sm = drv.summary;
  root.dataset.level = drv.level;
  root.dataset.target = t ? 'yes' : 'no';

  let head = 'ПЕРЕХОД СВОБОДЕН';
  let sub = 'Счастливого пути';
  let where = '';
  let cells = drv.lanes; // какие полосы подсвечивать
  let dist = t ? t.distance : null;
  let note = drv.vehicleSpeedKmh != null
    ? `Скорость автомобиля: ${Math.round(drv.vehicleSpeedKmh)} км/ч${drv.speeding ? ' — ПРЕВЫШЕНИЕ' : ''}`
    : '';
  if (incident) {
    root.dataset.level = 'brake';
    root.dataset.target = 'yes';
    head = 'ДТП ВПЕРЕДИ';
    sub = 'СНИЗЬТЕ СКОРОСТЬ';
    where = incident.lane ? `ПОЛОСА ${incident.lane}` : '';
    cells = incident.lane ? { [incident.lane]: { key: String(incident.lane), count: 1, incident: true } } : {};
    dist = Math.max(0, cfg.boardDistance - incident.s);
    note = incidentStatus(incident);
  } else if (t && t.zone === 'road') {
    head = roadHead(sm);
    const big = sm.large ? 'КРУПНОЕ · ' : '';
    where = big + (sm.allLanes && cfg.lanes > 1 ? 'ВСЕ ПОЛОСЫ' : lanesText(sm.roadLanes));
    if (sm.roadside) where += ' · И У ОБОЧИНЫ';
    // заняты все полосы — объехать нельзя, поэтому «остановитесь», а не «тормозите»
    sub = drv.level !== 'brake' ? 'СНИЗЬТЕ СКОРОСТЬ' : sm.allLanes ? 'ОСТАНОВИТЕСЬ!' : 'ТОРМОЗИТЕ!';
    if (drv.all.length > 1) note = `На дороге и у дороги: ${drv.all.length} · ${note}`;
  } else if (t) {
    const noun = { person: 'ПЕШЕХОД', animal: 'ЖИВОТНОЕ' }[t.kind];
    head = drv.all.length > 1 ? 'ЛЮДИ У ДОРОГИ' : `${noun} У ДОРОГИ`;
    if (drv.all.length > 1 && drv.all.every((b) => b.kind === 'animal')) head = 'ЖИВОТНЫЕ У ДОРОГИ';
    const sides = [...new Set(drv.all.map((b) => b.side))];
    where = (t.large ? 'КРУПНОЕ · ' : '') +
      (sides.length > 1 ? 'С ОБЕИХ СТОРОН' : sides[0] === 'right' ? 'СПРАВА' : 'СЛЕВА');
    sub = 'БУДЬТЕ ВНИМАТЕЛЬНЫ';
  } else if (drv.speeding) {
    head = 'СНИЗЬТЕ СКОРОСТЬ';
    sub = `ОГРАНИЧЕНИЕ ${cfg.speedLimit} км/ч`;
  }
  setText($(root, '.headline'), head);
  setText($(root, '.sub'), sub);
  setText($(root, '.where'), where);
  // расстояние до ближайшего — округляем до 5 м, водителю не нужна ложная точность
  setText($(root, '[data-m=dist]'), dist != null ? String(round5(dist)) : '—');
  setText($(root, '[data-m=speed]'), note);
  $(root, '.speed').classList.toggle('over', !incident && drv.speeding);

  // каждая занятая полоса: значки, число и расстояние до неё (если занято несколько)
  const active = Object.values(cells).filter((c) => !incident || c.incident);
  const several = new Set(active.map((c) => (c.distance != null ? round5(c.distance) : 0))).size > 1;
  for (const el of root.querySelectorAll('.lane')) {
    const c = cells[el.dataset.key];
    el.classList.toggle('active', !!c);
    setText($(el, '.icon'), !c ? '' : c.incident ? '⚠️' : laneIcons(c));
    setText($(el, '.n'), c && c.count > 1 ? `×${c.count}` : '');
    setText($(el, '.ld'), c && several && c.distance != null ? `${round5(c.distance)} м` : '');
  }
}
