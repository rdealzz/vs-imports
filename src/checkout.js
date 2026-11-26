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
import { initHeader } from './ui/header.js';
import { freeBarHTML } from './lib/shipping.js';
import { orderPdf, pdfName, downloadBlob, uploadPdf, waOrderLink } from './lib/orderPdf.js';

// Mercado Pago: liga sozinho quando o token estiver salvo no servidor (pagamento-criar { check })
let MP_ONLINE = false;
const RETURN_ID = new URLSearchParams(location.search).get('pedido');

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let catalog = [], eligible = false, addresses = [], addrId = null, ship = null, shipKey = '', shipOpts = [], quoteId = null;
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
  // frete oficial vem do banco pelo CEP do endereço escolhido
  const a = delivery() === 'entrega' ? addresses.find((x) => x.id === addrId) : null;
  const key = a ? `${a.cep}|${sub}` : '';
  $('#ship-pick').hidden = !a;
  if (a && shipKey !== key) {
    shipKey = key; ship = null; shipOpts = []; quoteId = null; $('#ship-opts').innerHTML = '<li class="small">Calculando o frete…</li>';
    // cotação no servidor (SuperFrete ou tabela da loja); o pedido usa o id da cotação
    supabase.functions.invoke('frete-cotar', { body: { cep: a.cep, items: list.map((i) => ({ id: i.id, qty: i.qty })) } }).then(({ data, error }) => {
      if (shipKey !== key) return;
      if (error || !data?.options?.length) { ship = { price: 0, days: null, err: true }; $('#ship-opts').innerHTML = '<li class="co-warn">Não deu para calcular o frete agora: combinamos pelo WhatsApp.</li>'; renderSummary(); return; }
      shipOpts = data.options; quoteId = shipOpts[0].id;
      $('#ship-opts').innerHTML = shipOpts.map((o, k) => `<li><label class="opt"><input type="radio" name="shipopt" value="${o.id}"${k ? '' : ' checked'}>
        <span><b>${esc(o.name)}${o.company && o.source === 'superfrete' ? ` <small>· ${esc(o.company)}</small>` : ''}</b><small>${o.days ? `até ${o.days} dias úteis` : 'prazo combinado no WhatsApp'}</small></span>
        <strong class="sp">${o.price ? brl(o.price) : '<em class="free">grátis</em>'}</strong></label></li>`).join('');
      ship = { price: shipOpts[0].price, days: shipOpts[0].days ? `até ${shipOpts[0].days} dias úteis` : '', free: data.free };
      renderSummary(); refresh();
    });
  }
  const shipVal = a && ship ? +ship.price : 0;
  const shipTxt = delivery() !== 'entrega' ? 'grátis' : !a ? 'informe o endereço' : !ship ? 'calculando…' : ship.err ? 'a combinar' : ship.free || !shipVal ? '<b class="free">grátis</b>' : brl(shipVal);
  freeBarHTML(list.length ? sub : 0).then((h) => { $('#free').innerHTML = delivery() === 'entrega' ? h : ''; });
  $('#tot').innerHTML = `<div><dt>Subtotal</dt><dd>${brl(sub)}</dd></div>
    ${eligible ? `<div class="gold"><dt>Primeira compra (−5%)</dt><dd>−${brl(disc)}</dd></div>` : !auth.user && list.length ? '<div class="hint"><dt>Crie sua conta e ganhe 5% na 1ª compra</dt><dd></dd></div>' : ''}
    <div><dt>${delivery() === 'entrega' ? `Frete${a && ship?.days ? ` <small>· ${esc(ship.days)}</small>` : ''}` : 'Retirada na loja'}</dt><dd>${shipTxt}</dd></div>
    <div class="t"><dt>Total</dt><dd>${brl(sub - disc + shipVal)}</dd></div>`;
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

document.addEventListener('change', (e) => {
  if (e.target.name !== 'shipopt') return;
  const o = shipOpts.find((x) => x.id === e.target.value); if (!o) return;
  quoteId = o.id; ship = { price: o.price, days: o.days ? `até ${o.days} dias úteis` : '', free: !o.price }; refresh();
});
const cpfDigits = () => $('#cpf').value.replace(/\D/g, '');
function cpfOk(c) {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
$('#cpf')?.addEventListener('input', (e) => { const d = cpfDigits().slice(0, 11); e.target.value = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); });

