// Painel da loja: resumo financeiro, venda rápida (balcão, Instagram,
// WhatsApp), pedidos, produtos com grade de estoque e fotos, despesas,
// relatório mensal em PDF e ajustes. Toda regra de dinheiro e estoque roda
// no banco (funções do Supabase); aqui é só a interface.
import { supabase, hasSupabase, friendly } from './lib/supabase.js';
import { initAuth, auth } from './ui/auth.js';
import { loadCatalog, photoUrl } from './data/catalog.js';
import { brl, img, CATEGORIES } from './data/products.js';
import JsBarcode from 'jsbarcode';
import { orderPdf, pdfName, downloadBlob, uploadPdf } from './lib/orderPdf.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
const br = (d) => new Date(d + (String(d).length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR');
const hex = (c) => '#' + Number(c).toString(16).padStart(6, '0');
const CH = { site: 'Site', loja: 'Loja', instagram: 'Instagram', whatsapp: 'WhatsApp' };
const ROLE = { cliente: 'Cliente', vendedor: 'Vendedor', dono: 'Dono (administrador)', dev: 'Desenvolvedor' };
const PAY = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro' };
const PRESETS = { camisetas: ['P', 'M', 'G', 'GG', 'XG'], bermudas: ['38', '40', '42', '44', '46'], tenis: ['37', '38', '39', '40', '41', '42', '43', '44'], bones: ['Único'], acessorios: ['Único'] };

function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3800);
}
async function rpc(fn, args) { const { data, error } = await supabase.rpc(fn, args); if (error) throw error; return data; }

let catalog = [], costs = new Map();
async function reloadCatalog() {
  catalog = await loadCatalog({ includeInactive: true });
  if (auth.isOwner) {
    const { data } = await supabase.from('product_costs').select('product_id, cost');
    costs = new Map((data || []).map((c) => [c.product_id, +c.cost]));
  }
}
const picId = (id) => { const p = catalog.find((x) => x.id === id); return p ? pic(p) : `${import.meta.env.BASE_URL}brand/vs-icon.svg`; };
const thumb = (id, cls = 'th') => `<img class="${cls}" src="${picId(id)}" alt="" loading="lazy" width="44" height="44">`;
const pic = (p) => p.photos?.[0] || (p.hasLocalImages !== false ? img(p.id, 'card-sm') : `${import.meta.env.BASE_URL}brand/vs-icon.svg`);

/* ================================================================ acesso */
initAuth();
let started = false;
auth.on(async (user, profile) => {
  const gate = $('#gate'), app = $('#app');
  if (!hasSupabase) { $('#gate-msg').textContent = 'Banco de dados não configurado.'; return; }
  if (!user) { gate.hidden = false; app.hidden = true; $('#gate-msg').textContent = 'Entre com a conta da loja para continuar.'; return; }
  if (!profile) return;
  if (!auth.isStaff) {
    gate.hidden = false; app.hidden = true;
    $('#gate-msg').innerHTML = `Sua conta (${esc(user.email)}) ainda não tem acesso ao painel. Peça para o dono liberar em Ajustes → Equipe.`;
    gate.querySelector('[data-login]').hidden = true;
    return;
  }
  gate.hidden = true; app.hidden = false;
  $$('[data-owner]').forEach((n) => (n.hidden = !auth.isOwner));
  $('#me').innerHTML = `<b>${esc(profile.full_name || user.email)}</b><span>${profile.title ? esc(profile.title) + ' · ' : ''}${ROLE[profile.role]}</span><button class="link" data-logout>Sair</button>`;
  if (!started) { started = true; await reloadCatalog(); go(location.hash.slice(1) || 'resumo'); }
});

