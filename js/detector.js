// Камера телефона + нейросеть COCO-SSD (TensorFlow.js), всё работает прямо в браузере.
// Библиотеки лежат в папке vendor/, веса модели (~20 МБ) браузер скачивает с серверов Google
const TFJS = 'vendor/tf.min.js';
const COCO = 'vendor/coco-ssd.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Не удалось загрузить ' + src));
    document.head.appendChild(el);
  });
}

export class Detector {
  constructor(video) {
    this.video = video;
    this.model = null;
    this.stream = null;
    this.running = false;
  }

  async start(onStatus = () => {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Камера недоступна. Страница должна быть открыта по HTTPS.');
    }
    onStatus('Запрашиваю доступ к камере…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    if (!this.model) {
      onStatus('Загружаю нейросеть (около 20 МБ при первом запуске)…');
      await loadScript(TFJS);
      await loadScript(COCO);
      this.model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    }
    this.running = true;
    onStatus('');
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  async detect(minScore) {
    if (!this.running || this.video.readyState < 2) return [];
    return this.model.detect(this.video, 50, Math.min(minScore, 0.3));
  }
}
