// Endereços salvos do cliente (tabela addresses, protegida por RLS: cada
// cliente só vê os seus; dono e desenvolvedor leem para fazer os envios).
import { supabase, friendly } from '../lib/supabase.js';

export const UF = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cepFmt = (c) => String(c || '').replace(/\D/g, '').replace(/^(\d{5})(\d{1,3}).*/, '$1-$2');

export async function listAddresses() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('addresses').select('*').eq('user_id', user.id).order('is_default', { ascending: false }).order('id');
  if (error) throw error;
  return data;
}

export async function saveAddress(a, id = null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('login_required');
  if (a.is_default) await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id).eq('is_default', true);
  const q = id ? supabase.from('addresses').update(a).eq('id', id) : supabase.from('addresses').insert({ ...a, user_id: user.id });
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}

export async function deleteAddress(id) {
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) throw error;
}

export const addressLine = (a) => `${esc(a.street)}, ${esc(a.number)}${a.complement ? ' · ' + esc(a.complement) : ''}<br>${esc(a.district)} · ${esc(a.city)}/${esc(a.state)} · CEP ${cepFmt(a.cep)}`;

// formulário em etapas (mesmo HTML no checkout e em "Meus endereços"):
// 1) CEP  ->  2) confere a rua achada e digita só número/complemento  ->  3) quem recebe e apelido
const LABELS = ['Casa', 'Trabalho', 'Outro'];
export const formHTML = (a = {}) => {
  const editing = !!a.id;
  const lbl = a.label || 'Casa';
  return `
<form class="addr-form" novalidate data-stage="${editing ? 'manual' : 'cep'}">
  <div class="af-cep">
    <p class="af-step"><b>1</b> Qual o CEP de entrega?</p>
    <div class="af-cep-row">
      <label class="lf big"><input name="cep" inputmode="numeric" maxlength="9" placeholder=" " value="${cepFmt(a.cep)}" autocomplete="postal-code"><span>CEP</span></label>
      <button class="pill solid" type="button" data-cep-go>Buscar</button>
    </div>
    <div class="af-links">
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei meu CEP</a>
      <button class="link" type="button" data-manual>Preencher sem CEP</button>
    </div>
  </div>
  <div class="af-found" aria-live="polite">
    <div class="af-card"><span class="af-pin" aria-hidden="true"></span><div><b data-f-street></b><small data-f-city></small></div><button class="link" type="button" data-cep-change>Alterar</button></div>
  </div>
  <div class="af-rest">
    <p class="af-step"><b>2</b> Agora o número da casa</p>
    <div class="af-grid">
      <label class="lf s2 af-man"><input name="street" maxlength="160" placeholder=" " value="${esc(a.street)}" autocomplete="address-line1"><span>Rua / avenida</span></label>
      <label class="lf"><input name="number" maxlength="20" inputmode="text" placeholder=" " value="${esc(a.number)}"><span>Número</span></label>
      <label class="lf"><input name="complement" maxlength="80" placeholder=" " value="${esc(a.complement)}" autocomplete="address-line2"><span>Apto, bloco (opcional)</span></label>
      <label class="check af-sn s2"><input type="checkbox" data-sn> Sem número</label>
      <label class="lf af-man"><input name="district" maxlength="80" placeholder=" " value="${esc(a.district)}"><span>Bairro</span></label>
      <label class="lf af-man"><input name="city" maxlength="80" placeholder=" " value="${esc(a.city)}" autocomplete="address-level2"><span>Cidade</span></label>
      <label class="lf sel af-man"><select name="state">${UF.map((u) => `<option${u === (a.state || 'PR') ? ' selected' : ''}>${u}</option>`).join('')}</select><span>Estado</span></label>
      <label class="lf af-man cep-man"><input name="cep2" inputmode="numeric" maxlength="9" placeholder=" " value="${cepFmt(a.cep)}"><span>CEP</span></label>
    </div>
    <p class="af-step"><b>3</b> Quem vai receber?</p>
    <div class="af-grid">
      <label class="lf s2"><input name="recipient" maxlength="120" placeholder=" " value="${esc(a.recipient)}" autocomplete="name"><span>Nome de quem recebe</span></label>
      <div class="af-chips s2" role="radiogroup" aria-label="Apelido do endereço">
        ${LABELS.map((l) => `<label class="chip-r"><input type="radio" name="labelpick" value="${l}"${(LABELS.includes(lbl) ? lbl : 'Outro') === l ? ' checked' : ''}><span>${l === 'Casa' ? '⌂ ' : l === 'Trabalho' ? '▣ ' : '✦ '}${l}</span></label>`).join('')}
      </div>
      <label class="lf s2 af-other"${LABELS.slice(0, 2).includes(lbl) ? ' hidden' : ''}><input name="label" maxlength="30" placeholder=" " value="${esc(LABELS.slice(0, 2).includes(lbl) ? '' : (a.label === 'Outro' ? '' : a.label || ''))}"><span>Nome do endereço (ex.: Casa da mãe)</span></label>
      <details class="af-ref s2"${a.reference ? ' open' : ''}><summary>Adicionar ponto de referência</summary>
        <label class="lf"><input name="reference" maxlength="160" placeholder=" " value="${esc(a.reference)}"><span>Ex.: portão preto, ao lado do mercado</span></label></details>
    </div>
    <label class="check"><input name="is_default" type="checkbox"${a.is_default || !a.id ? ' checked' : ''}> Usar como endereço principal</label>
  </div>
  <p class="addr-msg" role="status" aria-live="polite"></p>
  <div class="addr-actions"><button class="pill solid" type="submit">Salvar endereço</button><button class="pill" type="button" data-addr-cancel>Cancelar</button></div>
</form>`;
};