/* ============================================================ navegação */
const VIEWS = { resumo: loadResumo, vender: loadPdv, etiquetas: () => loadLabels(), pedidos: loadOrders, produtos: loadProducts, compras: () => loadCompras(), clientes: () => loadClientes(), despesas: loadExpenses, relatorio: loadReport, ajustes: loadSettings };
function go(v) {
  if (!VIEWS[v] || ($(`[data-go="${v}"]`)?.hasAttribute('data-owner') && !auth.isOwner)) v = 'resumo';
  $$('.view').forEach((s) => (s.hidden = s.id !== 'v-' + v));
  $$('[data-go]').forEach((b) => (b.getAttribute('data-go') === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  history.replaceState(null, '', '#' + v);
  scrollTo(0, 0);
  VIEWS[v]().catch((e) => toast(friendly(e), true));
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

/* =============================================================== resumo */
let rPeriod = 'hoje';
$('#r-period').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; rPeriod = b.dataset.p; $$('#r-period button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); loadResumo(); });
async function periodRange(kind, offset = 0) {
  if (kind === 'hoje') { const t = iso(new Date()); return { from: t, to: t, label: 'Hoje, ' + br(t) }; }
  if (kind === 'ontem') { const d = new Date(); d.setDate(d.getDate() - 1); const t = iso(d); return { from: t, to: t, label: br(t) }; }
  const [p] = await rpc('commercial_period', { p_offset: kind === 'anterior' ? -1 + offset : offset });
  return { from: p.period_start, to: p.period_end, label: `${br(p.period_start)} a ${br(p.period_end)}` };
}
const PAYN = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro', a_combinar: 'A combinar (site)' };
// variação contra o período anterior equivalente
const delta = (now, before) => {
  if (!before) return now ? '<em class="up">novo</em>' : '';
  const pct = ((now - before) / Math.abs(before)) * 100;
  return `<em class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</em>`;
};
async function loadResumo() {
  const r = await periodRange(rPeriod);
  $('#r-label').textContent = r.label;
  const kpi = (label, value, sub = '', cls = '') => `<div class="kpi ${cls}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const pays = await rpc('sales_by_payment', { p_from: r.from, p_to: r.to });
  const payTotal = pays.reduce((t, x) => t + +x.total, 0);
  $('#pay-list').innerHTML = pays.length ? pays.map((x) => `<li><span>${PAYN[x.payment] || x.payment}</span><small>${x.orders} venda${x.orders > 1 ? 's' : ''}</small><b>${brl(+x.total)}</b><i style="width:${(+x.total / payTotal) * 100}%"></i></li>`).join('') + `<li class="tot"><span>Total</span><small></small><b>${brl(payTotal)}</b></li>`
    : '<li class="muted">Nenhuma venda ainda. Registre a primeira em <a href="#vender" data-quick="vender">Vender</a>.</li>';
  if (auth.isOwner) {
    const prevKind = rPeriod === 'hoje' ? 'ontem' : rPeriod === 'mes' ? 'anterior' : 'anterior';
    const prev = await periodRange(prevKind, rPeriod === 'anterior' ? -1 : 0);
    const [[s], [ps], daily, top, sellers, { data: cfg }] = await Promise.all([
      rpc('finance_summary', { p_from: r.from, p_to: r.to }), rpc('finance_summary', { p_from: prev.from, p_to: prev.to }),
      rpc('finance_daily', { p_from: r.from, p_to: r.to }), rpc('top_products', { p_from: r.from, p_to: r.to, p_limit: 6 }),
      rpc('sales_by_seller', { p_from: r.from, p_to: r.to }), supabase.from('store_settings').select('monthly_goal').maybeSingle(),
    ]);
    const vs = rPeriod === 'hoje' ? 'vs. ontem' : 'vs. mês anterior';
    $('#kpis').innerHTML = kpi('Faturamento', brl(+s.revenue), `${s.orders} vendas · ${s.items_sold} peças ${delta(+s.revenue, +ps.revenue)} <span class="vs">${vs}</span>`, 'gold')
      + kpi('Lucro líquido', brl(+s.net_profit), `vendas − custo − despesas ${delta(+s.net_profit, +ps.net_profit)}`, +s.net_profit < 0 ? 'neg' : 'pos')
      + kpi('Lucro bruto', brl(+s.gross_profit), `margem de ${(+s.gross_margin).toLocaleString('pt-BR')}%`)
      + kpi('Ticket médio', brl(+s.ticket), delta(+s.ticket, +ps.ticket))
      + kpi('Custo das peças vendidas', brl(+s.cogs))
      + kpi('Despesas', brl(+s.expenses))
      + kpi('Vendido no site', brl(+s.site_revenue))
      + kpi('Loja, Instagram e WhatsApp', brl(+s.store_revenue))
      + kpi('Pedidos aguardando pagamento', s.pending_orders, +s.pending_orders ? '<a href="#pedidos" data-quick="pendentes">ver pedidos</a>' : 'nenhum pendente', +s.pending_orders ? 'warn' : '');
    rpc('inventory_value').then((rows) => {
      const inv = rows.reduce((t, r) => t + +r.invested, 0), pcs = rows.reduce((t, r) => t + +r.stock, 0);
      $('#kpis').insertAdjacentHTML('beforeend', kpi('Investido em estoque', brl(inv), `${pcs} peças · vale ${brl(rows.reduce((t, r) => t + +r.retail, 0))} vendendo tudo <a href="#produtos" data-quick="produtos">ver por peça</a>`));
    }).catch(() => {});
    // meta do mês comercial
    const goal = +(cfg?.monthly_goal || 0), g = $('#goal');
    if (goal) {
      const mr = rPeriod === 'mes' ? r : await periodRange('mes');
      const [ms] = rPeriod === 'mes' ? [s] : await rpc('finance_summary', { p_from: mr.from, p_to: mr.to });
      const pct = Math.min(100, (+ms.revenue / goal) * 100);
      const daysLeft = Math.max(0, Math.round((new Date(mr.to + 'T23:59') - new Date()) / 864e5));
      const need = Math.max(0, goal - +ms.revenue);
      g.hidden = false;
      g.innerHTML = `<div class="goal-top"><div><span>Meta do mês</span><b>${brl(+ms.revenue)} <small>de ${brl(goal)}</small></b></div><strong>${pct.toFixed(0)}%</strong></div>
        <div class="goal-bar"><i style="width:${pct}%"></i></div>
        <p>${need ? `Faltam ${brl(need)} em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}: cerca de ${brl(need / Math.max(1, daysLeft))} por dia.` : 'Meta batida. Parabéns!'}</p>`;
    } else { g.hidden = false; g.innerHTML = '<p class="muted">Defina a meta de faturamento do mês em <a href="#ajustes" data-quick="ajustes">Ajustes</a> para acompanhar o progresso aqui.</p>'; }
    const max = Math.max(1, ...daily.map((d) => +d.revenue));
    $('#chart').innerHTML = daily.length > 1 ? daily.map((d) => `<div class="bar" title="${br(d.day)}: ${brl(+d.revenue)} · lucro ${brl(+d.net_profit)}"><i style="height:${(+d.revenue / max) * 100}%"></i><em style="height:${Math.max(0, +d.net_profit) / max * 100}%"></em><span>${new Date(d.day + 'T12:00').getDate()}</span></div>`).join('')
      : `<p class="muted">Escolha "Mês comercial" para ver o gráfico dia a dia.</p>`;
    $('#top').innerHTML = top.length ? top.map((t) => `<li class="with-th">${thumb(t.product_id)}<span>${esc(t.name)}</span><b>${t.qty} un.</b><small>${brl(+t.revenue)} · lucro ${brl(+t.profit)}</small></li>`).join('') : '<li class="muted">Sem vendas no período.</li>';
    $('#sellers').innerHTML = sellers.length ? sellers.map((x) => `<li><span>${esc(x.seller)}</span><small>${x.orders} vendas · ${x.items} peças</small><b>${brl(+x.total)}</b></li>`).join('') : '<li class="muted">Sem vendas no período.</li>';
  } else {
    const { data } = await supabase.from('orders').select('total, status, channel').gte('created_at', r.from + 'T00:00:00-03:00').lte('created_at', r.to + 'T23:59:59-03:00');
    const ok = (data || []).filter((o) => o.status !== 'cancelado');
    $('#kpis').innerHTML = kpi('Vendas', ok.length, '', 'gold') + kpi('Total vendido', brl(ok.reduce((t, o) => t + +o.total, 0)));
    $('#chart').innerHTML = ''; $('#top').innerHTML = '';
  }
  const low = [];
  catalog.forEach((p) => p.variants.forEach((v) => { if (v.stock <= 2) low.push({ p, v }); }));
  $('#low').innerHTML = low.length ? low.sort((a, b) => a.v.stock - b.v.stock).slice(0, 30).map(({ p, v }) => `<li class="${v.stock ? '' : 'zero'}"><img src="${pic(p)}" alt=""><span>${esc(p.name)} <small>${esc([v.color, v.size].filter(Boolean).join(' · '))}</small></span><b>${v.stock ? v.stock + ' un.' : 'esgotado'}</b>${auth.isOwner ? `<button class="link" data-restock="${p.id}">repor</button>` : ''}</li>`).join('') : '<li class="muted">Tudo com estoque.</li>';
}
// atalhos
document.addEventListener('click', (e) => {
  const q = e.target.closest('[data-quick]'); const rs = e.target.closest('[data-restock]');
  if (rs) { e.preventDefault(); go('compras'); setTimeout(() => { const sel = $('#buy-form').product; sel.value = rs.dataset.restock; renderBuyGrid(); }, 50); return; }
  if (!q) return; e.preventDefault();
  const k = q.dataset.quick;
  if (k === 'vender') go('vender');
  else if (k === 'compra') go('compras');
  else if (k === 'peca') { go('produtos'); setTimeout(() => openForm(null), 50); }
  else if (k === 'despesa') { go('despesas'); setTimeout(() => $('#exp-form [name=amount]').focus(), 80); }
  else if (k === 'pendentes') { go('pedidos'); $('#o-status').value = 'pendente'; loadOrders(); }
  else if (k === 'ajustes' || k === 'produtos') go(k);
});

/* ============================================================ compras */
let buySeq = 0;
async function loadCompras() {
  const seq = ++buySeq;
  const sel = $('#buy-form').product, keep = sel.value;
  sel.innerHTML = catalog.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (keep) sel.value = keep;
  renderBuyGrid();
  const r = await periodRange('mes');
  const rows = await rpc('purchases_report', { p_from: r.from, p_to: r.to });
  if (seq !== buySeq) return; // uma carga mais nova já está a caminho
  const total = rows.reduce((t, x) => t + +x.total, 0);
  $('#buy-label').innerHTML = `Compras no mês comercial ${r.label}: <b>${brl(total)}</b> em ${rows.reduce((t, x) => t + +x.qty, 0)} peças`;
  $('#buy-hist').innerHTML = `<thead><tr><th>Data</th><th>Peça</th><th>Fornecedor</th><th>Grade</th><th>Qtd.</th><th>Custo un.</th><th>Total</th></tr></thead><tbody>` +
    (rows.map((x) => `<tr><td>${new Date(x.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td><td class="cell-th">${thumb(x.product_id)}<b>${esc(x.name)}</b></td><td>${esc(x.supplier || '—')}</td><td><small>${esc(x.detail || '')}</small></td><td>${x.qty}</td><td>${brl(+x.unit_cost || 0)}</td><td><b>${brl(+x.total)}</b></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma entrada neste mês.</td></tr>') + '</tbody>';
}
function renderBuyGrid() {
  const f = $('#buy-form'), p = catalog.find((x) => x.id === f.product.value);
  if (!p) { $('#buy-grid').innerHTML = ''; $('#buy-pick').innerHTML = ''; return; }
  const tot = p.variants.reduce((t, v) => t + (v.stock || 0), 0);
  $('#buy-pick').innerHTML = `<img src="${pic(p)}" alt="" width="120" height="120"><div><b>${esc(p.name)}</b><span>${brl(p.finalPrice)} no site${costs.has(p.id) ? ` · custo atual ${brl(costs.get(p.id))}` : ''}</span><small>${tot ? `${tot} peça${tot > 1 ? 's' : ''} em estoque agora` : 'sem estoque: esgotado no site'}</small></div>`;
  if (!f.cost.value && costs.has(p.id)) f.cost.value = costs.get(p.id);
  const st = (c, s) => p.variants.find((v) => v.color === c && v.size === s)?.stock ?? 0;
  $('#buy-grid').innerHTML = `<thead><tr><th>Cor \\ Tam.</th>${p.sizes.map((s) => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>` +
    p.colors.map((c) => `<tr><th><span class="dot" style="background:${hex(c.c)}"></span>${esc(c.n)}</th>${p.sizes.map((s) => `<td><input type="number" inputmode="numeric" min="0" max="9999" value="" placeholder="0" data-bq="${esc(c.n)}|${esc(s)}" aria-label="${esc(c.n)} ${esc(s)}"><small class="has">tem ${st(c.n, s)}</small></td>`).join('')}</tr>`).join('') + '</tbody>';
  buyTotal();
}
function buyTotal() {
  const f = $('#buy-form');
  const q = $$('[data-bq]').reduce((t, i) => t + (+i.value || 0), 0);
  $('#buy-total').innerHTML = q ? `${q} peça${q > 1 ? 's' : ''} · total da compra <b>${brl(q * (+f.cost.value || 0))}</b>` : '';
}
$('#buy-form').addEventListener('change', (e) => { if (e.target.name === 'product') { e.target.form.cost.value = ''; renderBuyGrid(); } });
$('#buy-form').addEventListener('input', buyTotal);
$('#buy-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  const items = $$('[data-bq]').map((i) => { const [color, size] = i.dataset.bq.split('|'); return { color, size, qty: +i.value || 0 }; }).filter((x) => x.qty > 0);
  if (!items.length) { toast('Informe quantas peças chegaram.', true); return; }
  if (f.cost.value === '') { toast('Informe o custo por unidade.', true); f.cost.focus(); return; }
  try {
    await rpc('purchase_entry', { p_product: f.product.value, items, p_unit_cost: +f.cost.value, p_supplier: f.supplier.value.trim() || null, p_note: f.note.value.trim() || null });
    toast(`Entrada registrada: ${items.reduce((t, x) => t + x.qty, 0)} peças no estoque`);
    f.note.value = ''; await reloadCatalog(); await loadCompras();
  } catch (err) { toast(friendly(err), true); }
});

/* ============================================================ clientes */
$('#c-q').addEventListener('input', () => { clearTimeout(loadClientes.t); loadClientes.t = setTimeout(loadClientes, 250); });
let cMode = 'compras';
$('#c-mode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cMode = b.dataset.v; $$('#c-mode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); loadClientes(); });
const waLink = (ph, name) => { const d = String(ph || '').replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `https://wa.me/55${d}?text=${encodeURIComponent(`Olá${name ? ', ' + name.split(' ')[0] : ''}! Aqui é da VS Imports.`)}` : ''; };
const ago = (d) => { const n = Math.round((Date.now() - new Date(d)) / 864e5); return n <= 0 ? 'hoje' : `há ${n} dia${n > 1 ? 's' : ''}`; };
async function loadClientes() {
  const q = $('#c-q').value.trim();
  if (cMode === 'cadastros') {
    const rows = await rpc('accounts_list', { p_search: q || null, p_limit: 500 });
    const week = rows.filter((r) => Date.now() - new Date(r.created_at) < 7 * 864e5).length;
    $('#c-info').textContent = `${rows.length} conta${rows.length === 1 ? '' : 's'} no site · ${week} nos últimos 7 dias · ${rows.filter((r) => !+r.orders).length} ainda sem compra`;
    $('#c-table').innerHTML = `<thead><tr><th>Conta</th><th>Contato</th><th>Criada em</th><th>Cidade</th><th>Compras</th><th></th></tr></thead><tbody>` +
      (rows.map((c) => { const link = waLink(c.phone, c.name);
        return `<tr><td><b>${esc(c.name || '—')}</b><small>${ROLE[c.role] || c.role}${c.confirmed ? '' : ' · e-mail não confirmado'}</small></td><td>${esc(c.phone || '')}<small>${esc(c.email || '')}</small></td>
          <td>${new Date(c.created_at).toLocaleDateString('pt-BR')}<small>${ago(c.created_at)}</small></td><td>${esc(c.city || '—')}</td>
          <td>${+c.orders ? `${c.orders} · <b>${brl(+c.total)}</b>` : '<small>nenhuma ainda</small>'}</td>
          <td class="c-act">${c.city ? `<button class="pill sm" type="button" data-addrs="${c.id}">Endereços</button>` : ''}${link ? `<a class="pill sm" href="${link}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td></tr>
          <tr class="c-addrs" id="ca-${c.id}" hidden><td colspan="6"></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Nenhuma conta encontrada.</td></tr>') + '</tbody>';
    return;
  }
  const rows = await rpc('customers_summary', { p_search: q || null, p_limit: 200 });
  $('#c-info').textContent = `${rows.length} cliente${rows.length === 1 ? '' : 's'} com compra`;
  $('#c-table').innerHTML = `<thead><tr><th>Cliente</th><th>Contato</th><th>Compras</th><th>Total gasto</th><th>Última compra</th><th></th></tr></thead><tbody>` +
    (rows.map((c) => { const link = waLink(c.phone, c.name);
      return `<tr><td><b>${esc(c.name || '—')}</b>${c.has_account ? '<small>tem conta no site</small>' : '<small>balcão</small>'}</td><td>${esc(c.phone || '')}<small>${esc(c.email || '')}</small></td><td>${c.orders}</td><td><b>${brl(+c.total)}</b></td><td>${new Date(c.last_order).toLocaleDateString('pt-BR')}<small>${ago(c.last_order)}</small></td><td>${link ? `<a class="pill sm" href="${link}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Os clientes aparecem aqui depois da primeira compra (site ou balcão com nome/telefone).</td></tr>') + '</tbody>';
}
$('#c-table').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-addrs]'); if (!b) return;
  const row = $(`#ca-${b.dataset.addrs}`); row.hidden = !row.hidden; if (row.hidden) return;
  const { data, error } = await supabase.from('addresses').select('*').eq('user_id', b.dataset.addrs).order('is_default', { ascending: false });
  row.firstElementChild.innerHTML = error ? friendly(error) : `<ul class="c-addr-list">${data.map((a) => `<li><b>${esc(a.label)}${a.is_default ? ' · principal' : ''}</b><p>${esc(addrText(a)).replace(/\n/g, '<br>')}</p><button class="pill sm" type="button" data-copy="${esc(addrText(a))}">Copiar</button></li>`).join('')}</ul>`;
});

/* ============================================================ vender */
let cart = [];
const segVal = (id) => $(`#${id} [aria-pressed="true"]`).dataset.v;
$$('.seg.wide').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', g).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
function vStock(p, color, size) {
  if (!p.variants.length) return p.stock == null ? 99 : p.stock;
  return p.variants.find((v) => v.color === color && v.size === size)?.stock ?? 0;
}
async function loadPdv() { renderPdvGrid(); renderCart(); setTimeout(() => $('#scan-code').focus(), 100); $('#pdv-disc').max = auth.isOwner ? 30 : 10; }
function renderPdvGrid() {
  const q = $('#pdv-q').value.trim().toLowerCase();
  const list = catalog.filter((p) => p.active && (!q || p.name.toLowerCase().includes(q) || p.id.includes(q)));
  $('#pdv-grid').innerHTML = list.map((p) => `<li><button type="button" class="pdv-item" data-p="${p.id}">
      <img src="${pic(p)}" alt="" loading="lazy"><b>${esc(p.name)}</b><span>${brl(p.finalPrice)}${p.compareAt ? ' <s>' + brl(p.compareAt) + '</s>' : ''}</span>
      <small>${p.stock == null ? 'estoque livre' : p.stock + ' em estoque'}</small></button>
      <div class="pdv-opts" hidden></div></li>`).join('') || '<li class="muted">Nada encontrado.</li>';
}
$('#pdv-q').addEventListener('input', renderPdvGrid);
// leitor de código de barras: o leitor USB "digita" o número e aperta Enter
function addToCart(p, color, size) {
  const ex = cart.find((i) => i.id === p.id && i.color === color && i.size === size);
  const st = vStock(p, color, size), cur = ex ? ex.qty : 0;
  if (cur + 1 > st) { toast(`Só tem ${st} em estoque.`, true); return false; }
  if (ex) ex.qty++; else cart.push({ id: p.id, name: p.name, color, size, qty: 1, price: p.finalPrice });
  renderCart(); return true;
}
async function scanAdd(code) {
  const msg = $('#scan-msg'), c = String(code).replace(/\D/g, '');
  if (c.length < 8) { msg.textContent = 'Código incompleto.'; return; }
  msg.textContent = 'Procurando…';
  const { data, error } = await supabase.rpc('find_by_barcode', { p_code: c });
  if (error) { msg.textContent = friendly(error); return; }
  const r = data?.[0];
  if (!r) { msg.textContent = `Nenhuma peça com o código ${c}.`; beep(false); return; }
  const p = catalog.find((x) => x.id === r.product_id);
  if (!p) { msg.textContent = 'Peça fora do catálogo ativo.'; beep(false); return; }
  if (addToCart(p, r.color, r.size)) { msg.innerHTML = `<b>${esc(r.name)}</b> ${esc([r.color, r.size].filter(Boolean).join(' · '))} adicionada · ${brl(+r.price)}`; beep(true); }
  else beep(false);
}
let audioCtx;
function beep(ok) {
  try { audioCtx ||= new AudioContext(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = ok ? 1250 : 320; g.gain.value = 0.06; o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + (ok ? 0.08 : 0.25)); } catch {}
}
$('#scan').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#scan-code'); scanAdd(i.value); i.value = ''; i.focus(); });
// com a tela Vender aberta, o leitor funciona mesmo sem clicar no campo
{
  let buf = '', last = 0;
  addEventListener('keydown', (e) => {
    if ($('#v-vender').hidden || e.target.closest('input, textarea, select') && e.target.id !== 'scan-code') return;
    if (e.target.id === 'scan-code') return;
    const now = performance.now();
    if (now - last > 80) buf = '';
    last = now;
    if (/^\d$/.test(e.key)) buf += e.key;
    else if (e.key === 'Enter' && buf.length >= 8) { e.preventDefault(); scanAdd(buf); buf = ''; }
  });
}
$('#pdv-grid').addEventListener('click', (e) => {
  const item = e.target.closest('.pdv-item');
  if (item) {
    const box = item.nextElementSibling, p = catalog.find((x) => x.id === item.dataset.p);
    $$('.pdv-opts').forEach((o) => o !== box && (o.hidden = true));
    box.hidden = !box.hidden;
    if (!box.hidden) box.innerHTML = p.colors.map((c) => `<div class="opt-row"><span class="dot" style="background:${hex(c.c)}"></span><b>${esc(c.n)}</b>
      <div class="opt-sizes">${p.sizes.map((s) => { const st = vStock(p, c.n, s); return `<button type="button" data-add="${p.id}" data-c="${esc(c.n)}" data-s="${esc(s)}" ${st ? '' : 'disabled'}>${esc(s)}<small>${st >= 99 ? '' : st}</small></button>`; }).join('')}</div></div>`).join('');
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    const p = catalog.find((x) => x.id === add.dataset.add), color = add.dataset.c, size = add.dataset.s;
    const ex = cart.find((i) => i.id === p.id && i.color === color && i.size === size);
    const st = vStock(p, color, size), cur = ex ? ex.qty : 0;
    if (cur + 1 > st) { toast(`Só tem ${st} em estoque.`, true); return; }
    if (ex) ex.qty++; else cart.push({ id: p.id, name: p.name, color, size, qty: 1, price: p.finalPrice });
    renderCart(); toast(`${p.name} ${color} ${size} adicionado`);
    void cur;
  }
});
function renderCart() {
  // agrupa a mesma peça com cores/tamanhos diferentes
  const groups = new Map();
  cart.forEach((i, k) => { if (!groups.has(i.id)) groups.set(i.id, []); groups.get(i.id).push([i, k]); });
  $('#cart').innerHTML = cart.length ? [...groups].map(([, rows]) => `<li><div class="cart-h">${thumb(rows[0][0].id)}<b>${esc(rows[0][0].name)}</b></div>${rows.map(([i, k]) => `<div class="cart-row">
      <span>${esc([i.color, i.size].filter(Boolean).join(' · '))}</span>
      <span class="qty"><button type="button" data-cq="${k}" data-d="-1">−</button><b>${i.qty}</b><button type="button" data-cq="${k}" data-d="1">+</button></span>
      <span>${brl(i.price * i.qty)}</span></div>`).join('')}</li>`).join('') : '<li class="muted">Toque numa peça para escolher cor e tamanho.</li>';
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const pct = Math.max(0, Math.min(+$('#pdv-disc').value || 0, auth.isOwner ? 30 : 10));
  const disc = Math.round(sub * pct) / 100;
  $('#pdv-totals').innerHTML = `<div><span>Subtotal</span><b>${brl(sub)}</b></div>${disc ? `<div><span>Desconto ${pct}%</span><b>− ${brl(disc)}</b></div>` : ''}<div class="g"><span>Total</span><b>${brl(sub - disc)}</b></div>`;
  $('#pdv-go').disabled = !cart.length;
  saleTotal = sub - disc;
  updateSaleButton();
}
// botão "Venda realizada": mostra a forma de pagamento e o total; dinheiro calcula o troco
let saleTotal = 0;
const PAY_LABEL = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' };
function updateSaleButton() {
  const pay = segVal('pdv-pay'), n = cart.reduce((t, i) => t + i.qty, 0);
  $('#pdv-go-sub').textContent = cart.length ? `${PAY_LABEL[pay]} · ${n} peça${n > 1 ? 's' : ''} · ${brl(saleTotal)}` : 'Escolha as peças ou passe o leitor';
  const cash = pay === 'dinheiro';
  $('#pdv-cash').hidden = !cash || !cart.length;
  if (cash && cart.length) {
    const t = saleTotal, notes = [...new Set([t, Math.ceil(t / 10) * 10, Math.ceil(t / 50) * 50, Math.ceil(t / 100) * 100])].filter((v) => v >= t).slice(0, 4);
    $('#cash-quick').innerHTML = notes.map((v) => `<button type="button" class="pill sm" data-cash="${v}">${v === t ? 'Valor exato' : brl(v)}</button>`).join('');
    const rec = +$('#pdv-received').value || 0;
    $('#pdv-change').innerHTML = rec ? (rec >= t ? `Troco: <b>${brl(rec - t)}</b>` : `<span class="neg">Faltam ${brl(t - rec)}</span>`) : '';
  }
}
$('#pdv-pay').addEventListener('click', () => setTimeout(updateSaleButton, 0));
$('#pdv-received').addEventListener('input', updateSaleButton);
$('#cash-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-cash]'); if (b) { $('#pdv-received').value = b.dataset.cash; updateSaleButton(); } });
$('#sold-new').addEventListener('click', () => { $('#sold').hidden = true; $('#scan-code')?.focus(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sold').hidden) $('#sold').hidden = true; });
$('#pdv-disc').addEventListener('input', renderCart);
$('#cart').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cq]'); if (!b) return;
  const i = cart[+b.dataset.cq], d = +b.dataset.d, p = catalog.find((x) => x.id === i.id);
  if (d > 0 && i.qty + 1 > vStock(p, i.color, i.size)) { toast('Sem mais estoque dessa variante.', true); return; }
  i.qty += d; if (i.qty < 1) cart.splice(+b.dataset.cq, 1); renderCart();
});
$('#pdv-go').addEventListener('click', async () => {
  const btn = $('#pdv-go');
  const pay = segVal('pdv-pay'), rec = +$('#pdv-received').value || 0;
  if (pay === 'dinheiro' && rec && rec < saleTotal) { toast('O valor recebido é menor que o total.', true); $('#pdv-received').focus(); return; }
  btn.disabled = true; $('#pdv-msg').textContent = 'Registrando…';
  const soldList = cart.map((i) => `${i.qty}x ${i.name}${i.color || i.size ? ` (${[i.color, i.size].filter(Boolean).join(' · ')})` : ''}`);
  try {
    const o = await rpc('register_store_sale', {
      items: cart.map((i) => ({ id: i.id, qty: i.qty, color: i.color, size: i.size })),
      p_payment: segVal('pdv-pay'), p_channel: segVal('pdv-channel'),
      p_customer_name: $('#pdv-name').value.trim() || null, p_customer_phone: $('#pdv-phone').value.trim() || null,
      p_discount_percent: +$('#pdv-disc').value || 0, p_delivery: $('#pdv-del').value,
    });
    toast(`Venda #${o.number} registrada: ${brl(+o.total)}`);
    const sold = cart.map((i) => ({ product_id: i.id, name: i.name, color: i.color, size: i.size, qty: i.qty, unit_price: i.price }));
    orderCache.set(String(o.id), { ...o, order_items: sold });
    $('#pdv-msg').innerHTML = `Venda #${o.number} · ${brl(+o.total)} · estoque atualizado.<span class="pdf-act"><button class="pill sm" type="button" data-pdf="${o.id}">PDF do pedido</button><a class="pill sm wa" data-pdf-wa="${o.id}" target="_blank" rel="noopener" aria-disabled="true">Preparando PDF…</a></span>`;
    prepSaleLink(o.id);
    // confirmação grande: venda registrada, troco e estoque baixado
    $('#sold-info').innerHTML = `Venda <b>#${o.number}</b> · ${PAY_LABEL[pay]} · <b>${brl(+o.total)}</b><br><small>${soldList.map(esc).join('<br>')}</small>`;
    $('#sold-change').innerHTML = pay === 'dinheiro' && rec ? `Troco: <b>${brl(rec - +o.total)}</b>` : '';
    $('#sold-stock').textContent = 'Estoque atualizado e venda lançada no caixa e no relatório do mês.';
    $('#sold-acts').innerHTML = $('#pdv-msg .pdf-act')?.outerHTML || '';
    $('#sold').hidden = false;
    $('#pdv-received').value = '';
    cart = []; $('#pdv-name').value = ''; $('#pdv-phone').value = ''; $('#pdv-disc').value = 0;
    await reloadCatalog(); renderPdvGrid(); renderCart();
  } catch (err) { $('#pdv-msg').textContent = friendly(err); toast(friendly(err), true); await reloadCatalog(); renderPdvGrid(); }
  finally { btn.disabled = !cart.length; }
});

/* ============================================================ pedidos */
// PDF do pedido (ficha para separar) e envio pelo WhatsApp
const orderCache = new Map();
async function pdfOf(id) {
  const o = orderCache.get(String(id));
  const items = o.order_items.map((i) => ({ ...i, photo: new URL(picId(i.product_id), location.href).href }));
  if (!o.customer_name && o.user_id) { const { data: p } = await supabase.from('profiles').select('full_name, phone').eq('id', o.user_id).maybeSingle(); if (p) { o.customer_name = p.full_name; o.customer_phone ||= p.phone; } }
  return { o, blob: await orderPdf(o, items) };
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pdf], [data-pdf-wa]'); if (!b) return;
  const id = b.dataset.pdf || b.dataset.pdfWa;
  if (b.dataset.pdf) { b.disabled = true; try { const { o, blob } = await pdfOf(id); downloadBlob(blob, pdfName(o)); } catch { toast('Não foi possível gerar o PDF', true); } finally { b.disabled = false; } }
});
// depois da venda no balcão: já gera o PDF, guarda e monta o link do WhatsApp
async function prepSaleLink(id) {
  const a = $(`[data-pdf-wa="${id}"]`); if (!a) return;
  try {
    const { o, blob } = await pdfOf(id);
    const url = await uploadPdf(supabase, blob, o);
    const ph = String(o.customer_phone || '').replace(/\D/g, '').replace(/^55/, '');
    const msg = `Olá${o.customer_name ? ', ' + o.customer_name.split(' ')[0] : ''}! Aqui é da VS Imports. Seu pedido #${o.number} (${brl(+o.total)}) está confirmado.\nPDF do pedido: ${url}`;
    a.href = `https://wa.me/${ph.length >= 10 ? '55' + ph : ''}?text=${encodeURIComponent(msg)}`;
    a.textContent = ph.length >= 10 ? 'Enviar PDF no WhatsApp do cliente' : 'Enviar PDF no WhatsApp';
    a.removeAttribute('aria-disabled');
  } catch { a.textContent = 'PDF indisponível'; }
}

$('#o-status').addEventListener('change', loadOrders); $('#o-channel').addEventListener('change', loadOrders);
let oSrc = '';
$('#o-src').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]'); if (!b) return;
  oSrc = b.dataset.v; $$('#o-src [data-v]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $('#o-channel').hidden = oSrc !== 'loja'; $('#o-channel').value = ''; loadOrders();
});
// totais de cada aba (mesmo filtro de status, sem contar cancelados no valor)
async function ordersTotals() {
  let q = supabase.from('orders').select('channel, total, status').order('created_at', { ascending: false }).limit(1000);
  if ($('#o-status').value) q = q.eq('status', $('#o-status').value);
  const { data } = await q; if (!data) return;
  const sum = (f) => { const l = data.filter(f), ok = l.filter((o) => o.status !== 'cancelado'); return `${l.length} · ${brl(ok.reduce((t, o) => t + +o.total, 0))}`; };
  $('#o-n-all').textContent = sum(() => true);
  $('#o-n-site').textContent = sum((o) => o.channel === 'site');
  $('#o-n-loja').textContent = sum((o) => o.channel !== 'site');
}
async function loadOrders() {
  let q = supabase.from('orders').select('id, number, created_at, channel, payment, status, subtotal, discount, total, coupon_code, customer_name, customer_phone, delivery, notes, shipping_address, shipping, customer_document, shipping_service_name, shipping_days, superfrete_id, tracking_code, label_url, shipping_status, user_id, order_items(product_id, name, color, size, qty, unit_price)').order('created_at', { ascending: false }).limit(150);
  if ($('#o-status').value) q = q.eq('status', $('#o-status').value);
  if (oSrc === 'site') q = q.eq('channel', 'site');
  else if (oSrc === 'loja') q = $('#o-channel').value ? q.eq('channel', $('#o-channel').value) : q.neq('channel', 'site');
  const { data, error } = await q; if (error) throw error;
  ordersTotals();
  const ids = [...new Set(data.map((o) => o.user_id).filter(Boolean))];
  const people = new Map();
  if (ids.length) { const { data: ps } = await supabase.from('profiles').select('id, full_name, phone, email').in('id', ids); (ps || []).forEach((p) => people.set(p.id, p)); }
  data.forEach((o) => orderCache.set(String(o.id), o));
  $('#orders').innerHTML = data.length ? data.map((o) => {
    const who = people.get(o.user_id);
    const name = o.customer_name || who?.full_name || who?.email || 'Cliente no balcão';
    const phone = o.customer_phone || who?.phone || '';
    return `<li class="order"><div class="o-top"><b>#${o.number}</b><span class="chip-s">${CH[o.channel]}</span><span class="st st-${o.status}">${o.status}</span><span class="o-date">${new Date(o.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span><b class="o-total">${brl(+o.total)}</b></div>
      <div class="o-mid"><span>${esc(name)}${phone ? ` · <a href="https://wa.me/55${esc(phone.replace(/\D/g, '').replace(/^55/, ''))}" target="_blank" rel="noopener">${esc(phone)}</a>` : ''}</span><span>${o.payment ? PAY[o.payment] : 'pagamento a combinar'} · ${o.delivery === 'entrega' ? `entrega${+o.shipping ? ' (frete ' + brl(+o.shipping) + ')' : ' (frete grátis)'}` : 'retirada'}${+o.discount ? ` · desconto ${brl(+o.discount)}${o.coupon_code ? ' (' + o.coupon_code + ')' : ''}` : ''}</span></div>
      <ul class="o-items">${o.order_items.map((i) => `<li>${thumb(i.product_id)}<span><b>${i.qty}x</b> ${esc(i.name)}<small>${esc([i.color, i.size].filter(Boolean).join(' · '))}</small></span></li>`).join('')}</ul>
      ${shipHTML(o)}${o.notes ? `<p class="o-notes">${esc(o.notes)}</p>` : ''}
      ${o.status === 'cancelado' ? '' : `<div class="o-act"><select data-st="${o.id}">${['pendente', 'pago', 'separado', 'entregue'].map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="pill sm danger" data-cancel="${o.id}" data-n="${o.number}">Cancelar e devolver estoque</button></div>`}</li>`;
  }).join('') : '<li class="muted">Nenhum pedido.</li>';
}
// endereço de entrega do pedido (foto do momento da compra) + copiar para etiqueta
const addrText = (a) => [a.recipient, `${a.street}, ${a.number}${a.complement ? ' - ' + a.complement : ''}`, `${a.district} - ${a.city}/${a.state}`, `CEP ${String(a.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}`, a.reference ? 'Ref.: ' + a.reference : ''].filter(Boolean).join('\n');
function shipHTML(o) {
  if (o.delivery !== 'entrega') return '';
  const a = o.shipping_address;
  if (!a) return '<div class="o-ship warn">Entrega sem endereço registrado: confirme com o cliente.</div>';
  return `<div class="o-ship"><div><span>Enviar para</span><p>${esc(addrText(a)).replace(/\n/g, '<br>')}</p></div>
    <div class="o-ship-act"><button class="pill sm" type="button" data-copy="${esc(addrText(a))}">Copiar endereço</button>
    <a class="pill sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.street}, ${a.number}, ${a.city} ${a.state} ${a.cep}`)}" target="_blank" rel="noopener">Mapa</a></div></div>${sendHTML(o)}`;
}
// envio pela SuperFrete: gerar etiqueta, imprimir de novo, rastreio
const SF_ST = { pending: 'aguardando pagamento da etiqueta', released: 'etiqueta pronta · aguardando postagem', posted: 'postado', delivered: 'entregue', cancelled: 'etiqueta cancelada' };
function sendHTML(o) {
  if (!auth.isOwner || o.status === 'cancelado') return '';
  const info = [o.shipping_service_name && `${esc(o.shipping_service_name)}${o.shipping_days ? ` · até ${o.shipping_days} dias úteis` : ''}`,
    o.customer_document && `CPF ${esc(o.customer_document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'))}`,
    o.shipping_status && esc(SF_ST[o.shipping_status] || o.shipping_status),
    o.tracking_code && `rastreio <a href="https://rastreio.superfrete.com/#/tracking/${encodeURIComponent(o.tracking_code)}" target="_blank" rel="noopener">${esc(o.tracking_code)}</a>`].filter(Boolean).join(' · ');
  const can = ['pago', 'separado'].includes(o.status);
  const btns = o.label_url
    ? `<a class="pill sm solid" href="${esc(o.label_url)}" target="_blank" rel="noopener">Imprimir etiqueta de envio</a><button class="pill sm" type="button" data-sf="status" data-o="${o.id}">Atualizar rastreio</button>${o.shipping_status === 'released' ? `<button class="pill sm danger" type="button" data-sf="cancelar" data-o="${o.id}">Cancelar etiqueta</button>` : ''}`
    : `<button class="pill sm solid" type="button" data-sf="gerar" data-o="${o.id}" ${can ? '' : 'disabled title="Marque o pedido como pago primeiro"'}>Gerar etiqueta de envio</button>${can ? '' : '<small class="muted">marque como pago para liberar</small>'}`;
  return `<div class="o-send"><span>${info || 'Envio pela SuperFrete'}</span><div>${btns}</div></div>`;
}
const SF_ERR = { superfrete_sem_token: 'Falta configurar o token da SuperFrete no servidor.', remetente_incompleto: 'Preencha o endereço do remetente em Ajustes.', pedido_nao_pago: 'Marque o pedido como pago antes.', cotacao_indisponivel: 'A SuperFrete não cotou esse envio.' };
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sf]'); if (!b) return;
  if (b.dataset.sf === 'gerar' && !confirm('Gerar a etiqueta? O valor do frete é descontado do saldo da carteira SuperFrete.')) return;
  if (b.dataset.sf === 'cancelar' && !confirm('Cancelar a etiqueta? O valor volta para a carteira SuperFrete.')) return;
  b.disabled = true; const t = b.textContent; b.textContent = 'Aguarde…';
  const { data, error } = await supabase.functions.invoke('frete-etiqueta', { body: { order_id: b.dataset.o, acao: b.dataset.sf } });
  let msg = data?.error; if (error && !msg) { try { msg = (await error.context.json()).error; } catch { msg = error.message; } }
  if (msg) { toast(SF_ERR[msg] || msg, true); b.disabled = false; b.textContent = t; return; }
  if (data?.url) open(data.url, '_blank', 'noopener');
  toast(b.dataset.sf === 'gerar' ? 'Etiqueta gerada' : b.dataset.sf === 'cancelar' ? 'Etiqueta cancelada' : 'Rastreio atualizado');
  loadOrders();
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Endereço copiado'); } catch { prompt('Copie o endereço:', b.dataset.copy); }
});
$('#orders').addEventListener('change', async (e) => {
  const s = e.target.closest('[data-st]'); if (!s) return;
  const { error } = await supabase.from('orders').update({ status: s.value }).eq('id', s.dataset.st);
  toast(error ? friendly(error) : 'Status atualizado', !!error); loadOrders();
});
$('#orders').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cancel]'); if (!b) return;
  if (!confirm(`Cancelar o pedido #${b.dataset.n}? As peças voltam para o estoque.`)) return;
  try { await rpc('cancel_order', { p_order: b.dataset.cancel }); toast('Pedido cancelado, estoque devolvido'); await reloadCatalog(); loadOrders(); } catch (err) { toast(friendly(err), true); }
});