async function submit() {
  const msg = $('#msg'), go = $('#go');
  if (!hasSupabase) { msg.textContent = 'Finalização indisponível no momento.'; return; }
  if (!auth.user) { openAuth('criar', { reason: 'Crie sua conta para finalizar e ganhe <b>5% de desconto</b> na primeira compra.' }); return; }
  const items = bag.items.filter((i) => find(i.id));
  const del = delivery();
  if (del === 'entrega' && !cpfOk(cpfDigits())) { msg.textContent = 'Digite um CPF válido de quem vai receber (a transportadora exige).'; $('#cpf').focus(); return; }
  go.disabled = true; msg.textContent = 'Reservando suas peças…';
  const notes = [`Pagamento: ${pay()}`, $('#notes').value.trim()].filter(Boolean).join(' · ');
  const { data: o, error } = await supabase.rpc('place_order', {
    items: items.map((i) => ({ id: i.id, qty: i.qty, color: i.color, size: i.size })),
    p_delivery: del, p_notes: notes, p_address_id: del === 'entrega' ? addrId : null,
    p_quote_id: del === 'entrega' ? quoteId : null, p_document: del === 'entrega' ? cpfDigits() : null,
  });
  if (error) { msg.textContent = friendly(error); go.disabled = false; catalog = await loadCatalog({ fresh: true }); refresh(); return; }
  // pagamento online: vai para a tela segura do Mercado Pago (Pix ou cartão)
  if (MP_ONLINE && pay() !== 'Na loja') {
    msg.textContent = 'Abrindo o pagamento seguro do Mercado Pago…';
    const { data: mp } = await supabase.functions.invoke('pagamento-criar', { body: { order_id: o.id, back: new URL('checkout.html', location.href).href } });
    if (mp?.url) { bag.clear(); location.href = mp.url; return; }
    // se o Mercado Pago falhar, o pedido continua reservado e segue pelo WhatsApp
  }
  const a = del === 'entrega' ? addresses.find((x) => x.id === addrId) : null;
  const lines = items.map((i) => `• ${i.qty}x ${find(i.id)?.name} (${[i.color, i.size].filter(Boolean).join(', ')})`);
  const text = [`Olá, VS Imports! Fiz o pedido #${o.number} pelo site:`, ...lines,
    `Total: ${brl(+o.total)}${+o.discount ? ` (com ${brl(+o.discount)} de desconto)` : ''}`, `Pagamento: ${pay()}`,
    a ? `Entrega: ${a.street}, ${a.number}${a.complement ? ' ' + a.complement : ''} - ${a.district}, ${a.city}/${a.state}, CEP ${a.cep}` : 'Vou retirar na loja.'].join('\n');
  const pdfItems = items.map((i) => { const p = find(i.id); return { name: p.name, color: i.color, size: i.size, qty: i.qty, unit_price: p.finalPrice, photo: p.photos?.[0] || new URL(img(p.id, i.ci ? 'card-' + i.ci : 'card'), location.href).href }; });
  const pdf = orderPdf(o, pdfItems); // gera em segundo plano
  const link = pdf.then((b) => uploadPdf(supabase, b, o)); // e já guarda para o link do WhatsApp
  bag.clear();
  step(4);
  $('#co').hidden = true;
  const done = $('#done'); done.hidden = false;
  done.innerHTML = `<img src="${import.meta.env.BASE_URL}brand/vs-logo.svg" alt="" width="120" height="120">
    <p class="eyebrow">Pedido confirmado</p><h1>Pedido #${o.number}</h1>
    <p>Total <b>${brl(+o.total)}</b>${+o.discount ? `, você economizou ${brl(+o.discount)}` : ''}. Suas peças estão reservadas por 48 horas.</p>
    <p>${del === 'entrega' ? `${+o.shipping ? `Frete ${brl(+o.shipping)} já incluído no total.` : 'Frete grátis!'} Envie o pedido abaixo para combinarmos o pagamento.` : 'Envie a mensagem abaixo e combine o horário da retirada.'}</p>
    <div class="done-act">
      <a class="pill solid lg" id="pdf-wa" href="https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" aria-disabled="true"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg><span>Preparando o PDF…</span></a>
      <button class="link" type="button" id="pdf-dl">Baixar o PDF do pedido</button>
    </div>
    <p class="small" id="pdf-msg" role="status" aria-live="polite"></p>
    <p class="small">Acompanhe em <b>Minha conta → Meus pedidos</b>. <a href="${STORE.vipGroup}" target="_blank" rel="noopener">Entre no grupo VIP</a> e receba as próximas ofertas antes de todo mundo.</p>`;
  document.body.classList.add('co-finished');
  const pm = $('#pdf-msg'), wa = $('#pdf-wa');
  link.then((url) => { wa.href = waOrderLink(o, url); wa.querySelector('span').textContent = 'Enviar pedido + PDF no WhatsApp'; })
    .catch(() => { wa.querySelector('span').textContent = 'Enviar pedido no WhatsApp'; }) // sem PDF: vai a mensagem com os itens
    .finally(() => wa.removeAttribute('aria-disabled'));
  wa.addEventListener('click', (e) => { if (wa.hasAttribute('aria-disabled')) { e.preventDefault(); pm.textContent = 'Só um instante, o PDF está ficando pronto…'; } });
  $('#pdf-dl').onclick = async () => { try { downloadBlob(await pdf, pdfName(o)); } catch { pm.textContent = 'Não foi possível gerar o PDF.'; } };
  scrollTo({ top: 0, behavior: 'smooth' });
}

