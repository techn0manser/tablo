// Звуковой сигнал для пешехода (Web Audio). Браузер разрешает звук только
// после нажатия пользователя, поэтому unlock() вызывается из кнопки запуска.
export class Beeper {
  constructor() {
    this.ctx = null;
    this.level = 'off';
    this.timer = null;
    this.flip = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  beep(freq, dur, vol = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.setValueAtTime(vol, t + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // level: 'off' | 'warn' | 'danger' | 'critical' | 'incident'
  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    clearInterval(this.timer);
    this.timer = null;
    if (level === 'warn') {
      this.beep(660, 0.18, 0.3); // одиночный сигнал «внимание»
    } else if (level === 'danger') {
      const tick = () => { this.beep(880, 0.16); navigator.vibrate?.(100); };
      tick();
      this.timer = setInterval(tick, 500);
    } else if (level === 'incident') {
      // двухтональный сигнал происшествия, редкий — чтобы было слышно голос
      const tick = () => { this.beep(700, 0.25, 0.4); setTimeout(() => this.beep(520, 0.3, 0.4), 280); };
      tick();
      this.timer = setInterval(tick, 3000);
    } else if (level === 'critical') {
      const tick = () => {
        this.flip = !this.flip;
        this.beep(this.flip ? 1250 : 950, 0.16, 0.7);
        navigator.vibrate?.(120);
      };
      tick();
      this.timer = setInterval(tick, 200);
    }
  }
}

// Голосовые объявления (синтез речи браузера, русский голос телефона)
export class Voice {
  constructor() {
    this.last = '';
    this.lastT = 0;
    this.ok = typeof speechSynthesis !== 'undefined';
  }

  // Одну и ту же фразу не повторяем чаще, чем раз в gap секунд
  say(text, gap = 8) {
    if (!this.ok || !text) return;
    const now = Date.now();
    if (text === this.last && now - this.lastT < gap * 1000) return;
    this.last = text;
    this.lastT = now;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  stop() {
    if (this.ok) speechSynthesis.cancel();
    this.last = '';
  }
}
