// Catálogo provisório da VS Imports.
// Nomes, preços e cores são exemplos: troque pelos produtos reais.
// `model` diz qual modelo 3D procedural representa a peça enquanto
// não houver fotos/GLB reais. `img` é gerado por `npm run assets`.

export const STORE = {
  name: 'VS Imports',
  tagline: 'a loja que veste os artistas',
  city: 'Capão Raso, Curitiba/PR',
  address: '', // deixe vazio até ter o endereço: o mapa mostra o bairro
  company: 'VS Imports', // razão social
  cnpj: '00.000.000/0001-00', // trocar pelo CNPJ real
  email: 'contato@vsimports.com.br', // trocar pelo e-mail real
  hours: 'Seg a sáb, 10h às 20h',
  whatsapp: '554185148006', // pedidos, dúvidas e ajuda
  instagram: 'vsimpoorts__',
  instagramUrl: 'https://www.instagram.com/vsimpoorts__',
  tiktok: 'vsimpoorts_',
  tiktokUrl: 'https://www.tiktok.com/@vsimpoorts_',
  vipGroup: 'https://chat.whatsapp.com/IScxz90K6pyKWL0bB0jOgy', // grupo de ofertas VIP
};

export const CATEGORIES = [
  { id: 'camisetas', name: 'Camisetas', blurb: 'Algodão pesado, caimento reto, estampa que aparece.' },
  { id: 'bones', name: 'Bonés', blurb: 'Aba curva, aba reta e trucker, bordados.' },
  { id: 'tenis', name: 'Tênis', blurb: 'Do branco limpo ao preto total.' },
  { id: 'bermudas', name: 'Bermudas', blurb: 'Sarja e jeans para fechar o conjunto.' },
];

