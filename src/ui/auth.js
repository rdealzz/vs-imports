// Login, cadastro e "minha conta" (Supabase Auth), compartilhado pelas páginas.
import { supabase, hasSupabase, friendly } from '../lib/supabase.js';
import { brl } from '../data/products.js';

let user = null, profile = null;
const subs = new Set();
export const auth = {
  get user() { return user; }, get profile() { return profile; },
  get isStaff() { return ['vendedor', 'dono'].includes(profile?.role); },
  get isOwner() { return profile?.role === 'dono'; },
  on(fn) { subs.add(fn); fn(user, profile); },
};
const emit = () => subs.forEach((f) => f(user, profile));

async function loadProfile() {
  if (!user) { profile = null; return; }
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  profile = data;
}

const MODAL = `
<div class="auth" id="auth" hidden>
  <div class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-t">
    <button class="round auth-x" type="button" data-auth-close aria-label="Fechar">×</button>
    <img class="auth-logo" src="${import.meta.env.BASE_URL}brand/vs-icon.svg" alt="" width="56" height="56">
    <h2 id="auth-t">Entrar</h2>
    <p class="auth-sub" id="auth-sub">Ganhe <b>5% de desconto</b> na sua primeira compra.</p>
    <div class="auth-tabs" role="tablist">
      <button role="tab" data-tab="entrar" aria-selected="true">Entrar</button>
      <button role="tab" data-tab="criar" aria-selected="false">Criar conta</button>
    </div>
    <form class="auth-form" id="auth-form" novalidate>
      <label data-only="criar">Nome completo<input name="name" autocomplete="name" maxlength="120"></label>
      <label data-only="criar">WhatsApp<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(41) 9 9999-9999" maxlength="20"></label>
      <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
      <label data-only="entrar criar">Senha<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
      <label class="check" data-only="criar"><input name="optin" type="checkbox" checked> Quero receber os lançamentos</label>
      <p class="auth-msg" id="auth-msg" role="status" aria-live="polite"></p>
      <button class="pill solid block" type="submit" id="auth-go">Entrar</button>
      <button class="link" type="button" data-tab="recuperar" data-only="entrar">Esqueci minha senha</button>
      <button class="link" type="button" data-tab="entrar" data-only="recuperar">Voltar para entrar</button>
    </form>
  </div>
</div>
<div class="auth" id="orders-modal" hidden>
  <div class="auth-panel wide" role="dialog" aria-modal="true" aria-labelledby="ord-t">
    <button class="round auth-x" type="button" data-orders-close aria-label="Fechar">×</button>
    <h2 id="ord-t">Meus pedidos</h2>
    <ul class="my-orders" id="my-orders"></ul>
  </div>
</div>`;

let mode = 'entrar', after = null;
function setMode(m) {
  mode = m;
  const el = document.getElementById('auth');
  el.querySelectorAll('[data-tab][role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === m)));
  el.querySelectorAll('[data-only]').forEach((n) => { n.hidden = !n.dataset.only.split(' ').includes(m); });
  el.querySelector('.auth-tabs').hidden = m === 'recuperar';
  el.querySelector('#auth-t').textContent = { entrar: 'Entrar', criar: 'Criar conta', recuperar: 'Recuperar senha' }[m];
  el.querySelector('#auth-go').textContent = { entrar: 'Entrar', criar: 'Criar conta e ganhar 5%', recuperar: 'Enviar link' }[m];
  el.querySelector('[name=password]').autocomplete = m === 'criar' ? 'new-password' : 'current-password';
  el.querySelector('#auth-msg').textContent = '';
}
export function openAuth(m = 'entrar', { reason, then } = {}) {
  if (!hasSupabase) { alert('Login indisponível no momento.'); return; }
  const el = document.getElementById('auth');
  setMode(m); after = then || null;
  if (reason) el.querySelector('#auth-sub').innerHTML = reason;
  el.hidden = false;
  el.querySelector('input:not([hidden])')?.focus();
}
const closeAuth = () => { document.getElementById('auth').hidden = true; };

async function submit(e) {
  e.preventDefault();
  const f = e.target, msg = document.getElementById('auth-msg'), go = document.getElementById('auth-go');
  const email = f.email.value.trim(), password = f.password.value;
  if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Digite um e-mail válido.'; f.email.focus(); return; }
  if (mode !== 'recuperar' && password.length < 6) { msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; f.password.focus(); return; }
  if (mode === 'criar' && f.name.value.trim().length < 2) { msg.textContent = 'Digite seu nome.'; f.name.focus(); return; }
  go.disabled = true; msg.textContent = 'Aguarde…';
  try {
    if (mode === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuth(); after?.();
    } else if (mode === 'criar') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: {
        emailRedirectTo: location.origin + location.pathname,
        data: { full_name: f.name.value.trim(), phone: f.phone.value.trim() },
      } });
      if (error) throw error;
      if (data.session) {
        if (f.optin.checked) await supabase.from('profiles').update({ marketing_opt_in: true }).eq('id', data.user.id);
        closeAuth(); after?.();
      } else msg.innerHTML = 'Conta criada! Enviamos um link para <b>' + email + '</b>. Confirme e depois entre aqui.';
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '?nova-senha=1' });
      if (error) throw error;
      msg.textContent = 'Se o e-mail estiver cadastrado, você vai receber o link em instantes.';
    }
  } catch (err) { msg.textContent = friendly(err); }
  finally { go.disabled = false; }
}

