# E-mails da VS Imports (Supabase Auth)

Modelos em português, com o banner da marca. Gerados por `node scripts/build-emails.mjs`.
O banner fica em `produtos/email/banner.jpg` no Storage (link público).

## 1. Colar os modelos
Supabase → **Authentication → Emails → Templates**. Para cada modelo, cole o assunto e o HTML:

| Modelo no Supabase | Arquivo | Assunto |
|---|---|---|
| Confirm signup | `confirmar-cadastro.html` | Confirme seu e-mail e ganhe 5% na primeira compra |
| Reset password | `recuperar-senha.html` | Crie uma nova senha na VS Imports |
| Change email address | `alterar-email.html` | Confirme seu novo e-mail na VS Imports |
| Magic link | `link-de-acesso.html` | Seu link para entrar na VS Imports |
| Invite user | `convite.html` | Você foi convidado para a VS Imports |

## 2. Remetente "VS Imports" no lugar de "Supabase Auth" (obrigatório para clientes)
O servidor de e-mail padrão do Supabase **só entrega para membros da equipe do projeto**
e tem limite baixo por hora. Para os clientes receberem, e para o remetente aparecer como a loja:

1. Crie uma conta num serviço de e-mail transacional (ex.: Resend, Brevo ou Amazon SES).
2. Cadastre e verifique o domínio da loja (ex.: `vsimports.com.br`) com os registros DNS que o serviço pedir.
3. Supabase → **Authentication → Emails → SMTP Settings** → ative **Custom SMTP** e preencha:
   - **Sender email**: `contato@vsimports.com.br` (ou `nao-responda@...`)
   - **Sender name**: `VS Imports`
   - Host, porta, usuário e senha que o serviço fornecer.
4. Em **Authentication → Rate Limits**, ajuste o limite de e-mails por hora (começa em 30).

## 3. Endereço do site
Supabase → **Authentication → URL Configuration**: em **Site URL** e **Redirect URLs** coloque o
endereço do site (ex.: `https://vsimports.com.br` e, no desenvolvimento, `http://localhost:5173`).
É para lá que o botão do e-mail leva o cliente.
