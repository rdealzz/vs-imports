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