/* ============================================================ produtos */
$('#p-q').addEventListener('input', loadProducts);
let inv = new Map();
async function loadProducts() {
  const q = $('#p-q').value.trim().toLowerCase();
  const list = catalog.filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q));
  const own = auth.isOwner;
  if (own) {
    try {
      const rows = await rpc('inventory_value');
      inv = new Map(rows.map((r) => [r.product_id, r]));
      const sum = (k) => rows.reduce((t, r) => t + +r[k], 0);
      $('#p-inv').hidden = false;
      $('#p-inv').innerHTML = `<div class="kpi gold"><span>Investido em estoque</span><b>${brl(sum('invested'))}</b><small>${rows.reduce((t, r) => t + +r.stock, 0)} peças × custo</small></div>
        <div class="kpi"><span>Vale vendendo tudo</span><b>${brl(sum('retail'))}</b><small>pelo preço atual</small></div>
        <div class="kpi pos"><span>Lucro do estoque</span><b>${brl(sum('potential_profit'))}</b><small>se vender tudo</small></div>
        <div class="kpi ${rows.some((r) => +r.stock > 0 && !+r.cost) ? 'warn' : ''}"><span>Peças sem custo</span><b>${rows.filter((r) => +r.stock > 0 && !+r.cost).length}</b><small>cadastre o custo para o cálculo ficar certo</small></div>`;
    } catch {}
  }
  $('#p-table').innerHTML = `<thead><tr><th></th><th>Peça</th><th>Preço</th>${own ? '<th>Custo</th><th>Margem</th><th>Investido</th>' : ''}<th>Estoque</th><th>Situação</th>${own ? '<th></th>' : ''}</tr></thead><tbody>` +
    list.map((p) => {
      const c = costs.get(p.id), m = c != null && p.finalPrice ? (p.finalPrice - c) / p.finalPrice * 100 : null;
      const stockTxt = p.stock == null ? '—' : `${p.stock}<small>${p.variants.length ? p.variants.filter((v) => v.stock > 0).length + '/' + p.variants.length + ' variantes' : ''}</small>`;
      const sit = !p.active ? '<span class="st st-cancelado">fora do site</span>' : !p.available ? '<span class="st st-pendente">esgotado</span>' : p.compareAt ? '<span class="st st-separado">promoção</span>' : '<span class="st st-pago">à venda</span>';
      return `<tr><td><img src="${pic(p)}" alt="" loading="lazy"></td><td><b>${esc(p.name)}</b><small>${p.id}</small></td>
        <td>${p.compareAt ? `<s>${brl(p.compareAt)}</s><br>` : ''}${brl(p.finalPrice)}</td>
        ${own ? `<td>${c != null ? brl(c) : '—'}</td><td>${m != null ? `<b class="${m < 30 ? 'neg' : 'pos'}">${m.toFixed(0)}%</b><small>${brl(p.finalPrice - c)} por peça</small>` : '—'}</td><td>${inv.get(p.id) ? `<b>${brl(+inv.get(p.id).invested)}</b><small>vende por ${brl(+inv.get(p.id).retail)}</small>` : '—'}</td>` : ''}
        <td>${stockTxt}</td><td>${sit}</td>${own ? `<td class="c-act"><button class="pill sm" data-edit="${p.id}">Editar</button><button class="pill sm" data-labels="${p.id}">Etiquetas</button></td>` : ''}</tr>`;
    }).join('') + '</tbody>';
}
$('#p-table').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) openForm(b.dataset.edit); });
$('#p-new').addEventListener('click', () => openForm(null));

