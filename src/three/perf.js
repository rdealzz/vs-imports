// Utilidades de desempenho compartilhadas pelos canvas WebGL.
export const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ajuste de resolução adaptativo: se os quadros passam do orçamento por
// N quadros seguidos, reduz a escala; se sobram, sobe devagar.
export class AdaptiveScale {
  constructor({ max = 2, min = 0.6, budget = 20, window = 24, onChange }) {
    this.max = max; this.min = min; this.budget = budget; this.window = window;
    this.value = max; this.slow = 0; this.fast = 0; this.onChange = onChange; this.last = 0;
  }
  tick(now) {
    const dt = this.last ? now - this.last : 16;
    this.last = now;
    if (dt > 100) return; // aba voltou, ignora
    if (dt > this.budget) { this.slow++; this.fast = 0; } else if (dt < 12) { this.fast++; this.slow = 0; } else { this.slow = 0; this.fast = 0; }
    if (this.slow >= this.window && this.value > this.min) {
      this.value = Math.max(this.min, this.value * 0.85); this.slow = 0; this.onChange?.(this.value);
    } else if (this.fast >= this.window * 6 && this.value < this.max) {
      this.value = Math.min(this.max, this.value * 1.08); this.fast = 0; this.onChange?.(this.value);
    }
  }
  reset() { this.last = 0; }
}

// Observa se o elemento está na tela (com margem) e chama cb(visible).
export function watchVisible(el, cb, margin = '100px') {
  let onScreen = false;
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; cb(onScreen && !document.hidden); }, { rootMargin: margin });
  io.observe(el);
  document.addEventListener('visibilitychange', () => cb(onScreen && !document.hidden));
  return () => io.disconnect();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

// ---- "pré-aquecimento" da GPU em pedaços pequenos, só quando a página está parada
let lastScroll = 0;
addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true, capture: true });
addEventListener('wheel', () => { lastScroll = performance.now(); }, { passive: true, capture: true });
addEventListener('touchmove', () => { lastScroll = performance.now(); }, { passive: true, capture: true });
// espera a pessoa parar de rolar e o navegador ficar ocioso
export function quiet(ms = 350) {
  return new Promise((res) => {
    const check = () => {
      const left = ms - (performance.now() - lastScroll);
      if (left > 0) { setTimeout(check, left + 20); return; }
      if ('requestIdleCallback' in window) requestIdleCallback((d) => (d.timeRemaining() > 8 || d.didTimeout ? res() : setTimeout(check, 30)), { timeout: 1500 });
      else setTimeout(res, 16);
    };
    check();
  });
}
// sobe as texturas uma por vez e faz um primeiro desenho de 1 pixel (sombra,
// geometria e estados ficam prontos): quando a cena aparecer, não trava
export async function warmup(renderer, scene, camera, { before, after } = {}) {
  const texs = new Set();
  scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => m && Object.values(m).forEach((v) => v?.isTexture && texs.add(v))); });
  if (scene.environment?.isTexture) texs.add(scene.environment);
  for (const t of texs) { await quiet(); try { renderer.initTexture(t); } catch {} }
  await quiet();
  before?.();
  const sc = renderer.getScissorTest();
  renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1);
  try { renderer.render(scene, camera); } catch {}
  renderer.setScissorTest(sc);
  after?.();
}