// liga o formulário: busca o CEP (ViaCEP), mostra a rua e pede só o que falta
export function bindForm(form, { id = null, onSaved, onCancel } = {}) {
  const msg = form.querySelector('.addr-msg');
  const stage = (st) => { form.dataset.stage = st; };
  const showFound = () => {
    form.querySelector('[data-f-street]').textContent = form.street.value || 'CEP ' + cepFmt(form.cep.value);
    form.querySelector('[data-f-city]').textContent = [form.district.value, `${form.city.value}/${form.state.value}`, 'CEP ' + cepFmt(form.cep.value)].filter((x) => x && x !== '/').join(' · ');
  };
  let busy = false;
  const lookup = async () => {
    const c = form.cep.value.replace(/\D/g, '');
    if (c.length !== 8) { msg.textContent = 'O CEP tem 8 números.'; form.cep.focus(); return; }
    if (busy) return; busy = true;
    msg.textContent = 'Buscando o endereço…'; form.classList.add('loading');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`).then((x) => x.json());
      if (r.erro) { msg.textContent = 'Não achamos esse CEP. Confira os números ou preencha à mão.'; return; }
      form.street.value = r.logradouro || ''; form.district.value = r.bairro || ''; form.city.value = r.localidade || ''; if (r.uf) form.state.value = r.uf;
      form.cep2.value = cepFmt(c); msg.textContent = '';
      if (!r.logradouro) { stage('manual'); form.street.focus(); return; } // CEP geral da cidade: falta a rua
      showFound(); stage('found'); form.number.focus();
    } catch { msg.textContent = 'Não conseguimos buscar agora. Preencha o endereço abaixo.'; form.cep2.value = cepFmt(c); stage('manual'); form.street.focus(); }
    finally { busy = false; form.classList.remove('loading'); }
  };
  form.cep.addEventListener('input', () => { form.cep.value = cepFmt(form.cep.value); if (form.cep.value.replace(/\D/g, '').length === 8) lookup(); });
  form.cep.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
  form.cep2.addEventListener('input', () => { form.cep2.value = cepFmt(form.cep2.value); });
  form.querySelector('[data-cep-go]').addEventListener('click', lookup);
  form.querySelector('[data-manual]').addEventListener('click', () => { msg.textContent = ''; form.cep2.value = form.cep.value; stage('manual'); form.street.focus(); });
  form.querySelector('[data-cep-change]').addEventListener('click', () => { stage('cep'); form.cep.select(); });
  form.querySelector('[data-sn]').addEventListener('change', (e) => { form.number.value = e.target.checked ? 'S/N' : ''; form.number.disabled = e.target.checked; if (!e.target.checked) form.number.focus(); });
  if (form.number.value === 'S/N') { form.querySelector('[data-sn]').checked = true; form.number.disabled = true; }
  form.querySelectorAll('[name=labelpick]').forEach((r) => r.addEventListener('change', () => {
    const other = form.querySelector('.af-other'); other.hidden = r.value !== 'Outro'; if (!other.hidden) form.label.focus();
  }));
  form.querySelector('[data-addr-cancel]').addEventListener('click', () => onCancel?.());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.stage === 'cep') { lookup(); return; }
    const v = Object.fromEntries(new FormData(form));
    const pick = form.querySelector('[name=labelpick]:checked')?.value || 'Casa';
    const a = {
      label: (pick === 'Outro' ? (v.label || '').trim() || 'Outro' : pick).slice(0, 30), recipient: (v.recipient || '').trim(),
      cep: (form.dataset.stage === 'manual' ? form.cep2.value : form.cep.value).replace(/\D/g, ''),
      street: form.street.value.trim(), number: form.number.value.trim(), complement: (v.complement || '').trim() || null, district: form.district.value.trim(),
      city: form.city.value.trim(), state: form.state.value, reference: (v.reference || '').trim() || null, is_default: !!v.is_default,
    };
    const miss = [['street', 'a rua', 'street'], ['number', 'o número (ou marque "Sem número")', 'number'], ['district', 'o bairro', 'district'], ['city', 'a cidade', 'city'], ['recipient', 'o nome de quem recebe', 'recipient']].find(([k]) => !a[k]);
    if (miss) { if (['street', 'district', 'city'].includes(miss[0])) stage('manual'); msg.textContent = `Falta ${miss[1]}.`; form[miss[2]].focus(); return; }
    if (a.cep.length !== 8) { stage('manual'); msg.textContent = 'O CEP tem 8 números.'; form.cep2.focus(); return; }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; msg.textContent = 'Salvando…';
    try { const saved = await saveAddress(a, id); msg.textContent = ''; onSaved?.(saved); }
    catch (err) { msg.textContent = friendly(err); }
    finally { btn.disabled = false; }
  });
}

// janela "Meus endereços" (menu da conta)
export async function openAddressBook() {
  let m = document.getElementById('addr-modal');
  if (!m) {
    document.body.insertAdjacentHTML('beforeend', `<div class="auth" id="addr-modal" hidden>
      <div class="auth-panel wide" role="dialog" aria-modal="true" aria-labelledby="addr-t">
        <button class="round auth-x" type="button" data-addr-close aria-label="Fechar">×</button>
        <p class="eyebrow">Minha conta</p>
        <h2 id="addr-t">Meus endereços</h2>
        <p class="small">Salve onde você quer receber. Na hora de finalizar é só escolher.</p>
        <div id="addr-body"></div>
      </div></div>`);
    m = document.getElementById('addr-modal');
    const close = () => { m.hidden = true; document.dispatchEvent(new CustomEvent('vs-cover', { detail: false })); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-addr-close]')) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) close(); });
  }
  document.dispatchEvent(new CustomEvent('vs-cover', { detail: true }));
  m.hidden = false;
  const body = m.querySelector('#addr-body');
  const draw = async () => {
    body.innerHTML = '<p class="muted">Carregando…</p>';
    let list = [];
    try { list = await listAddresses(); } catch (err) { body.innerHTML = `<p class="muted">${friendly(err)}</p>`; return; }
    body.innerHTML = `<ul class="addr-list">${list.map((a) => `<li data-id="${a.id}">
        <div><b>${esc(a.label)}</b>${a.is_default ? '<span class="tag">Principal</span>' : ''}<p>${esc(a.recipient)}<br>${addressLine(a)}</p></div>
        <div class="addr-act"><button class="link" type="button" data-edit>Editar</button><button class="link" type="button" data-del>Excluir</button></div></li>`).join('')
      }</ul>
      <button class="addr-add" type="button" data-new><span>+</span>Adicionar novo endereço</button><div id="addr-edit"></div>`;
    const edit = (a = {}) => {
      const box = body.querySelector('#addr-edit'); box.innerHTML = formHTML(a);
      body.querySelector('[data-new]').hidden = true; body.querySelector('.addr-list').hidden = !list.length;
      bindForm(box.querySelector('form'), { id: a.id || null, onSaved: draw, onCancel: list.length ? draw : () => m.querySelector('[data-addr-close]').click() });
      box.querySelector('input').focus();
    };
    const { data: { user } } = await supabase.auth.getUser();
    const me = user?.user_metadata?.full_name || '';
    body.querySelector('[data-new]').onclick = () => edit({ recipient: me, is_default: !list.length });
    if (!list.length) edit({ recipient: me, is_default: true });
    body.querySelectorAll('.addr-list li[data-id]').forEach((li) => {
      const a = list.find((x) => x.id === +li.dataset.id);
      li.querySelector('[data-edit]').onclick = () => edit(a);
      li.querySelector('[data-del]').onclick = async () => { if (!confirm('Excluir este endereço?')) return; try { await deleteAddress(a.id); draw(); } catch (err) { alert(friendly(err)); } };
    });
  };
  draw();
}
