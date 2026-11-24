# Integração SuperFrete na VS Imports

Fonte: documentação oficial da API SuperFrete (superfrete.readme.io), consultada em 24/11/2026.
A integração é gratuita e não tem mensalidade; as etiquetas são pagas com o saldo da carteira SuperFrete.

## O que a integração vai fazer no nosso site

1. **Checkout:** o cliente digita o CEP e vê os fretes reais (PAC, SEDEX, Mini Envios, Jadlog, Loggi, J&T) com preço e prazo,
   no lugar da nossa tabela por região. Acima de R$ 349,90 o site continua dando frete grátis (a loja paga a etiqueta).
2. **Painel > Pedidos:** botão **Gerar etiqueta** num pedido pago: cria o frete na SuperFrete, paga com o saldo da carteira
   e abre o PDF da etiqueta para imprimir.
3. **Rastreio automático:** a SuperFrete avisa o site (webhook) quando a etiqueta é gerada, postada e entregue; o pedido muda
   de status sozinho e o código de rastreio aparece para o cliente em "Meus pedidos".

## Passo a passo (o que o dono faz)

1. **Criar a conta** em https://web.superfrete.com (com o CNPJ/CPF da loja e o endereço de onde as peças saem,
   no Capão Raso). Esse endereço é o remetente das etiquetas.
2. **Testar primeiro no Sandbox** (ambiente de teste, etiquetas sem validade):
   - acesse https://sandbox.superfrete.com/#/integrations, em **Desenvolvedores** clique em **Integrar** e depois **Confirmar**;
   - copie o **token de Sandbox** que aparece na tela;
   - para simular compras: https://sandbox.superfrete.com/#/account/credits → **Recarregue com Pix** → copie o código Pix
     e cole na barra de endereço do navegador (isso simula o pagamento).
3. **Enviar o token para o desenvolvedor por um canal seguro** (nunca por WhatsApp/e-mail aberto). Ele fica guardado
   no servidor (Supabase → Edge Functions → Secrets), nunca no código do site.
4. **Depois de testado, gerar o token de Produção:** https://web.superfrete.com/#/integrations → **Desenvolvedores**
   → **Integrar** → **Confirmar**. Trocar o token de Sandbox pelo de Produção no servidor.
5. **Colocar saldo na carteira** (Produção): painel → **Perfil** → **Carteira** → **Recarregue com Pix**.
6. (Opcional) Etiqueta em impressora térmica: menu **Etiquetas** → **Configurações** → ativar **A6 (Zebra)**.
7. Cadastrar **peso e medidas** das peças (o frete real depende disso). Sugestão de padrão: camiseta 0,3 kg, bermuda 0,4 kg,
   calça 0,6 kg, boné 0,2 kg, tênis 1,2 kg na caixa (dá para ajustar por peça no painel).

## Detalhes técnicos (para o desenvolvedor)

| Item | Valor (documentação) |
|---|---|
| URL Produção | `https://api.superfrete.com` |
| URL Sandbox | `https://sandbox.superfrete.com` |
| Autenticação | header `Authorization: Bearer {token}` |
| Header obrigatório | `User-Agent: Nome da aplicação e versão (email@contato)` — ex.: `VS Imports 1.0 (email da loja)` |
| Cotação | `POST /api/v0/calculator` — `from`, `to` (CEP), `services` (`"1,2,17,3,31,33"`), `options` (`own_hand`, `receipt`, `insurance_value`, `use_insurance_value`) e `package` {`weight` kg, `height`/`width`/`length` cm} **ou** `products` [{`quantity`, `weight`, `height`, `width`, `length`}] |
| Resposta da cotação | lista com `id`, `name`, `price`, `discount`, `delivery_time`, `delivery_range`, `packages` (caixa ideal), `company`, `has_error` |
| Códigos de serviço | 1 PAC · 2 SEDEX · 17 Mini Envios · 3 Jadlog · 31 Loggi · 33 J&T |
| Criar frete | `POST /api/v0/cart` — `from` e `to` {`name`, `address`, `complement`, `number`, `district`, `city`, `state_abbr`, `postal_code`; no `to` também `email`, `phone`, `document` CPF/CNPJ obrigatório}, `service`, `volume` {`height`,`width`,`length`,`weight`} = **caixa ideal devolvida pela cotação**, `options` (nota fiscal opcional) |
| Pagar e gerar etiqueta | `POST /api/v0/checkout` (debita o saldo da carteira) |
| PDF da etiqueta | `POST /api/v0/tag/print` com `{ "orders": ["<id do pedido>"] }` → URL do PDF |
| Cancelar | `POST /api/v0/order/cancel` (id + motivo; só antes de postar; estorna para a carteira) |
| Webhook | `POST /api/v0/webhook` cadastra a URL; eventos `order.created`, `order.released`, `order.generated`, `order.posted`, `order.delivered`, `order.cancelled` |

