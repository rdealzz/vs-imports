// Gera os modelos de e-mail do Supabase Auth (em português, com a marca).
// Uso: node scripts/build-emails.mjs  ->  supabase/templates/*.html
// Depois cole cada um em Supabase > Authentication > Emails > Templates.
import { writeFileSync, mkdirSync } from 'node:fs';

const BANNER = 'https://lmwosmsnpsguqymbuanv.supabase.co/storage/v1/object/public/produtos/email/banner.jpg';
const INK = '#16130F', SOFT = '#5E5A54', GOLD = '#AB8546', CREAM = '#F4F1EB', LINE = '#E4DED3';

const layout = ({ preheader, title, intro, button, after, note }) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
    <tr><td style="background:#120F0B;line-height:0;">
      <img src="${BANNER}" width="600" alt="VS Imports" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
    </td></tr>
    <tr><td style="height:3px;background:${GOLD};line-height:3px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:40px 44px 8px;font-family:Georgia,'Times New Roman',serif;color:${INK};">
      <h1 style="margin:0 0 16px;font-weight:normal;font-size:30px;line-height:1.15;">${title}</h1>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${SOFT};">${intro}</p>
    </td></tr>
    <tr><td align="left" style="padding:28px 44px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:${INK};border-radius:4px;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:16px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#F6E7C4;text-decoration:none;letter-spacing:.3px;">${button}</a>
        </td></tr></table>
    </td></tr>
    <tr><td style="padding:18px 44px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${SOFT};">${after}</td></tr>
    <tr><td style="padding:8px 44px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8D877E;">
      Se o botão não abrir, copie este endereço no navegador:<br>
      <a href="{{ .ConfirmationURL }}" style="color:${GOLD};word-break:break-all;">{{ .ConfirmationURL }}</a>
    </td></tr>
    <tr><td style="padding:0 44px;"><div style="border-top:1px solid ${LINE};"></div></td></tr>
    <tr><td style="padding:22px 44px 34px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#8D877E;">
      ${note}<br><br>
      <span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:${INK};">VS Imports</span> · A loja que veste os artistas<br>
      Capão Raso, Curitiba · <a href="{{ .SiteURL }}" style="color:${GOLD};text-decoration:none;">visite o site</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>
`;

const hello = `Olá{{ if .Data.full_name }}, {{ .Data.full_name }}{{ end }}!`;
const T = {
  'confirmar-cadastro': { subject: 'Confirme seu e-mail e ganhe 5% na primeira compra', html: layout({
    preheader: 'Falta um clique para ativar sua conta na VS Imports.',
    title: 'Bem-vindo à VS Imports',
    intro: `${hello} Sua conta está quase pronta. Confirme seu e-mail para ativar o cadastro e garantir <b style="color:${INK};">5% de desconto na primeira compra</b>, no site ou na loja física.`,
    button: 'Confirmar meu e-mail',
    after: 'Com a conta ativa você acompanha seus pedidos, recebe os lançamentos antes de todo mundo e pode comprar pelo site e retirar no mesmo dia na loja.',
    note: 'Você recebeu este e-mail porque criou uma conta na VS Imports com {{ .Email }}. Se não foi você, é só ignorar: nenhuma conta será ativada.' }) },
  'recuperar-senha': { subject: 'Crie uma nova senha na VS Imports', html: layout({
    preheader: 'Use o link para criar uma nova senha.',
    title: 'Vamos criar uma nova senha',
    intro: `${hello} Recebemos um pedido para trocar a senha da sua conta. Toque no botão abaixo para escolher uma nova.`,
    button: 'Criar nova senha',
    after: 'Por segurança, o link vale por pouco tempo e só pode ser usado uma vez.',
    note: 'Se você não pediu a troca de senha, ignore este e-mail: sua senha atual continua valendo. A VS Imports nunca pede sua senha por mensagem.' }) },
  'alterar-email': { subject: 'Confirme seu novo e-mail na VS Imports', html: layout({
    preheader: 'Confirme a troca do e-mail da sua conta.',
    title: 'Confirme seu novo e-mail',
    intro: `${hello} Você pediu para trocar o e-mail da sua conta de {{ .Email }} para {{ .NewEmail }}. Confirme para concluir.`,
    button: 'Confirmar novo e-mail',
    after: 'Depois de confirmar, use o novo e-mail para entrar.',
    note: 'Se você não pediu essa troca, ignore este e-mail e fale com a gente pelo WhatsApp.' }) },
  'link-de-acesso': { subject: 'Seu link para entrar na VS Imports', html: layout({
    preheader: 'Entre na sua conta com um toque.',
    title: 'Seu link de acesso',
    intro: `${hello} Toque no botão para entrar na sua conta, sem precisar de senha.`,
    button: 'Entrar na minha conta',
    after: 'O link vale por pouco tempo e só pode ser usado uma vez.',
    note: 'Se você não pediu este acesso, ignore este e-mail.' }) },
  convite: { subject: 'Você foi convidado para a VS Imports', html: layout({
    preheader: 'Aceite o convite e crie sua senha.',
    title: 'Você foi convidado',
    intro: 'Você recebeu um convite para ter uma conta na VS Imports. Aceite para criar sua senha e entrar.',
    button: 'Aceitar convite',
    after: 'Se o convite for para a equipe da loja, o acesso ao painel é liberado pelo dono depois do primeiro login.',
    note: 'Se você não esperava este convite, é só ignorar.' }) },
};

mkdirSync('supabase/templates', { recursive: true });
const index = [];
for (const [name, t] of Object.entries(T)) { writeFileSync(`supabase/templates/${name}.html`, t.html); index.push(`${name}.html  ->  Assunto: ${t.subject}`); }
writeFileSync('supabase/templates/ASSUNTOS.txt', index.join('\n') + '\n');
console.log(index.join('\n'));