/* ------- formulário de peça ------- */
const pf = $('#pf');
let form = null; // { isNew, colors:[{n,c,a}], sizes:[], qty: Map 'cor|tam' -> n, photos:[{path?, url, blob?}] , removed:[] }
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
async function openForm(id) {
  const p = id ? catalog.find((x) => x.id === id) : null;
  form = { isNew: !p, colors: p ? p.colors.map((c) => ({ n: c.n, c: hex(c.c), a: hex(c.a) })) : [{ n: 'Preto', c: '#28282b', a: '#f1ede4' }],
    sizes: p ? [...p.sizes] : [...PRESETS.camisetas.slice(0, 4)], qty: new Map(), photos: [], removed: [] };
  if (p) p.variants.forEach((v) => form.qty.set(v.color + '|' + v.size, v.stock));
  if (p) {
    const { data } = await supabase.from('product_images').select('path, position').eq('product_id', p.id).order('position');
    form.photos = (data || []).map((i) => ({ path: i.path, url: photoUrl(i.path) }));
  }
  pf.reset();
  $('#pf-title').textContent = p ? 'Editar peça' : 'Nova peça';
  pf.id.value = p?.id || ''; pf.id.readOnly = !!p; pf.name.value = p?.name || '';
  pf.category.value = p?.cat || 'camisetas'; pf.model.value = p?.model || 'tee'; pf.description.value = p?.desc || '';
  pf.price.value = p ? p.price : ''; pf.cost.value = p && costs.has(p.id) ? costs.get(p.id) : '';
  pf.promo_price.value = p?.compareAt ? p.finalPrice : '';
  pf.promo_until.value = p?.promoUntil ? iso(p.promoUntil) : '';
  pf.featured.checked = !!p?.featured; pf.active.checked = p ? p.active !== false : true;
  $('#pf-msg').textContent = '';
  renderForm(); $('#sheet').hidden = false; pf.name.focus();
}
function renderForm() {
  $('#pf-colors').innerHTML = form.colors.map((c, k) => `<li><input type="color" value="${c.c}" data-cc="${k}" aria-label="Cor"><input value="${esc(c.n)}" data-cn="${k}" placeholder="Nome da cor" maxlength="30"><button class="round" type="button" data-cx="${k}" aria-label="Remover cor">×</button></li>`).join('');
  const preset = PRESETS[pf.category.value] || [];
  const all = [...new Set([...preset, ...form.sizes])];
  $('#pf-sizes').innerHTML = all.map((s) => `<button type="button" data-sz="${esc(s)}" aria-pressed="${form.sizes.includes(s)}">${esc(s)}</button>`).join('');
  const sizes = all.filter((s) => form.sizes.includes(s));
  form.sizes = sizes;
  $('#pf-grid').innerHTML = form.colors.length && sizes.length ? `<thead><tr><th>Cor \\ Tam.</th>${sizes.map((s) => `<th>${esc(s)}</th>`).join('')}<th>Total</th></tr></thead><tbody>` +
    form.colors.map((c) => `<tr><th><span class="dot" style="background:${c.c}"></span>${esc(c.n)}</th>${sizes.map((s) => `<td><input type="number" inputmode="numeric" min="0" max="9999" value="${form.qty.get(c.n + '|' + s) ?? 0}" data-q="${esc(c.n)}|${esc(s)}" aria-label="${esc(c.n)} ${esc(s)}"></td>`).join('')}<td class="sum"></td></tr>`).join('') + '</tbody>' : '<tbody><tr><td class="muted">Adicione cor e tamanho.</td></tr></tbody>';
  $('#pf-photos').innerHTML = form.photos.map((f, k) => `<li><img src="${f.url}" alt=""><div><button type="button" class="round" data-pl="${k}" aria-label="Mover para a esquerda">‹</button><button type="button" class="round" data-px="${k}" aria-label="Remover">×</button><button type="button" class="round" data-pr="${k}" aria-label="Mover para a direita">›</button></div>${k === 0 ? '<span class="cover">capa</span>' : ''}</li>`).join('');
  $('.file').hidden = form.photos.length >= 5;
  sums(); margin();
}
function sums() {
  let total = 0;
  $$('#pf-grid tbody tr').forEach((tr) => { const t = $$('input', tr).reduce((s, i) => s + (+i.value || 0), 0); total += t; const c = $('.sum', tr); if (c) c.textContent = t; });
  $('#pf-total').textContent = `Total em estoque: ${total} peça${total === 1 ? '' : 's'}`;
}
function margin() {
  const cost = +pf.cost.value, price = +pf.promo_price.value || +pf.price.value;
  $('#pf-margin').innerHTML = cost && price ? `Você ganha <b>${brl(price - cost)}</b> por peça · margem <b class="${(price - cost) / price < 0.3 ? 'neg' : 'pos'}">${((price - cost) / price * 100).toFixed(0)}%</b>${+pf.promo_price.value ? ' (no preço promocional)' : ''}` : '';
}
pf.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'name' && form.isNew) pf.id.value = slug(t.value);
  if (t.matches('[data-q]')) { form.qty.set(t.dataset.q, Math.max(0, +t.value || 0)); sums(); }
  if (t.matches('[data-cn]')) { const k = +t.dataset.cn, old = form.colors[k].n; form.colors[k].n = t.value.trim(); form.sizes.forEach((s) => { if (form.qty.has(old + '|' + s)) { form.qty.set(t.value.trim() + '|' + s, form.qty.get(old + '|' + s)); form.qty.delete(old + '|' + s); } }); }
  if (t.matches('[data-cc]')) form.colors[+t.dataset.cc].c = t.value;
  if (['cost', 'price', 'promo_price'].includes(t.name)) margin();
});
pf.addEventListener('change', (e) => { if (e.target.matches('[data-cn]')) renderForm(); if (e.target.name === 'category') renderForm(); });
pf.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.matches('[data-close]')) { $('#sheet').hidden = true; return; }
  if (t.id === 'pf-addcolor') { form.colors.push({ n: 'Nova cor ' + (form.colors.length + 1), c: '#888888', a: '#f1ede4' }); renderForm(); }
  if (t.dataset.cx != null) { form.colors.splice(+t.dataset.cx, 1); renderForm(); }
  if (t.dataset.sz != null) { const s = t.dataset.sz; form.sizes = form.sizes.includes(s) ? form.sizes.filter((x) => x !== s) : [...form.sizes, s]; renderForm(); }
  if (t.id === 'pf-addsize') { const v = $('#pf-size-new').value.trim().toUpperCase(); if (v && !form.sizes.includes(v)) { form.sizes.push(v); $('#pf-size-new').value = ''; renderForm(); } }
  const mv = (k, d) => { const n = k + d; if (n < 0 || n >= form.photos.length) return; [form.photos[k], form.photos[n]] = [form.photos[n], form.photos[k]]; renderForm(); };
  if (t.dataset.pl != null) mv(+t.dataset.pl, -1);
  if (t.dataset.pr != null) mv(+t.dataset.pr, 1);
  if (t.dataset.px != null) { const [f] = form.photos.splice(+t.dataset.px, 1); if (f.path) form.removed.push(f.path); renderForm(); }
});
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') $('#sheet').hidden = true; });

