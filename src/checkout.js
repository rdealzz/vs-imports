// Página única de finalização: conta, entrega (endereço salvo), pagamento e
// resumo. O pedido é criado no banco (place_order), que confere preço,
// promoção, estoque e os 5% da primeira compra e baixa o estoque na hora.
import { STORE, brl, img } from './data/products.js';
import { loadCatalog } from './data/catalog.js';
import { supabase, hasSupabase, friendly } from './lib/supabase.js';
import { initAuth, auth, openAuth } from './ui/auth.js';
import { bag } from './ui/bag.js';
import { listAddresses, formHTML, bindForm, addressLine } from './ui/addresses.js';
import { renderFooter } from './ui/footer.js';

// quando o Mercado Pago estiver integrado, troque para true
const MP_ONLINE = false;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let catalog = [], eligible = false, addresses = [], addrId = null;
const find = (id) => catalog.find((p) => p.id === id);
const delivery = () => document.querySelector('[name=delivery]:checked').value;
const pay = () => document.querySelector('[name=pay]:checked').value;

function step(n) { document.querySelectorAll('.co-steps li').forEach((li) => li.classList.toggle('on', +li.dataset.step <= n)); }

function renderConta() {
  const box = $('#conta');
  if (!auth.user) {
    box.innerHTML = `<p>Entre ou crie sua conta para finalizar. Na primeira compra você ganha <b>5% de desconto</b>.</p>
      <div class="row"><button class="pill solid" type="button" data-co-login="criar">Criar conta e ganhar 5%</button><button class="pill" type="button" data-co-login="entrar">Já tenho conta</button></div>`;
  } else {
    const p = auth.profile || {};
    box.innerHTML = `<div class="who"><b>${esc(p.full_name || auth.user.email)}</b><span>${esc(auth.user.email)}${p.phone ? ' · ' + esc(p.phone) : ''}</span></div>
      ${p.phone ? '' : '<p class="co-warn">Sua conta não tem WhatsApp cadastrado: fale com a gente para liberar o desconto de primeira compra.</p>'}`;
  }
}

async function renderAddr() {
  const box = $('#addr');
  box.hidden = delivery() !== 'entrega';
  if (box.hidden) return;
  if (!auth.user) { box.innerHTML = '<p class="small">Entre na sua conta para escolher o endereço.</p>'; return; }
  box.innerHTML = '<p class="small">Carregando seus endereços…</p>';
  try { addresses = await listAddresses(); } catch (err) { box.innerHTML = `<p class="co-warn">${friendly(err)}</p>`; return; }
  if (!addresses.some((a) => a.id === addrId)) addrId = addresses[0]?.id ?? null;
  const showForm = (a = {}) => {
    box.innerHTML = `<h3>${a.id ? 'Editar endereço' : 'Novo endereço de entrega'}</h3>${formHTML(a)}`;
    bindForm(box.querySelector('form'), { id: a.id || null, onSaved: (s) => { addrId = s.id; renderAddr(); refresh(); }, onCancel: () => renderAddr() });
    box.querySelector('input').focus();
  };
  if (!addresses.length) { showForm({ recipient: auth.profile?.full_name || '', is_default: true }); return; }
  box.innerHTML = `<ul class="addr-pick">${addresses.map((a) => `<li><label class="opt"><input type="radio" name="addr" value="${a.id}"${a.id === addrId ? ' checked' : ''}>
      <span><b>${esc(a.label)}${a.is_default ? ' <em class="tag">Principal</em>' : ''}</b><small>${esc(a.recipient)}<br>${addressLine(a)}</small></span></label>
      <button class="link" type="button" data-edit="${a.id}">Editar</button></li>`).join('')}</ul>
    <button class="link add" type="button" data-new-addr>+ Adicionar outro endereço</button>`;
  box.querySelectorAll('[name=addr]').forEach((r) => r.addEventListener('change', () => { addrId = +r.value; refresh(); }));
  box.querySelector('[data-new-addr]').onclick = () => showForm({ recipient: auth.profile?.full_name || '' });
  box.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => showForm(addresses.find((a) => a.id === +b.dataset.edit))));
}

function renderPay() {
  const pickup = delivery() === 'retirada';
  const naLoja = document.querySelector('[data-only-pickup]');
  naLoja.hidden = !pickup;
  if (!pickup && pay() === 'Na loja') document.querySelector('[name=pay][value=Pix]').checked = true;
  $('#card').hidden = pay() !== 'Cartão';
  $('#pay-note').innerHTML = MP_ONLINE ? 'Você paga com segurança na próxima tela, pelo Mercado Pago.'
    : pay() === 'Na loja' ? 'Separamos suas peças e você paga quando vier buscar.'
    : `Ao confirmar, suas peças ficam <b>reservadas por 48 horas</b> e enviamos o ${pay() === 'Pix' ? 'Pix' : 'link de pagamento seguro do cartão'} pelo WhatsApp.`;
  document.querySelector('.trust-t').lastChild.textContent = MP_ONLINE ? 'Pagamento protegido pelo Mercado Pago' : 'Compra segura · pagamento pelo Mercado Pago';
}

