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

// formulário (mesmo HTML no checkout e em "Meus endereços")
export const formHTML = (a = {}) => `
<form class="addr-form" novalidate>
  <div class="af-grid">
    <label class="lf s2"><input name="recipient" maxlength="120" required placeholder=" " value="${esc(a.recipient)}" autocomplete="name"><span>Quem vai receber</span></label>
    <label class="lf"><input name="label" maxlength="30" placeholder=" " value="${esc(a.label || 'Casa')}"><span>Apelido (Casa, Trabalho)</span></label>
    <label class="lf"><input name="cep" inputmode="numeric" maxlength="9" required placeholder=" " value="${cepFmt(a.cep)}" autocomplete="postal-code"><span>CEP</span></label>
    <label class="lf s2"><input name="street" maxlength="160" required placeholder=" " value="${esc(a.street)}" autocomplete="address-line1"><span>Rua / avenida</span></label>
    <label class="lf"><input name="number" maxlength="20" required placeholder=" " value="${esc(a.number)}"><span>Número</span></label>
    <label class="lf"><input name="complement" maxlength="80" placeholder=" " value="${esc(a.complement)}" autocomplete="address-line2"><span>Complemento</span></label>
    <label class="lf"><input name="district" maxlength="80" required placeholder=" " value="${esc(a.district)}"><span>Bairro</span></label>
    <label class="lf"><input name="city" maxlength="80" required placeholder=" " value="${esc(a.city)}" autocomplete="address-level2"><span>Cidade</span></label>
    <label class="lf sel"><select name="state" required>${UF.map((u) => `<option${u === (a.state || 'PR') ? ' selected' : ''}>${u}</option>`).join('')}</select><span>Estado</span></label>
    <label class="lf s2"><input name="reference" maxlength="160" placeholder=" " value="${esc(a.reference)}"><span>Ponto de referência</span></label>
  </div>
  <label class="check"><input name="is_default" type="checkbox"${a.is_default || !a.id ? ' checked' : ''}> Usar como endereço principal</label>
  <p class="addr-msg" role="status" aria-live="polite"></p>
  <div class="addr-actions"><button class="pill solid" type="submit">Salvar endereço</button><button class="pill" type="button" data-addr-cancel>Cancelar</button></div>
</form>`;

// liga o formulário: busca o CEP (ViaCEP), valida e salva
export function bindForm(form, { id = null, onSaved, onCancel } = {}) {
  const msg = form.querySelector('.addr-msg');
  form.cep.addEventListener('input', async () => {
    form.cep.value = cepFmt(form.cep.value);
    const c = form.cep.value.replace(/\D/g, '');
    if (c.length !== 8) return;
    msg.textContent = 'Buscando o CEP…';
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`).then((x) => x.json());
      if (r.erro) { msg.textContent = 'CEP não encontrado. Confira ou preencha à mão.'; return; }
      if (r.logradouro) form.street.value = r.logradouro;
      if (r.bairro) form.district.value = r.bairro;
      form.city.value = r.localidade || form.city.value;
      if (r.uf) form.state.value = r.uf;
      msg.textContent = '';
      (r.logradouro ? form.number : form.street).focus();
    } catch { msg.textContent = ''; }
  });
  form.querySelector('[data-addr-cancel]').addEventListener('click', () => onCancel?.());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const a = {
      label: (v.label || 'Casa').trim().slice(0, 30), recipient: v.recipient.trim(), cep: v.cep.replace(/\D/g, ''),
      street: v.street.trim(), number: v.number.trim(), complement: v.complement.trim() || null, district: v.district.trim(),
      city: v.city.trim(), state: v.state, reference: v.reference.trim() || null, is_default: !!v.is_default,
    };
    const miss = [['recipient', 'quem vai receber'], ['cep', 'o CEP'], ['street', 'a rua'], ['number', 'o número'], ['district', 'o bairro'], ['city', 'a cidade']].find(([k]) => !a[k]);
    if (miss) { msg.textContent = `Preencha ${miss[1]}.`; form[miss[0]].focus(); return; }
    if (a.cep.length !== 8) { msg.textContent = 'O CEP tem 8 números.'; form.cep.focus(); return; }
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
      || '<li class="muted">Nenhum endereço salvo ainda.</li>'}</ul>
      <button class="pill solid" type="button" data-new>Adicionar endereço</button><div id="addr-edit"></div>`;
    const edit = (a = {}) => {
      const box = body.querySelector('#addr-edit'); box.innerHTML = formHTML(a);
      body.querySelector('[data-new]').hidden = true;
      bindForm(box.querySelector('form'), { id: a.id || null, onSaved: draw, onCancel: draw });
      box.querySelector('input').focus();
    };
    body.querySelector('[data-new]').onclick = () => edit({ is_default: !list.length });
    body.querySelectorAll('.addr-list li[data-id]').forEach((li) => {
      const a = list.find((x) => x.id === +li.dataset.id);
      li.querySelector('[data-edit]').onclick = () => edit(a);
      li.querySelector('[data-del]').onclick = async () => { if (!confirm('Excluir este endereço?')) return; try { await deleteAddress(a.id); draw(); } catch (err) { alert(friendly(err)); } };
    });
  };
  draw();
}