// cor principal (hex), cor de detalhe e texto da estampa
export const PRODUCTS = [
  { id: 'camiseta-vs-classic', cat: 'camisetas', model: 'tee', name: 'Camiseta VS Classic', price: 129.9,
    colors: [{ n: 'Preto', c: 0x252528, a: 0xf1ede4 }, { n: 'Off-white', c: 0xece8df, a: 0x252528 }, { n: 'Cinza', c: 0x6c6d70, a: 0xf1ede4 }],
    print: 'VS', sizes: ['P', 'M', 'G', 'GG'], featured: true,
    desc: 'Malha 100% algodão 30.1 penteado, gola reforçada e o VS bordado no peito.' },
  { id: 'camiseta-artistas', cat: 'camisetas', model: 'tee', name: 'Camiseta Veste os Artistas', price: 149.9,
    colors: [{ n: 'Off-white', c: 0xece8df, a: 0x8c6b33 }, { n: 'Preto', c: 0x252528, a: 0xd2ae6e }],
    print: 'ARTISTAS', sizes: ['P', 'M', 'G', 'GG'],
    desc: 'Estampa em silk dourado com a frase da casa. Modelagem levemente ampla.' },
  { id: 'camiseta-oversized', cat: 'camisetas', model: 'tee', name: 'Camiseta Oversized Grafite', price: 159.9,
    colors: [{ n: 'Grafite', c: 0x3a3c40, a: 0xd2ae6e }, { n: 'Preto', c: 0x252528, a: 0xd2ae6e }],
    print: 'VS/26', sizes: ['M', 'G', 'GG'],
    desc: 'Ombro caído, malha encorpada e barra reta. Pede um número abaixo.' },
  { id: 'camiseta-estilo', cat: 'camisetas', model: 'tee', name: 'Camiseta Estilo e Qualidade', price: 139.9,
    colors: [{ n: 'Preto', c: 0x252528, a: 0xc9a045 }],
    print: 'ESTILO', sizes: ['P', 'M', 'G', 'GG'],
    desc: 'A frase da parede da loja, agora no peito. Pincelada dourada nas costas.' },

  { id: 'bone-vs-dad', cat: 'bones', model: 'cap', name: 'Boné VS Aba Curva', price: 99.9,
    colors: [{ n: 'Preto', c: 0x28282b, a: 0xf1ede4 }, { n: 'Off-white', c: 0xece8df, a: 0x28282b }],
    print: 'VS', sizes: ['Único'], featured: true,
    desc: 'Seis gomos, fecho de metal ajustável e VS bordado em alto relevo.' },
  { id: 'bone-trucker', cat: 'bones', model: 'cap', name: 'Boné Trucker Ouro', price: 109.9,
    colors: [{ n: 'Preto e ouro', c: 0x28282b, a: 0xc9a25a }],
    print: 'VS', sizes: ['Único'],
    desc: 'Frente estruturada, tela atrás e detalhe dourado.' },
  { id: 'bone-aba-reta', cat: 'bones', model: 'cap', name: 'Boné Aba Reta Grafite', price: 119.9,
    colors: [{ n: 'Grafite', c: 0x3a3c40, a: 0xd2ae6e }, { n: 'Preto', c: 0x28282b, a: 0xd2ae6e }],
    print: 'VS', sizes: ['Único'],
    desc: 'Snapback com aba reta e bordado frontal.' },

  { id: 'tenis-runner', cat: 'tenis', model: 'shoe', name: 'Tênis Runner Branco', price: 399.9,
    colors: [{ n: 'Branco', c: 0xf1f0ec, a: 0xc9a25a }, { n: 'Preto', c: 0x28282b, a: 0xf1f0ec }],
    sizes: ['37', '38', '39', '40', '41', '42', '43'], featured: true,
    desc: 'Cabedal em couro sintético, solado de borracha e palmilha macia.' },
  { id: 'tenis-street', cat: 'tenis', model: 'shoe', name: 'Tênis Street Preto Total', price: 429.9,
    colors: [{ n: 'Preto', c: 0x28282b, a: 0x3a3c40 }],
    sizes: ['38', '39', '40', '41', '42', '43', '44'],
    desc: 'Cano baixo, todo preto, para usar com tudo.' },
  { id: 'tenis-court', cat: 'tenis', model: 'shoe', name: 'Tênis Court Areia', price: 449.9,
    colors: [{ n: 'Areia', c: 0xd9cdb6, a: 0x8c6b33 }],
    sizes: ['37', '38', '39', '40', '41', '42'],
    desc: 'Inspirado nas quadras, com detalhes em caramelo.' },

  { id: 'bermuda-sarja', cat: 'bermudas', model: 'shorts', name: 'Bermuda Sarja Areia', price: 179.9,
    colors: [{ n: 'Areia', c: 0xb9a888, a: 0x5a4a32 }, { n: 'Preto', c: 0x2a2b2e, a: 0x55565a }],
    sizes: ['38', '40', '42', '44', '46'], featured: true,
    desc: 'Sarja com elastano, cós com cordão e bolsos faca.' },
  { id: 'bermuda-jeans', cat: 'bermudas', model: 'shorts', name: 'Bermuda Jeans Escura', price: 189.9,
    colors: [{ n: 'Azul escuro', c: 0x2e3b52, a: 0xc9a25a }, { n: 'Azul claro', c: 0x6d7f9c, a: 0xc9a25a }],
    sizes: ['38', '40', '42', '44', '46'],
    desc: 'Jeans médio, barra a fio e pesponto dourado.' },
];

export const byId = (id) => PRODUCTS.find((p) => p.id === id);
export const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const installments = (v) => `ou 3x de ${brl(v / 3)} sem juros`;
// Imagens geradas por `npm run assets` em public/img.
// Para usar fotos reais, salve com o mesmo nome (ex.: camiseta-vs-classic-card.webp).
export const asset = (name) => `${import.meta.env.BASE_URL}img/${name}.webp`;
export const img = (id, variant = 'card') => asset(`${id}-${variant}`);