### Como encaixa no nosso sistema

- **Tudo no servidor:** o token não pode ir para o navegador. Criar Edge Functions no Supabase:
  - `frete-cotar` (chamada pelo checkout): recebe CEP + itens da sacola, monta `products` com peso/medidas do banco,
    chama `/calculator` e devolve as opções; o `place_order` passa a gravar o serviço escolhido e o valor cotado
    (revalidado no servidor para ninguém alterar o preço).
  - `frete-etiqueta` (botão no painel, só dono/dev): `/cart` → `/checkout` → `/tag/print`, grava o id da SuperFrete,
    o código de rastreio e o link do PDF no pedido.
  - `frete-webhook` (URL pública cadastrada na SuperFrete): atualiza o status do pedido (postado/entregue) e o rastreio.
- **CPF do cliente:** a etiqueta exige `document` (CPF/CNPJ) do destinatário. Precisamos pedir o CPF no checkout de entrega.
- **Banco:** adicionar em `products` peso (kg) e medidas (cm); em `orders`: `shipping_service`, `shipping_quote`,
  `superfrete_id`, `tracking_code`, `label_url`.
- **Frete grátis acima de R$ 349,90:** o site mostra R$ 0,00 para o cliente, mas a etiqueta é comprada normalmente
  (a loja paga). O painel mostra quanto foi gasto com frete no mês.

### Rede deste ambiente de desenvolvimento

Já estão liberados `api.superfrete.com` e `sandbox.superfrete.com`. Para criar as Edge Functions, faltam só os tokens
(Sandbox primeiro).

## Status da integração (já construída)

- **Edge Functions no ar:** `frete-cotar` (checkout), `frete-etiqueta` (painel: gerar, reimprimir, rastrear, cancelar)
  e `frete-webhook` (rastreio automático; não confia no aviso: consulta a SuperFrete pelo id).
- **Checkout:** opções de frete (PAC, SEDEX, Mini Envios, Jadlog, Loggi) com preço e prazo, CPF de quem recebe
  (validado) e cotação gravada no servidor; acima do valor de frete grátis o cliente paga R$ 0,00.
  Sem token no servidor, a cotação usa a tabela por região do painel (nada quebra).
- **Painel → Pedidos:** em pedidos de entrega pagos aparece **Gerar etiqueta de envio** (desconta o saldo da carteira e
  abre o PDF), depois **Imprimir etiqueta de envio**, **Atualizar rastreio** e **Cancelar etiqueta**.
- **Painel → Ajustes → Remetente das etiquetas:** endereço de onde as peças saem (obrigatório para gerar etiqueta).

## Para ligar (falta só isto)

1. No Supabase: **Edge Functions → Secrets**, adicionar:
   - `SUPERFRETE_TOKEN` = token da SuperFrete (primeiro o do Sandbox; depois o de Produção)
   - `SUPERFRETE_URL` = `https://sandbox.superfrete.com` para testes, `https://api.superfrete.com` em produção
   - `SUPERFRETE_UA` = `VS Imports 1.0 (e-mail de contato da loja)`
2. Preencher o remetente em **Painel → Ajustes**.
3. Cadastrar o webhook na SuperFrete apontando para
   `https://lmwosmsnpsguqymbuanv.supabase.co/functions/v1/frete-webhook`
   (eventos `order.generated`, `order.posted`, `order.delivered`, `order.cancelled`).