// fotos do iPhone: reduz para 2000 px no lado maior e comprime (WebP, ou JPEG no Safari antigo)
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) throw new Error('Não consegui abrir essa foto. No iPhone, use Ajustes → Câmera → Formatos → "Mais compatível", ou envie em JPG.');
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  return blob;
}
$('#pf-file').addEventListener('change', async (e) => {
  const files = [...e.target.files].slice(0, 5 - form.photos.length);
  $('#pf-msg').textContent = 'Preparando fotos…';
  for (const f of files) {
    try { const blob = await shrink(f); form.photos.push({ blob, url: URL.createObjectURL(blob) }); }
    catch (err) { toast(err.message, true); }
  }
  e.target.value = ''; $('#pf-msg').textContent = ''; renderForm();
});

pf.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#pf-msg'), btn = $('#pf-save');
  const id = pf.id.value.trim();
  if (!pf.name.value.trim()) { msg.textContent = 'Dê um nome para a peça.'; pf.name.focus(); return; }
  if (!/^[a-z0-9-]{3,60}$/.test(id)) { msg.textContent = 'Código inválido: use letras minúsculas, números e hífen.'; pf.id.focus(); return; }
  if (!(+pf.price.value >= 0) || pf.price.value === '') { msg.textContent = 'Informe o preço de venda.'; pf.price.focus(); return; }
  if (pf.promo_price.value && +pf.promo_price.value >= +pf.price.value) { msg.textContent = 'O preço promocional precisa ser menor que o preço normal.'; pf.promo_price.focus(); return; }
  if (!form.colors.length || !form.sizes.length) { msg.textContent = 'Adicione ao menos uma cor e um tamanho.'; return; }
  if (new Set(form.colors.map((c) => c.n.toLowerCase())).size !== form.colors.length) { msg.textContent = 'Há cores com o mesmo nome.'; return; }
  btn.disabled = true; msg.textContent = 'Salvando…';
  try {
    const stock = [];
    form.colors.forEach((c) => form.sizes.forEach((s) => stock.push({ color: c.n, size: s, qty: form.qty.get(c.n + '|' + s) ?? 0 })));
    await rpc('upsert_product', { p: {
      id, name: pf.name.value.trim(), category: pf.category.value, model: pf.model.value, description: pf.description.value.trim(),
      price: +pf.price.value, cost: pf.cost.value === '' ? null : +pf.cost.value,
      promo_price: pf.promo_price.value === '' ? null : +pf.promo_price.value,
      promo_until: pf.promo_until.value ? pf.promo_until.value + 'T23:59:59-03:00' : null,
      featured: pf.featured.checked, active: pf.active.checked,
      sizes: form.sizes, colors: form.colors.map((c) => ({ n: c.n, c: c.c, a: c.a })), stock,
    } });
    // fotos: envia as novas, regrava a ordem e apaga as removidas
    msg.textContent = 'Enviando fotos…';
    const paths = [];
    for (const [k, f] of form.photos.entries()) {
      if (f.path) { paths.push(f.path); continue; }
      const ext = f.blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${id}/${Date.now()}-${k}.${ext}`;
      const { error } = await supabase.storage.from('produtos').upload(path, f.blob, { contentType: f.blob.type, cacheControl: '31536000' });
      if (error) throw error;
      paths.push(path);
    }
    await supabase.from('product_images').delete().eq('product_id', id);
    if (paths.length) { const { error } = await supabase.from('product_images').insert(paths.map((path, position) => ({ product_id: id, path, position }))); if (error) throw error; }
    if (form.removed.length) await supabase.storage.from('produtos').remove(form.removed);
    $('#sheet').hidden = true; toast('Peça salva');
    await reloadCatalog(); loadProducts();
  } catch (err) { msg.textContent = friendly(err); }
  finally { btn.disabled = false; }
});

/* ============================================================ despesas */
const CAT = { aluguel: 'Aluguel', energia: 'Energia', agua: 'Água', internet: 'Internet', salarios: 'Salários', impostos: 'Impostos', marketing: 'Marketing', manutencao: 'Manutenção', taxas: 'Taxas', outros: 'Outros' };
async function loadExpenses() {
  const f = $('#exp-form'); if (!f.spent_on.value) f.spent_on.value = iso(new Date());
  const r = await periodRange('mes');
  const { data, error } = await supabase.from('expenses').select('*').gte('spent_on', r.from).lte('spent_on', r.to).order('spent_on', { ascending: false });
  if (error) throw error;
  const total = data.reduce((s, x) => s + +x.amount, 0);
  $('#exp-label').innerHTML = `Mês comercial ${r.label} · <b>${brl(total)}</b> em despesas`;
  $('#exp-list').innerHTML = data.length ? data.map((x) => `<li><span class="d">${br(x.spent_on)}</span><span class="chip-s">${CAT[x.category]}</span><span class="grow">${esc(x.description || '')}</span><b>${brl(+x.amount)}</b><button class="round" data-del="${x.id}" aria-label="Apagar">×</button></li>`).join('') : '<li class="muted">Nenhuma despesa neste mês.</li>';
}
$('#exp-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  const { error } = await supabase.from('expenses').insert({ spent_on: f.spent_on.value, category: f.category.value, description: f.description.value.trim() || null, amount: +f.amount.value, created_by: auth.user.id });
  if (error) { toast(friendly(error), true); return; }
  f.description.value = ''; f.amount.value = ''; toast('Despesa lançada'); loadExpenses();
});
$('#exp-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]'); if (!b || !confirm('Apagar esta despesa?')) return;
  const { error } = await supabase.from('expenses').delete().eq('id', b.dataset.del); toast(error ? friendly(error) : 'Despesa apagada', !!error); loadExpenses();
});

/* ============================================================ relatório */
let repOffset = 0, rep = null;
$('#rep-prev').addEventListener('click', () => { repOffset--; loadReport(); });
$('#rep-next').addEventListener('click', () => { repOffset++; loadReport(); });
async function loadReport() {
  const [p] = await rpc('commercial_period', { p_offset: repOffset });
  const from = p.period_start, to = p.period_end;
  const [[s], rows, top, { data: closings }] = await Promise.all([
    rpc('finance_summary', { p_from: from, p_to: to }), rpc('sales_report', { p_from: from, p_to: to }), rpc('top_products', { p_from: from, p_to: to, p_limit: 10 }),
    supabase.from('month_closings').select('*').eq('period_start', from).eq('period_end', to).maybeSingle(),
  ]);
  rep = { from, to, s, rows, top, closing: closings };
  $('#rep-label').textContent = `${br(from)} a ${br(to)}`;
  $('#report').innerHTML = reportHTML(rep);
}
function reportHTML({ from, to, s, rows, top, closing }) {
  const line = (k, v, cls = '') => `<div class="${cls}"><span>${k}</span><b>${v}</b></div>`;
  return `<div class="rep-sum">
      ${line('Faturamento', brl(+s.revenue), 'gold')}${line('Custo das peças', '− ' + brl(+s.cogs))}${line('Lucro bruto', brl(+s.gross_profit) + ` (${(+s.gross_margin).toLocaleString('pt-BR')}%)`)}
      ${line('Despesas', '− ' + brl(+s.expenses))}${line('Lucro líquido', brl(+s.net_profit), +s.net_profit < 0 ? 'neg big' : 'pos big')}
      ${line('Vendas', `${s.orders} pedidos · ${s.items_sold} peças`)}${line('Ticket médio', brl(+s.ticket))}${line('Descontos dados', brl(+s.discounts))}
      ${line('Site', brl(+s.site_revenue))}${line('Loja, Instagram e WhatsApp', brl(+s.store_revenue))}
    </div>
    ${closing ? `<p class="closed">Mês fechado em ${new Date(closing.closed_at).toLocaleString('pt-BR')}</p>` : ''}
    <h2>Mais vendidos</h2>
    <div class="table-wrap"><table class="tbl small"><thead><tr><th>Peça</th><th>Qtd.</th><th>Vendido</th><th>Lucro</th></tr></thead><tbody>${top.map((t) => `<tr><td class="cell-th">${thumb(t.product_id)}${esc(t.name)}</td><td>${t.qty}</td><td>${brl(+t.revenue)}</td><td>${brl(+t.profit)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem vendas.</td></tr>'}</tbody></table></div>
    <h2>Todas as vendas (${rows.length})</h2>
    <div class="table-wrap"><table class="tbl small"><thead><tr><th>#</th><th>Data</th><th>Canal</th><th>Cliente</th><th>Itens</th><th>Pagto.</th><th>Desc.</th><th>Total</th><th>Lucro</th></tr></thead><tbody</table></div>v class="table-wrap"><table class="tbl small"><thead><tr><th>#</th><th>Data</th><th>Canal</th><th>Cliente</th><th>Itens</th><th>Pagto.</th><th>Desc.</th><th>Total</th><th>Lucro</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="${r.status === 'cancelado' ? 'canc' : ''}"><td>${r.number}</td><td>${new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${CH[r.channel]}</td><td>${esc(r.customer)}</td><td>${esc(r.items || '')}${r.status === 'cancelado' ? ' <b>(cancelado)</b>' : ''}</td><td>${r.payment ? PAY[r.payment] : '—'}</td><td>${+r.discount ? brl(+r.discount) : ''}</td><td>${brl(+r.total)}</td><td>${brl(+r.profit)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Nenhuma venda no período.</td></tr>'}
    </tbody></table>`;
}
$('#rep-pdf').addEventListener('click', () => {
  if (!rep) return;
  $('#print').innerHTML = `<header class="pr-head"><img src="${import.meta.env.BASE_URL}brand/vs-logo.svg" alt="" width="90" height="90"><div><h1>Relatório de vendas</h1><p>Mês comercial ${br(rep.from)} a ${br(rep.to)} · gerado em ${new Date().toLocaleString('pt-BR')}</p></div></header>` + reportHTML(rep);
  const t = document.title; document.title = `VS Imports - vendas ${rep.from} a ${rep.to}`;
  setTimeout(() => { window.print(); document.title = t; }, 150); // aguarda a logo
});
$('#rep-close').addEventListener('click', async () => {
  if (!rep || !confirm(`Fechar o mês de ${br(rep.from)} a ${br(rep.to)}? Os números atuais ficam registrados (pode fechar de novo para atualizar).`)) return;
  try { await rpc('close_month', { p_from: rep.from, p_to: rep.to }); toast('Mês fechado'); loadReport(); } catch (err) { toast(friendly(err), true); }
});

/* ============================================================ ajustes */
/* vídeos do Instagram da home */
async function loadReels() {
  const { data, error } = await supabase.from('home_reels').select('*').order('position').order('id');
  if (error) { $('#reels-list').innerHTML = `<li class="muted">${friendly(error)}</li>`; return; }
  $('#reels-list').innerHTML = data.length ? data.map((r, i) => `<li data-id="${r.id}"><span class="rl-n">${i + 1}</span><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace(/^https:\/\/(www\.)?instagram\.com/, ''))}</a>
      <span class="rl-act"><button type="button" class="pill sm" data-rmove="-1" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" class="pill sm" data-rmove="1" ${i < data.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button>
      <button type="button" class="pill sm" data-rtoggle="${r.active ? 0 : 1}">${r.active ? 'Ocultar' : 'Mostrar'}</button><button type="button" class="pill sm danger" data-rdel>Excluir</button></span></li>`).join('')
    : '<li class="muted">Nenhum vídeo ainda: a home mostra um convite para seguir o Instagram.</li>';
  loadReels.rows = data;
}
$('#reels-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, raw = f.url.value.trim();
  const m = raw.match(/instagram\.com\/(reels?|p|tv)\/([\w-]{5,})/);
  if (!m) { toast('Cole um link de Reels ou post do Instagram.', true); return; }
  const url = `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`;
  const pos = (loadReels.rows || []).reduce((t, r) => Math.max(t, r.position), 0) + 1;
  const { error } = await supabase.from('home_reels').insert({ url, position: pos });
  if (error) { toast(friendly(error), true); return; }
  f.url.value = ''; toast('Vídeo adicionado à home'); loadReels();
});
$('#reels-list').addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const rows = loadReels.rows || [], i = rows.findIndex((r) => r.id === +li.dataset.id), r = rows[i];
  let error;
  if (e.target.closest('[data-rdel]')) { if (!confirm('Excluir este vídeo da home?')) return; ({ error } = await supabase.from('home_reels').delete().eq('id', r.id)); }
  else if (e.target.closest('[data-rtoggle]')) ({ error } = await supabase.from('home_reels').update({ active: !r.active }).eq('id', r.id));
  else if (e.target.closest('[data-rmove]')) {
    const o = rows[i + +e.target.closest('[data-rmove]').dataset.rmove]; if (!o) return;
    // troca as posições (renumera para não haver empate)
    const order = rows.map((x) => x.id); [order[i], order[rows.indexOf(o)]] = [order[rows.indexOf(o)], order[i]];
    const res = await Promise.all(order.map((id, k) => supabase.from('home_reels').update({ position: k + 1 }).eq('id', id)));
    error = res.find((x) => x.error)?.error;
  } else return;
  if (error) toast(friendly(error), true);
  loadReels();
});
async function loadShipping() {
  const [{ data: cfg }, { data: zones }] = await Promise.all([supabase.from('store_settings').select('free_shipping_min').maybeSingle(), supabase.from('shipping_zones').select('*').order('sort')]);
  const f = $('#ship-form'); f.free.value = cfg?.free_shipping_min ?? 349.9;
  $('#ship-zones').innerHTML = (zones || []).map((z) => `<tr><td><b>${esc(z.name)}</b><small>CEP ${String(z.cep_from).padStart(8, '0').slice(0, 5)} a ${String(z.cep_to).padStart(8, '0').slice(0, 5)}</small></td>
    <td><input type="number" inputmode="decimal" min="0" step="0.5" value="${+z.price}" data-zp="${z.id}" aria-label="Preço ${esc(z.name)}"></td>
    <td><input maxlength="40" value="${esc(z.days)}" data-zd="${z.id}" aria-label="Prazo ${esc(z.name)}"></td></tr>`).join('');
}
$('#ship-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  const free = Math.max(0, +f.free.value || 0);
  const ups = $$('[data-zp]').map((i) => supabase.from('shipping_zones').update({ price: Math.max(0, +i.value || 0), days: $(`[data-zd="${i.dataset.zp}"]`).value.trim() }).eq('id', +i.dataset.zp));
  const res = await Promise.all([supabase.from('store_settings').update({ free_shipping_min: free, updated_at: new Date().toISOString() }).eq('id', true), ...ups]);
  const err = res.find((r) => r.error)?.error;
  toast(err ? friendly(err) : 'Frete salvo', !!err); loadShipping();
});
async function loadSender() {
  const { data } = await supabase.from('store_settings').select('sender').maybeSingle();
  const f = $('#sender-form'), s = data?.sender || {};
  ['name', 'postal_code', 'address', 'number', 'complement', 'district', 'city', 'state_abbr'].forEach((k) => { if (f[k]) f[k].value = s[k] || (k === 'name' ? 'VS Imports' : k === 'state_abbr' ? 'PR' : k === 'city' ? 'Curitiba' : ''); });
}
$('#sender-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  const s = Object.fromEntries(['name', 'postal_code', 'address', 'number', 'complement', 'district', 'city', 'state_abbr'].map((k) => [k, f[k].value.trim()]));
  s.postal_code = s.postal_code.replace(/\D/g, ''); s.state_abbr = s.state_abbr.toUpperCase().slice(0, 2);
  if (s.postal_code.length !== 8 || !s.address || !s.district || !s.city) { toast('Preencha CEP, rua, bairro e cidade.', true); return; }
  const { error } = await supabase.from('store_settings').update({ sender: s, updated_at: new Date().toISOString() }).eq('id', true);
  toast(error ? friendly(error) : 'Remetente salvo', !!error); loadSfStatus();
});
// situação da conta SuperFrete (saldo, rastreio automático, remetente)
async function loadSfStatus() {
  const ul = $('#sf-status'); if (!ul) return;
  const { data, error } = await supabase.functions.invoke('frete-etiqueta', { body: { acao: 'conta' } });
  const { data: st } = await supabase.from('store_settings').select('sender').maybeSingle();
  const senderOk = !!(st?.sender?.postal_code && st?.sender?.address);
  if (error || !data?.ok) { ul.innerHTML = '<li class="bad">SuperFrete não conectada (confira o token no servidor).</li>'; return; }
  const low = data.saldo < 30;
  ul.innerHTML = `<li class="ok">Conta SuperFrete conectada (${data.ambiente === 'teste' ? 'modo teste' : 'produção'}) · frete real no checkout</li>
    <li class="${low ? 'bad' : 'ok'}">Saldo da carteira: <b>${brl(data.saldo)}</b>${low ? ' · recarregue com Pix na SuperFrete antes de gerar etiquetas' : ''}</li>
    <li class="${data.rastreio_automatico ? 'ok' : 'bad'}">Rastreio automático ${data.rastreio_automatico ? 'ligado' : `desligado <button class="pill sm" type="button" id="sf-hook">Ligar</button>`}</li>
    <li class="${senderOk ? 'ok' : 'bad'}">Remetente ${senderOk ? 'preenchido · etiquetas liberadas' : 'pendente · preencha abaixo para liberar as etiquetas'}</li>`;
  $('#sf-hook')?.addEventListener('click', async () => {
    const { error: e } = await supabase.functions.invoke('frete-etiqueta', { body: { acao: 'webhook' } });
    toast(e ? 'Não foi possível ligar o rastreio' : 'Rastreio automático ligado', !!e); loadSfStatus();
  });
}
// CEP do remetente preenche rua, bairro e cidade
$('#sender-form').postal_code.addEventListener('input', async (e) => {
  const c = e.target.value.replace(/\D/g, ''); if (c.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`).then((x) => x.json()); if (r.erro) { toast('CEP não encontrado', true); return; }
    const f = $('#sender-form');
    if (r.logradouro) f.address.value = r.logradouro; if (r.bairro) f.district.value = r.bairro;
    f.city.value = r.localidade || f.city.value; f.state_abbr.value = r.uf || f.state_abbr.value; f.number.focus();
  } catch {}
});
async function loadSettings() {
  loadShipping(); loadReels(); loadSender(); loadSfStatus();
  const { data } = await supabase.from('store_settings').select('month_start_day, monthly_goal').maybeSingle();
  $('#set-form').day.value = data?.month_start_day || 1; $('#set-form').goal.value = data?.monthly_goal ?? ''; previewPeriod();
  loadTeam();
}
async function previewPeriod() { try { const [p] = await rpc('commercial_period', {}); $('#set-preview').textContent = `Mês atual: ${br(p.period_start)} a ${br(p.period_end)}`; } catch {} }
$('#set-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const d = +e.target.day.value;
  if (!(d >= 1 && d <= 28)) { toast('Escolha um dia entre 1 e 28.', true); return; }
  const goal = e.target.goal.value === '' ? null : Math.max(0, +e.target.goal.value);
  const { error } = await supabase.from('store_settings').update({ month_start_day: d, monthly_goal: goal, updated_at: new Date().toISOString() }).eq('id', true);
  toast(error ? friendly(error) : 'Ajustes salvos', !!error); previewPeriod();
});
$('#team-q').addEventListener('input', () => { clearTimeout(loadTeam.t); loadTeam.t = setTimeout(loadTeam, 250); });
async function loadTeam() {
  const q = $('#team-q').value.trim();
  let req = supabase.from('profiles').select('id, full_name, email, phone, role, title').order('role').limit(50);
  if (q) req = req.or(`full_name.ilike.%${q.replace(/[%,()]/g, '')}%,email.ilike.%${q.replace(/[%,()]/g, '')}%`);
  else req = req.in('role', ['dev', 'dono', 'vendedor']);
  const { data, error } = await req; if (error) { toast(friendly(error), true); return; }
  // o dono não altera contas de desenvolvedor; só o desenvolvedor cria outro
  const roles = auth.isDev ? ['cliente', 'vendedor', 'dono', 'dev'] : ['cliente', 'vendedor', 'dono'];
  $('#team').innerHTML = data.map((p) => {
    const locked = p.id === auth.user.id || (p.role === 'dev' && !auth.isDev);
    const opts = (p.role === 'dev' && !auth.isDev ? ['dev'] : roles).map((r) => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${ROLE[r]}</option>`).join('');
    return `<li><div><b>${esc(p.full_name || '—')}${p.title ? ` <em class="title-tag">${esc(p.title)}</em>` : ''}</b><small>${esc(p.email || '')} ${esc(p.phone || '')}</small></div>
    <select data-role="${p.id}" ${locked ? 'disabled' : ''}>${opts}</select></li>`;
  }).join('') || '<li class="muted">Ninguém encontrado.</li>';
}
$('#team').addEventListener('change', async (e) => {
  const s = e.target.closest('[data-role]'); if (!s) return;
  if (s.value === 'dono' && !confirm('Dar acesso de DONO (administrador: vê custos, lucro e despesas)?')) { loadTeam(); return; }
  if (s.value === 'dev' && !confirm('Dar acesso de DESENVOLVEDOR (acesso total ao sistema)?')) { loadTeam(); return; }
  try { await rpc('set_role', { p_user: s.dataset.role, p_role: s.value }); toast('Acesso atualizado'); } catch (err) { toast(friendly(err), true); }
  loadTeam();
});


