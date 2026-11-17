// Настройки макета. Хранятся в localStorage телефона.
export const DEFAULTS = {
  lanes: 2,            // число полос на контролируемой проезжей части
  laneWidth: 3.5,      // ширина полосы, м
  camToCross: 5,       // расстояние от камеры до перехода вдоль дороги, м
  camSide: 'right',    // у какой обочины стоит камера (с точки зрения водителя)
  camOffset: 1,        // отступ камеры от края проезжей части, м
  boardDistance: 100,  // табло водителя стоит за столько метров до перехода
  hfov: 69,            // угол обзора камеры по длинной стороне кадра, градусы (Xiaomi 11T, основная камера)
  speedLimit: 60,      // разрешённая скорость, км/ч
  walkSpeed: 1.2,      // скорость пешехода, м/с
  reactionTime: 1.0,   // время реакции водителя, с
  decel: 6.0,          // экстренное замедление, м/с²
  margin: 2.0,         // запас времени для пешехода, с
  minScore: 0.45,      // порог уверенности детектора
  sound: true,
  voice: true,          // голосовые объявления
  notifyMode: 'button', // оповещение служб при ДТП: 'button' — по нажатию на табло, 'auto' — само
};

const KEY = 'tablo.settings.v1';

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* приватный режим */ }
}
