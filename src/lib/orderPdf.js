// PDF do pedido (ficha para separar e enviar) + compartilhar no WhatsApp.
// O jsPDF só é baixado quando alguém pede o PDF.
import { brl, STORE } from '../data/products.js';

// imagem -> JPEG (o PDF aceita qualquer foto: webp, png, do Storage)
function toJpeg(src, size = 240, bg = '#F4F3F1') {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, size, size);
        const k = Math.max(size / im.width, size / im.height), w = im.width * k, h = im.height * k;
        x.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
        res(c.toDataURL('image/jpeg', 0.85));
      } catch { res(null); }
    };
    im.onerror = () => res(null);
    im.src = src;
  });
}

const CEP = (c) => String(c || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');

/**
 * o = { number, created_at, customer_name, customer_phone, delivery, notes, subtotal, discount, total, coupon_code,
 *       shipping_address, channel, status }
 * items = [{ name, color, size, qty, unit_price, photo }]
 */
export async function orderPdf(o, items) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, gold = [171, 133, 70], ink = [11, 11, 11], gray = [110, 110, 108];
  const [logo, ...pics] = await Promise.all([toJpeg(`${import.meta.env.BASE_URL}brand/vs-icon-1024.png`, 300, '#0B0B0B'), ...items.map((i) => (i.photo ? toJpeg(i.photo) : null))]);

  // cabeçalho preto com a marca
  doc.setFillColor(...ink); doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(...gold); doc.rect(0, 38, W, 1.2, 'F');
  if (logo) doc.addImage(logo, 'JPEG', M, 7, 24, 24);
  doc.setTextColor(243, 238, 229); doc.setFont('times', 'normal'); doc.setFontSize(22);
  doc.text(`Pedido #${o.number}`, M + 30, 19);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(200, 169, 104);
  doc.text(`${STORE.name.toUpperCase()} · ${new Date(o.created_at || Date.now()).toLocaleString('pt-BR')} · ${o.channel === 'site' || !o.channel ? 'Venda pelo site' : 'Venda na loja'}`, M + 30, 27);
  doc.setFontSize(10); doc.setTextColor(243, 238, 229);
  doc.text(o.delivery === 'entrega' ? 'ENTREGA' : 'RETIRADA NA LOJA', W - M, 19, { align: 'right' });
  if (o.status) { doc.setTextColor(200, 169, 104); doc.text(String(o.status).toUpperCase(), W - M, 26, { align: 'right' }); }

  let y = 50;
  const label = (t, x, yy) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gold); doc.text(t.toUpperCase(), x, yy); };
  const body = (lines, x, yy) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...ink); doc.text(lines, x, yy); return yy + lines.length * 5; };

  // cliente e entrega
  label('Cliente', M, y);
  let y1 = body([o.customer_name || 'Cliente', o.customer_phone ? `WhatsApp ${o.customer_phone}` : ''].filter(Boolean), M, y + 6);
  label(o.delivery === 'entrega' ? 'Enviar para' : 'Retirada', 110, y);
  const a = o.shipping_address;
  const addr = a ? [a.recipient, `${a.street}, ${a.number}${a.complement ? ' - ' + a.complement : ''}`, `${a.district} - ${a.city}/${a.state}`, `CEP ${CEP(a.cep)}`, a.reference ? `Ref.: ${a.reference}` : ''].filter(Boolean)
    : o.delivery === 'entrega' ? ['Endereço a confirmar com o cliente'] : [`Loja ${STORE.city}`, STORE.hours];
  const y2 = body(addr.flatMap((l) => doc.splitTextToSize(l, W - M - 110)), 110, y + 6);
  y = Math.max(y1, y2) + 6;
  if (o.notes) { label('Observações', M, y); y = body(doc.splitTextToSize(o.notes, W - 2 * M), M, y + 6) + 4; }

  // itens com foto
  doc.setDrawColor(220, 218, 214); doc.line(M, y, W - M, y); y += 6;
  label('Peças para separar', M, y); label('Qtd.', 140, y); label('Valor', W - M - 12, y); y += 4;
  items.forEach((i, k) => {
    if (y > 250) { doc.addPage(); y = 20; }
    const h = 26;
    if (pics[k]) doc.addImage(pics[k], 'JPEG', M, y, 22, 22); else { doc.setFillColor(236, 235, 232); doc.rect(M, y, 22, 22, 'F'); }
    doc.setDrawColor(...gold); doc.rect(W - M - 6, y + 2, 5, 5); // caixinha para marcar ao separar
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...ink);
    doc.text(doc.splitTextToSize(i.name, 100), M + 27, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
    doc.text([i.color && `Cor: ${i.color}`, i.size && `Tam.: ${i.size}`].filter(Boolean).join('    '), M + 27, y + 15);
    doc.setFontSize(14); doc.setTextColor(...ink); doc.text(`${i.qty}x`, 140, y + 11);
    doc.setFontSize(10.5); doc.text(brl(+i.unit_price * i.qty), W - M - 9, y + 11, { align: 'right' });
    y += h; doc.setDrawColor(235, 233, 230); doc.line(M, y - 2, W - M, y - 2);
  });

  // totais
  y += 4; if (y > 255) { doc.addPage(); y = 20; }
  const row = (t, v, big = false) => {
    doc.setFont(big ? 'times' : 'helvetica', big ? 'bold' : 'normal'); doc.setFontSize(big ? 15 : 10.5); doc.setTextColor(...(big ? ink : gray));
    doc.text(t, 130, y); doc.text(v, W - M, y, { align: 'right' }); y += big ? 9 : 6;
  };
  const pcs = items.reduce((t, i) => t + i.qty, 0);
  row(`${pcs} peça${pcs > 1 ? 's' : ''} · subtotal`, brl(+o.subtotal));
  if (+o.discount) row(`Desconto${o.coupon_code ? ' (' + o.coupon_code + ')' : ''}`, '-' + brl(+o.discount));
  if (o.delivery === 'entrega') row('Frete', +o.shipping ? brl(+o.shipping) : 'grátis');
  doc.setDrawColor(...gold); doc.line(130, y - 3, W - M, y - 3); y += 3;
  row('Total', brl(+o.total), true);

  // rodapé
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...gray);
  doc.text(`${STORE.company} · ${STORE.city} · WhatsApp +${STORE.whatsapp} · @${STORE.instagram}`, W / 2, 288, { align: 'center' });
  return doc.output('blob');
}