function renderSummary() {
  const list = bag.items.filter((i) => find(i.id));
  $('#items').innerHTML = list.length ? list.map((i) => {
    const p = find(i.id);
    const pic = p.photos?.[0] || img(p.id, i.ci ? 'card-' + i.ci : 'card');
    return `<li><span class="ph"><img src="${pic}" alt="" width="64" height="64"><i>${i.qty}</i></span>
      <span class="nm"><b>${esc(p.name)}</b><small>${esc([i.color, i.size].filter(Boolean).join(' · '))}</small></span>
      <span class="pr">${p.compareAt ? `<s>${brl(p.compareAt * i.qty)}</s>` : ''}${brl(p.finalPrice * i.qty)}</span></li>`;
  }).join('') : `<li class="empty">Sua sacola está vazia. <a href="./#catalogo">Ver o catálogo</a></li>`;
  const sub = list.reduce((s, i) => s + find(i.id).finalPrice * i.qty, 0);
  const disc = eligible ? Math.round(sub * 5) / 100 : 0;
  $('#tot').innerHTML = `<div><dt>Subtotal</dt><dd>${brl(sub)}</dd></div>
    ${eligible ? `<div class="gold"><dt>Primeira compra (−5%)</dt><dd>−${brl(disc)}</dd></div>` : !auth.user && list.length ? '<div class="hint"><dt>Crie sua conta e ganhe 5% na 1ª compra</dt><dd></dd></div>' : ''}
    <div><dt>${delivery() === 'entrega' ? 'Frete' : 'Retirada na loja'}</dt><dd>${delivery() === 'entrega' ? 'a combinar' : 'grátis'}</dd></div>
    <div class="t"><dt>Total</dt><dd>${brl(sub - disc)}</dd></div>`;
  return list;
}

function refresh() {
  renderPay();
  const list = renderSummary();
  const go = $('#go');
  const needAddr = delivery() === 'entrega' && !addrId;
  go.disabled = !list.length || (auth.user && needAddr);
  go.textContent = !auth.user ? 'Entrar para finalizar' : needAddr ? 'Cadastre o endereço de entrega' : MP_ONLINE ? 'Ir para o pagamento' : 'Confirmar pedido';
  step(!auth.user ? 1 : needAddr ? 2 : 3);
}

async function submit() {
  const msg = $('#msg'), go = $('#go');
  if (!hasSupabase) { msg.textContent = 'Finalização indisponível no momento.'; return; }
  if (!auth.user) { openAuth('criar', { reason: 'Crie sua conta para finalizar e ganhe <b>5% de desconto</b> na primeira compra.' }); return; }
  const items = bag.items.filter((i) => find(i.id));
  const del = delivery();
  go.disabled = true; msg.textContent = 'Reservando suas peças…';
  const notes = [`Pagamento: ${pay()}`, $('#notes').value.trim()].filter(Boolean).join(' · ');
  const { data: o, error } = await supabase.rpc('place_order', {
    items: items.map((i) => ({ id: i.id, qty: i.qty, color: i.color, size: i.size })),
    p_delivery: del, p_notes: notes, p_address_id: del === 'entrega' ? addrId : null,
  });
  if (error) { msg.textContent = friendly(error); go.disabled = false; catalog = await loadCatalog({ fresh: true }); refresh(); return; }
  const a = del === 'entrega' ? addresses.find((x) => x.id === addrId) : null;
  const lines = items.map((i) => `• ${i.qty}x ${find(i.id)?.name} (${[i.color, i.size].filter(Boolean).join(', ')})`);
  const text = [`Olá, VS Imports! Fiz o pedido #${o.number} pelo site:`, ...lines,
    `Total: ${brl(+o.total)}${+o.discount ? ` (com ${brl(+o.discount)} de desconto)` : ''}`, `Pagamento: ${pay()}`,
    a ? `Entrega: ${a.street}, ${a.number}${a.complement ? ' ' + a.complement : ''} - ${a.district}, ${a.city}/${a.state}, CEP ${a.cep}` : 'Vou retirar na loja.'].join('\n');
  bag.clear();
  step(4);
  $('#co').hidden = true;
  const done = $('#done'); done.hidden = false;
  done.innerHTML = `<img src="${import.meta.env.BASE_URL}brand/vs-logo.svg" alt="" width="120" height="120">
    <p class="eyebrow">Pedido confirmado</p><h1>Pedido #${o.number}</h1>
    <p>Total <b>${brl(+o.total)}</b>${+o.discount ? `, você economizou ${brl(+o.discount)}` : ''}. Suas peças estão reservadas por 48 horas.</p>
    <p>${del === 'entrega' ? 'Envie a mensagem abaixo para combinarmos o frete e o pagamento.' : 'Envie a mensagem abaixo e combine o horário da retirada.'}</p>
    <a class="pill solid lg" href="https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
    <p class="small">Acompanhe em <b>Minha conta → Meus pedidos</b>. <a href="${STORE.vipGroup}" target="_blank" rel="noopener">Entre no grupo VIP</a> e receba as próximas ofertas antes de todo mundo.</p>`;
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function onAuth() {
  eligible = false;
  if (hasSupabase && auth.user) { const { data } = await supabase.rpc('first_purchase_eligible'); eligible = !!data; }
  renderConta(); await renderAddr(); refresh();
}

document.addEventListener('change', (e) => {
  if (e.target.name === 'delivery') { renderAddr().then(refresh); refresh(); }
  if (e.target.name === 'pay') refresh();
});
document.addEventListener('click', (e) => {
  const l = e.target.closest('[data-co-login]'); if (l) openAuth(l.dataset.coLogin);
});
$('#go').addEventListener('click', submit);

renderFooter(undefined, { home: './' });
catalog = await loadCatalog();
refresh();
initAuth().then(() => auth.on(() => onAuth()));