// volta do Mercado Pago: checkout.html?pedido=<id>
const MP_MSG = {
  approved: ['Pagamento aprovado!', 'Recebemos seu pagamento. Já estamos separando suas peças.'],
  pending: ['Aguardando o pagamento', 'Assim que o Mercado Pago confirmar (no Pix leva segundos), seu pedido muda para pago sozinho.'],
  in_process: ['Pagamento em análise', 'O Mercado Pago está analisando o pagamento. Avisamos assim que for aprovado.'],
  rejected: ['Pagamento não aprovado', 'Nada foi cobrado. Suas peças continuam reservadas: tente de novo com outro cartão ou pelo Pix.'],
  cancelled: ['Pagamento cancelado', 'Nada foi cobrado. Suas peças continuam reservadas: você pode tentar de novo.'],
};
let polls = 0;
async function showReturn() {
  $('#co').hidden = true; step(4); document.body.classList.add('co-finished');
  const done = $('#done'); done.hidden = false;
  if (!auth.user) { done.innerHTML = '<h1>Entre na sua conta</h1><p>Entre para ver a situação do seu pedido.</p><button class="pill solid lg" type="button" data-co-login="entrar">Entrar</button>'; return; }
  const { data: o } = await supabase.from('orders').select('id, number, total, status, mp_status, delivery').eq('id', RETURN_ID).maybeSingle();
  if (!o) { done.innerHTML = '<h1>Pedido não encontrado</h1><p><a href="./">Voltar para a loja</a></p>'; return; }
  const hint = new URLSearchParams(location.search).get('collection_status') || new URLSearchParams(location.search).get('status');
  const key = o.status === 'pago' || o.status === 'separado' || o.status === 'entregue' ? 'approved'
    : o.status === 'cancelado' ? 'expired' : o.mp_status || (hint === 'approved' ? 'pending' : hint) || 'pending';
  const [t, d] = key === 'expired' ? ['Pedido expirado', 'A reserva de 48 horas acabou e as peças voltaram para a loja. Fale com a gente no WhatsApp.'] : MP_MSG[key] || MP_MSG.pending;
  const retry = o.status === 'pendente' && ['rejected', 'cancelled', 'pending'].includes(key);
  done.innerHTML = `<img src="${import.meta.env.BASE_URL}brand/vs-logo.svg" alt="" width="120" height="120">
    <p class="eyebrow">Pedido #${o.number} · ${brl(+o.total)}</p><h1>${t}</h1><p>${d}</p>
    <div class="done-act">${retry ? '<button class="pill solid lg" type="button" id="mp-retry">Pagar agora</button>' : ''}
      <a class="pill lg" href="https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`Olá, VS Imports! Sobre o pedido #${o.number}.`)}" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
    <p class="small" id="mp-msg" role="status" aria-live="polite"></p>
    <p class="small">Acompanhe em <b>Minha conta → Meus pedidos</b>${o.delivery === 'entrega' ? '; o código de rastreio aparece lá quando a etiqueta for gerada' : ''}.</p>`;
  $('#mp-retry')?.addEventListener('click', async (e) => {
    e.target.disabled = true; $('#mp-msg').textContent = 'Abrindo o Mercado Pago…';
    const { data: mp } = await supabase.functions.invoke('pagamento-criar', { body: { order_id: o.id, back: new URL('checkout.html', location.href).href } });
    if (mp?.url) location.href = mp.url; else { e.target.disabled = false; $('#mp-msg').textContent = 'Não foi possível abrir o pagamento agora. Fale com a gente no WhatsApp.'; }
  });
  // o aviso do Mercado Pago pode chegar alguns segundos depois: confere de novo por até 1 minuto
  if (o.status === 'pendente' && polls++ < 15) setTimeout(showReturn, 4000);
}

async function onAuth() {
  if (RETURN_ID) { showReturn(); return; }
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
initHeader();
if (hasSupabase) supabase.functions.invoke('pagamento-criar', { body: { check: true } }).then(({ data }) => { MP_ONLINE = !!data?.online; refresh(); }).catch(() => {});
catalog = await loadCatalog();
refresh();
initAuth().then(() => auth.on(() => onAuth()));
