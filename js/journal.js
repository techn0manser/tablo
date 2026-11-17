// Журнал событий: нарушения, опасные ситуации, ДТП, оповещения служб.
const KEY = 'tablo.journal.v1';
const MAX = 300;

export class Journal {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.seen = new Set(); // чтобы одно нарушение одной машины не писалось каждый кадр
    try { this.entries = JSON.parse(storage?.getItem(KEY) || '[]'); } catch { this.entries = []; }
  }

  // key — необязательный ключ для защиты от повторов
  add(type, text, { key, time = Date.now() } = {}) {
    if (key) {
      if (this.seen.has(key)) return false;
      this.seen.add(key);
    }
    this.entries.push({ time, type, text });
    if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX);
    this.save();
    return true;
  }

  forget() { this.seen.clear(); }

  clear() { this.entries = []; this.seen.clear(); this.save(); }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.entries)); } catch { /* нет места или приватный режим */ }
  }

  toCSV() {
    const q = (t) => `"${String(t).replace(/"/g, '""')}"`;
    const rows = this.entries.map((e) => [new Date(e.time).toLocaleString('ru-RU'), e.type, e.text].map(q).join(';'));
    return '﻿' + ['"Время";"Событие";"Описание"', ...rows].join('\r\n');
  }
}