/* ============================================================ etiquetas (código de barras) */
let lbRows = [];
const lbSel = new Map(); // variante -> quantidade
async function loadLabels() {
  const { data, error } = await supabase.from('product_variants').select('id, product_id, color, size, stock, barcode').order('product_id').order('color').order('size');
  if (error) { toast(friendly(error), true); return; }
  lbRows = data.map((v) => ({ ...v, p: catalog.find((x) => x.id === v.product_id) })).filter((v) => v.p);
  renderLabels();
}
function lbFiltered() {
  const q = $('#lb-q').value.trim().toLowerCase(), only = $('#lb-stock').checked;
  return lbRows.filter((v) => (!only || v.stock > 0) && (!q || v.p.name.toLowerCase().includes(q) || v.barcode.includes(q)));
}
function renderLabels() {
  const rows = lbFiltered();
  $('#lb-table').innerHTML = `<thead><tr><th></th><th>Peça</th><th>Cor · Tam.</th><th>Estoque</th><th>Código de barras</th><th>Qtd. etiquetas</th></tr></thead><tbody>` +
    (rows.map((v) => `<tr><td><input type="checkbox" data-lb="${v.id}" ${lbSel.has(v.id) ? 'checked' : ''} aria-label="Selecionar"></td>
      <td class="cell-th">${thumb(v.product_id)}<b>${esc(v.p.name)}</b></td><td>${esc([v.color, v.size].filter(Boolean).join(' · '))}</td><td>${v.stock}</td>
      <td><code>${v.barcode}</code></td><td><input type="number" min="1" max="500" value="${lbSel.get(v.id) || Math.max(1, v.stock)}" data-lbq="${v.id}" aria-label="Quantidade"></td></tr>`).join('')
      || '<tr><td colspan="6" class="muted">Nenhuma peça.</td></tr>') + '</tbody>';
  lbCount();
}
function lbCount() { const n = [...lbSel.values()].reduce((t, q) => t + q, 0); $('#lb-count').textContent = lbSel.size ? `${lbSel.size} variantes · ${n} etiquetas` : 'Nenhuma selecionada'; }
$('#lb-q').addEventListener('input', renderLabels);
$('#lb-stock').addEventListener('change', renderLabels);
$('#lb-table').addEventListener('change', (e) => {
  const c = e.target.closest('[data-lb]'), q = e.target.closest('[data-lbq]');
  if (c) { const id = +c.dataset.lb, qty = +$(`[data-lbq="${id}"]`).value || 1; c.checked ? lbSel.set(id, qty) : lbSel.delete(id); }
  if (q) { const id = +q.dataset.lbq; const v = Math.max(1, Math.min(500, +q.value || 1)); q.value = v; if (lbSel.has(id)) lbSel.set(id, v); }
  lbCount();
});
$('#lb-all').addEventListener('click', () => { lbFiltered().forEach((v) => lbSel.set(v.id, +($(`[data-lbq="${v.id}"]`)?.value) || Math.max(1, v.stock))); renderLabels(); });
$('#lb-none').addEventListener('click', () => { lbSel.clear(); renderLabels(); });
$('#lb-qty-stock').addEventListener('click', () => { lbRows.forEach((v) => { if (lbSel.has(v.id)) lbSel.set(v.id, Math.max(1, v.stock)); }); $$('[data-lbq]').forEach((i) => { const v = lbRows.find((r) => r.id === +i.dataset.lbq); i.value = Math.max(1, v.stock); }); lbCount(); });
$('#lb-qty-one').addEventListener('click', () => { [...lbSel.keys()].forEach((k) => lbSel.set(k, 1)); $$('[data-lbq]').forEach((i) => (i.value = 1)); lbCount(); });
// atalho: etiquetas de uma peça direto da tabela de Produtos
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-labels]'); if (!b) return;
  go('etiquetas'); $('#lb-q').value = catalog.find((p) => p.id === b.dataset.labels)?.name || ''; $('#lb-stock').checked = false;
  setTimeout(() => { lbFiltered().filter((v) => v.product_id === b.dataset.labels).forEach((v) => lbSel.set(v.id, Math.max(1, v.stock))); renderLabels(); }, 400);
});
// papéis: medidas em mm (folhas Pimaco padrão e rolos térmicos)
const PAPERS = {
  a4356: { pageW: 210, pageH: 297, cols: 3, rows: 11, w: 63.5, h: 25.4, top: 8.8, left: 7.2, gapX: 2.5, gapY: 0, tiny: true },
  a4360: { pageW: 210, pageH: 297, cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.15, left: 7.2, gapX: 2.5, gapY: 0 },
  a4351: { pageW: 210, pageH: 297, cols: 5, rows: 13, w: 38.2, h: 21.2, top: 10.7, left: 4.7, gapX: 2.5, gapY: 0, tiny: true, mini: true },
  'a4-grade': { pageW: 210, pageH: 297, cols: 3, rows: 8, w: 64, h: 34, top: 10, left: 6, gapX: 3, gapY: 1.5, cut: true },
  't3-33x22': { pageW: 105, pageH: 22, cols: 3, rows: 1, w: 33, h: 22, top: 0, left: 1, gapX: 2, gapY: 0, tiny: true, mini: true },
  't2-40x25': { pageW: 84, pageH: 25, cols: 2, rows: 1, w: 40, h: 25, top: 0, left: 1, gapX: 2, gapY: 0, tiny: true },
  't1-50x30': { pageW: 50, pageH: 30, cols: 1, rows: 1, w: 50, h: 30, top: 0, left: 0, gapX: 0, gapY: 0 },
};
$('#lb-print').addEventListener('click', () => {
  if (!lbSel.size) { toast('Marque as peças que vão ganhar etiqueta.', true); return; }
  const P = PAPERS[$('#lb-size').value];
  const per = P.cols * P.rows;
  const skip = Math.max(0, Math.min(per - 1, (+$('#lb-skip').value || 1) - 1));
  const labels = [];
  for (const [id, qty] of lbSel) { const v = lbRows.find((r) => r.id === id); if (v) for (let i = 0; i < qty; i++) labels.push(v); }
  if (labels.length > 2000) { toast('Máximo de 2.000 etiquetas por impressão.', true); return; }
  const cache = new Map();
  const svg = (code) => {
    if (cache.has(code)) return cache.get(code);
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(el, code, { format: 'EAN13', width: 2, height: 50, fontSize: 15, margin: 0, textMargin: 1, displayValue: true });
    el.removeAttribute('style'); el.removeAttribute('width'); el.removeAttribute('height'); el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    cache.set(code, el.outerHTML); return el.outerHTML;
  };
  const cell = (v) => `<div class="label"><div class="lb-top"><b class="lb-brand">VS IMPORTS</b><b class="lb-price">${brl(v.p.finalPrice)}</b></div>
    <div class="lb-name">${esc(v.p.name)}</div><div class="lb-var">${esc([v.color, v.size && 'Tam. ' + v.size].filter(Boolean).join(' · '))}</div>
    <div class="lb-code">${svg(v.barcode)}</div></div>`;
  // monta as páginas: posições vazias no começo (folha reaproveitada) e grade fixa em mm
  const slots = [...Array(skip).fill(null), ...labels];
  const pages = [];
  for (let i = 0; i < slots.length; i += per) pages.push(slots.slice(i, i + per));
  const grid = `grid-template-columns: repeat(${P.cols}, ${P.w}mm); grid-auto-rows: ${P.h}mm; column-gap: ${P.gapX}mm; row-gap: ${P.gapY}mm; padding: ${P.top}mm 0 0 ${P.left}mm; width: ${P.pageW}mm; height: ${P.pageH}mm;`;
  $('#print').innerHTML = `<div class="labels${P.tiny ? ' lb-tiny' : ''}${P.mini ? ' lb-mini' : ''}${P.cut ? ' lb-cut' : ''}">` +
    pages.map((pg) => `<section class="lb-page" style="${grid}">${pg.map((v) => (v ? cell(v) : '<div class="label empty"></div>')).join('')}</section>`).join('') + '</div>';
  const st = document.createElement('style'); st.id = 'lb-page';
  st.textContent = `@media print { @page { size: ${P.pageW}mm ${P.pageH}mm; margin: 0; } }`;
  document.head.appendChild(st); document.body.classList.add('printing-labels');
  const done = () => { st.remove(); document.body.classList.remove('printing-labels'); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  toast(`${labels.length} etiquetas em ${pages.length} ${P.rows > 1 ? 'folha' : 'linha'}${pages.length > 1 ? 's' : ''}`);
  setTimeout(() => window.print(), 150);
});

