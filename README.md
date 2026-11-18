# VS Imports — e-commerce, loja 3D e sistema da loja

Loja física (Capão Raso, Curitiba) + loja online com loja 3D navegável + painel do dono
(vendas no balcão/Instagram/WhatsApp, estoque por cor e tamanho, financeiro e relatório mensal).

```bash
npm install
npm run dev        # desenvolvimento (abre no celular pela rede com --host)
npm run build      # gera dist/ para publicar (Vercel, Netlify, qualquer host estático)
npm run assets     # regenera as imagens provisórias em public/img a partir dos modelos 3D
```

## Páginas

| Página | O que faz |
|---|---|
| `index.html` | Capa, anel de peças, loja 3D (entrar/sair), coleções, destaques, catálogo (do banco), endereço com mapa |
| `produto.html` | Peça com 3D + até 5 fotos, promoção De/Por, cores e tamanhos com esgotado por variante, sacola |
| `politicas.html` | Trocas, entrega, pagamento, LGPD e termos (texto modelo: revisar com contador/advogado) |
| `admin.html` | **Painel da loja** (só vendedor/dono): Resumo, Vender, Pedidos, Produtos, Despesas, Relatório, Ajustes |

## Banco de dados (Supabase)

Projeto `vs-imports` (região São Paulo). As chaves em `.env` são públicas por natureza;
quem protege os dados são as regras do banco (RLS) e as funções em `supabase/migrations/`.

Regras que rodam **no banco** (o navegador nunca decide preço, desconto ou estoque):
- **Cupom PRIMEIRA5**: 5% automático na primeira compra de quem tem conta (site e balcão).
- **Estoque por variante (cor + tamanho)**: toda venda baixa na hora, com trava da linha, então duas vendas simultâneas não vendem a mesma peça. Sem estoque, a venda é recusada e a peça/variante aparece **Esgotado** no site. Cancelar devolve o estoque.
- **Promoção**: preço normal + promocional (+ data de fim opcional); volta sozinho ao normal.
- **Custo e lucro**: cada item vendido guarda preço e custo do momento. Custo só o dono vê.
- **Financeiro**: faturamento, custo das peças, lucro bruto, despesas e lucro líquido por período.
- **Mês comercial**: o dono define o dia de início (Ajustes); relatório em PDF e fechamento do mês.

### Primeiro acesso do dono
1. Crie a conta pelo site (botão **Entrar → Criar conta**) e confirme o e-mail.
2. Dê o papel de dono a essa conta uma única vez, no SQL Editor do Supabase:
   ```sql
   update public.profiles set role = 'dono' where email = 'EMAIL_DO_DONO';
   ```
3. Abra `/admin.html`. Vendedores: criam conta no site e o dono libera em **Ajustes → Equipe**.

### Configuração de e-mail (Supabase → Authentication → URL Configuration)
Coloque o endereço do site em **Site URL** e em **Redirect URLs** (ex.: `http://localhost:5173`
no desenvolvimento e o domínio final depois). Os links de confirmação e de nova senha voltam para lá.

## Estrutura do código

| Arquivo | O que é |
|---|---|
| `src/data/products.js` | Dados da loja (WhatsApp, endereço, CNPJ, e-mail) e catálogo local de reserva |
| `src/data/catalog.js` | Catálogo vivo do banco (preço final, promoção, fotos, variantes) |
| `src/lib/supabase.js` | Cliente do Supabase e mensagens de erro em português |
| `src/ui/auth.js` | Login, cadastro, recuperar senha, "Meus pedidos" |
| `src/ui/bag.js` | Sacola agrupada por peça, checkout pelo banco, 5% na 1ª compra |
| `src/admin.js` | Painel da loja |
| `src/three/store.js` | Loja 3D (layout do projeto da sala 5 × 9 m) |
| `supabase/migrations/` | Estrutura do banco, em ordem |

## Desempenho
- Capa sem WebGL (só HTML/CSS); 3D pesado montado com o navegador ocioso, não durante a rolagem.
- Loja 3D: geometria fundida, roupas instanciadas, sombra calculada uma vez, render só quando algo muda; câmera presa dentro da sala; gestos só depois de "Entrar na loja".
- Cards com imagens de 480 px no celular; seções abaixo da dobra com `content-visibility`.
- Fotos enviadas pelo painel são reduzidas para 2000 px (WebP/JPEG) no próprio navegador.

## Marca
- `public/brand/vs-logo.svg`: logo oficial em vetor (`node scripts/build-logo.mjs`); PNGs em 4096 px.
- Paleta: preto `#0B0B0B`, ouro `#AB8546` / `#C8A968` / `#EED39C`, prata `#BBBAB6` / `#F8F4F3`.

## Permissões do Claude
`.claude/settings.json` libera as ferramentas do Supabase sem perguntar a cada uso neste repositório.
