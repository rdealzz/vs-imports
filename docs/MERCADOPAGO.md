# Mercado Pago na VS Imports

O site usa o **Checkout Pro** do Mercado Pago: o cliente confirma o pedido, vai para a tela segura do Mercado Pago,
paga com **Pix** ou **cartão (até 3x)** e volta para o site. O dinheiro cai na conta Mercado Pago da loja.

## Já está construído

- **Edge Function `pagamento-criar`:** cria o pagamento com o valor do pedido no banco (nunca o do navegador).
  O link vence antes da reserva de 48 h. Boleto fica de fora porque demora dias.
- **Edge Function `pagamento-webhook`:** recebe o aviso do Mercado Pago, consulta o pagamento direto no Mercado Pago e,
  se estiver aprovado com o valor certo, marca o pedido como **pago** sozinho (Pix ou crédito/débito).
  Pagamento depois do pedido expirar, em duplicidade ou com valor diferente vira um aviso nas observações do pedido.
- **Checkout:** com o token salvo, o botão vira "Ir para o pagamento". Sem token, tudo continua como antes
  (pedido reservado + WhatsApp).
- **Volta para o site** (`checkout.html?pedido=…`): mostra aprovado, aguardando, em análise ou recusado, com o botão "Pagar agora".
- **Meus pedidos:** botão "Pagar agora" nos pedidos pendentes e o código de rastreio.
- **Painel → Pedidos:** mostra a situação do Mercado Pago em cada pedido.

## Para ligar

1. Entrar na conta Mercado Pago **da loja** (de preferência a conta com CNPJ).
2. Abrir https://www.mercadopago.com.br/developers/panel/app → **Criar aplicação**:
   nome "Site VS Imports", solução **Pagamentos online**, produto **Checkout Pro**.
3. Na aplicação, em **Credenciais de produção**, copiar o **Access Token** (começa com `APP_USR-`).
   Se pedir para ativar as credenciais, preencher o ramo (Vestuário) e o endereço do site.
4. No Supabase: **Edge Functions → Secrets**, adicionar:
   - `MP_ACCESS_TOKEN` = o Access Token
   - `SITE_URL` = endereço do site (ex.: `https://vsimpoorts.com.br`), usado se o navegador não informar a página de volta
5. Pronto: o checkout passa a mandar para o Mercado Pago sozinho (o site detecta o token).

Teste: fazer um pedido de R$ 1 a R$ 5 pagando com Pix e conferir se ele vira "pago" no painel; depois devolver
o dinheiro em Mercado Pago → Atividade → pagamento → **Devolver**. (Com um token de teste `TEST-…` o site usa
o ambiente de testes do Mercado Pago.)

Nunca colar o Access Token em chat, WhatsApp ou no código: ele movimenta o dinheiro da conta.