async function showOrders() {
  const m = document.getElementById('orders-modal'), ul = document.getElementById('my-orders');
  m.hidden = false; ul.innerHTML = '<li class="muted">Carregando…</li>';
  const { data, error } = await supabase.from('orders').select('number, created_at, status, total, discount, order_items(name, color, size, qty)').order('created_at', { ascending: false }).limit(30);
  if (error) { ul.innerHTML = `<li class="muted">${friendly(error)}</li>`; return; }
  ul.innerHTML = data.length ? data.map((o) => `<li><div><b>Pedido #${o.number}</b><span class="st st-${o.status}">${o.status}</span></div>
    <small>${new Date(o.created_at).toLocaleString('pt-BR')}</small>
    <p>${o.order_items.map((i) => `${i.qty}x ${i.name}${i.color ? ' ' + i.color : ''}${i.size ? ' ' + i.size : ''}`).join(', ')}</p>
    <b>${brl(+o.total)}</b>${+o.discount ? ` <small>(economizou ${brl(+o.discount)})</small>` : ''}</li>`).join('') : '<li class="muted">Você ainda não fez pedidos.</li>';
}

function renderAccount() {
  document.querySelectorAll('.acct').forEach((n) => n.remove());
  document.querySelectorAll('.site-head .bag-btn').forEach((bag) => {
    const wrap = document.createElement('div'); wrap.className = 'acct';
    if (!user) wrap.innerHTML = '<button class="acct-btn" type="button" data-login>Entrar</button>';
    else {
      const first = (profile?.full_name || user.email).split(/[ @]/)[0];
      wrap.innerHTML = `<button class="acct-btn" type="button" aria-haspopup="true" aria-expanded="false">Olá, ${first}</button>
        <div class="acct-menu" hidden>
          <button type="button" data-my-orders>Meus pedidos</button>
          ${auth.isStaff ? `<a href="${import.meta.env.BASE_URL}admin.html">Painel da loja</a>` : ''}
          <button type="button" data-logout>Sair</button>
        </div>`;
      const btn = wrap.querySelector('.acct-btn'), menu = wrap.querySelector('.acct-menu');
      btn.addEventListener('click', () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
      document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    }
    bag.before(wrap);
  });
}

export async function initAuth() {
  document.body.insertAdjacentHTML('beforeend', MODAL);
  const el = document.getElementById('auth');
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-auth-close]')) closeAuth();
    const t = e.target.closest('[data-tab]'); if (t) { e.preventDefault(); setMode(t.dataset.tab); }
  });
  el.querySelector('#auth-form').addEventListener('submit', submit);
  const om = document.getElementById('orders-modal');
  om.addEventListener('click', (e) => { if (e.target === om || e.target.closest('[data-orders-close]')) om.hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAuth(); om.hidden = true; } });
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-login]')) openAuth('entrar');
    if (e.target.closest('[data-logout]')) { await supabase.auth.signOut(); }
    if (e.target.closest('[data-my-orders]')) showOrders();
  });
  if (!hasSupabase) { renderAccount(); return; }
  const { data } = await supabase.auth.getSession();
  user = data.session?.user || null; await loadProfile(); renderAccount(); emit();
  supabase.auth.onAuthStateChange(async (ev, session) => {
    user = session?.user || null;
    setTimeout(async () => { await loadProfile(); renderAccount(); emit(); }, 0); // fora do callback (recomendação do supabase-js)
    if (ev === 'PASSWORD_RECOVERY') {
      const pw = prompt('Digite a nova senha (mínimo 6 caracteres):');
      if (pw && pw.length >= 6) { const { error } = await supabase.auth.updateUser({ password: pw }); alert(error ? friendly(error) : 'Senha alterada!'); }
    }
  });
}