export const pdfName = (o) => `pedido-${o.number}-vs-imports.pdf`;

export function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// celular: abre a folha de compartilhar com o PDF (escolha o WhatsApp).
// computador: baixa o PDF e abre o WhatsApp com a mensagem para anexar.
export async function sharePdf(blob, name, { text, phone = STORE.whatsapp } = {}) {
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name, text }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
  }
  downloadBlob(blob, name);
  open(`https://wa.me/${phone || ''}?text=${encodeURIComponent(text + '\n\n(PDF do pedido baixado: é só anexar aqui)')}`, '_blank', 'noopener');
  return 'download';
}

// guarda o PDF (bucket privado "pedidos") e devolve um link assinado que vale 30 dias
export async function uploadPdf(supabase, blob, o) {
  const { data: { user } } = await supabase.auth.getUser();
  const path = `${user.id}/${pdfName(o)}`;
  const up = await supabase.storage.from('pedidos').upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw up.error;
  const { data, error } = await supabase.storage.from('pedidos').createSignedUrl(path, 60 * 60 * 24 * 30);
  if (error) throw error;
  return data.signedUrl;
}

// mensagem curta pronta para o WhatsApp da loja
export const waOrderLink = (o, url, phone = STORE.whatsapp) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(`Olá, VS Imports! Acabei de fazer o pedido #${o.number} (${brl(+o.total)}, ${o.delivery === 'entrega' ? 'entrega' : 'retirada na loja'}).\nPDF do pedido: ${url}`)}`;
