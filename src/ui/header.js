// Cabeçalho compartilhado: menu do celular e tema que acompanha a seção
// embaixo dele (seções escuras marcadas com data-head="dark").
export function initHeader() {
  const head = document.querySelector('.site-head');
  const nav = head?.querySelector('.site-nav');
  if (!head) return;
  if (nav) {
    nav.id ||= 'menu-principal';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'menu-btn';
    btn.setAttribute('aria-label', 'Abrir menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', nav.id);
    btn.innerHTML = '<i aria-hidden="true"></i>';
    head.appendChild(btn);
    const set = (open) => {
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      head.classList.toggle('menu-open', open);
    };
    btn.addEventListener('click', () => set(!nav.classList.contains('open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); btn.focus(); } });
    addEventListener('scroll', () => { if (nav.classList.contains('open')) set(false); }, { passive: true });
    document.addEventListener('click', (e) => { if (nav.classList.contains('open') && !head.contains(e.target)) set(false); });
  }
  // tema: claro ou escuro conforme o que está logo abaixo do cabeçalho
  let raf = 0;
  const probe = () => {
    raf = 0;
    const y = head.offsetHeight + 2;
    let dark = false;
    for (const el of document.elementsFromPoint(innerWidth / 2, y)) {
      if (head.contains(el)) continue;
      const s = el.closest('[data-head]');
      if (s) { dark = s.dataset.head === 'dark'; break; }
    }
    head.classList.toggle('on-dark', dark || head.classList.contains('menu-open'));
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(probe); };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  head.addEventListener('transitionend', queue);
  queue();
  return { refresh: queue };
}
