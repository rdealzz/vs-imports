# VS Imports — site com loja 3D

Loja física (Capão Raso, Curitiba) + loja online com uma loja 3D navegável.

```bash
npm install
npm run dev        # desenvolvimento (abre no celular pela rede com --host)
npm run build      # gera dist/ para publicar (Vercel, Netlify, qualquer host estático)
npm run assets     # regenera as imagens provisórias em public/img a partir dos modelos 3D
```

## Estrutura

| Arquivo | O que é |
|---|---|
| `index.html`, `src/main.js` | Home: abertura com luz nas letras, anel de peças, loja 3D, coleções, destaques, partículas, editorial, catálogo, loja física |
| `produto.html`, `src/produto.js` | Página do produto com 3D, cores, tamanhos, sacola e WhatsApp |
| `src/data/products.js` | **Catálogo e dados da loja (preços, WhatsApp, endereço): edite aqui** |
| `src/three/store.js` | Loja 3D (layout do projeto da sala 5 × 9 m) |
| `src/three/models.js` | Modelos procedurais provisórios das peças |
| `src/fx/daylight.js` | Abertura: luz atravessando o título (WebGL puro) |
| `src/fx/grains.js` | Capítulo de partículas "Estilo e qualidade" (WebGL puro) |
| `src/ui/bag.js` | Sacola (localStorage) finalizando pelo WhatsApp |

## Desempenho (meta 60 fps)
- Loja 3D: geometria estática fundida por material, roupas em `InstancedMesh`, sombra calculada uma vez, render só quando a câmera ou o hover mudam, resolução adaptativa.
- Cada canvas pausa fora da tela ou com a aba escondida; todo o 3D é carregado sob demanda.
- Abertura e partículas reduzem resolução / quantidade de grãos sozinhas se os quadros ficarem lentos.
- `prefers-reduced-motion` respeitado em todas as seções.

## Para trocar por conteúdo real
- Fotos: salve em `public/img/` com o mesmo nome (`<id>-card.webp`, `<id>-mood.webp`).
- Modelos 3D reais (GLB) entram no lugar de `makeProduct` em `src/three/models.js`.
