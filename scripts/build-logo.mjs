// Gera a logo da VS Imports em vetor (SVG), com as letras convertidas em
// curvas: nítida em qualquer tamanho e sem depender de fonte instalada.
// Uso: node scripts/build-logo.mjs
import opentype from 'opentype.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const font = (pkg, file) => opentype.parse(readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`).buffer.slice(0));
const serif = font('bodoni-moda', 'bodoni-moda-latin-600-normal.woff');
const sans = font('montserrat', 'montserrat-latin-500-normal.woff');

// texto -> path centralizado em (cx, baseline), com espaçamento extra opcional
function textPath(f, text, size, cx, baseline, track = 0) {
  const glyphs = f.stringToGlyphs(text);
  const scale = size / f.unitsPerEm;
  const widths = glyphs.map((g) => g.advanceWidth * scale);
  const total = widths.reduce((a, b) => a + b, 0) + track * (glyphs.length - 1);
  let x = cx - total / 2, d = '';
  glyphs.forEach((g, i) => { d += g.getPath(x, baseline, size).toPathData(2); x += widths[i] + track; });
  return d;
}
function bbox(f, ch, size) { const p = f.getPath(ch, 0, 0, size); return p.getBoundingBox(); }

const C = 500; // centro do viewBox 1000×1000
// monograma: V alto e estreito + S esguio apoiado no braço direito do V
const vSize = 400, sSize = 330;
const vb = bbox(serif, 'V', vSize);
const vBase = 548;
const vCx = C - 34;
const V = serif.getPath('V', vCx - (vb.x1 + vb.x2) / 2, vBase, vSize).toPathData(2);
const vTop = vBase + vb.y1, vH = vb.y2 - vb.y1;
const sb = bbox(serif, 'S', sSize);
const sCx = C + 58, sCy = vTop + vH * 0.34;
const Sg = serif.getPath('S', sCx - (sb.x1 + sb.x2) / 2, sCy - (sb.y1 + sb.y2) / 2, sSize).toPathData(2);
// estreita o V e alonga o S (como na logo enviada)
const vT = `translate(${vCx} 0) scale(.74 1) translate(${-vCx} 0)`;
const sT = `translate(${sCx} ${sCy}) scale(.78 1.12) skewX(-6) translate(${-sCx} ${-sCy})`;
const IMPORTS = textPath(sans, 'IMPORTS', 70, C, 668, 13);

// losango: quadrado girado 45°
const R = 452, r2 = 412, r3 = 398;
const dia = (r) => `M${C} ${C - r}L${C + r} ${C}L${C} ${C + r}L${C - r} ${C}Z`;

const defs = `
  <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#EED39C"/><stop offset=".28" stop-color="#C8A968"/>
    <stop offset=".55" stop-color="#AB8546"/><stop offset=".78" stop-color="#E3C27E"/><stop offset="1" stop-color="#A9823F"/>
  </linearGradient>
  <linearGradient id="prata" x1="0" y1="0" x2=".35" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#D9D7D3"/>
    <stop offset=".6" stop-color="#9E9D9B"/><stop offset=".82" stop-color="#E8E6E2"/><stop offset="1" stop-color="#BBBAB6"/>
  </linearGradient>
  <filter id="relevo" x="-10%" y="-10%" width="120%" height="120%">
    <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".65"/>
  </filter>`;

const frame = (fill = '#0B0B0B') => `
  <path d="${dia(R)}" fill="url(#ouro)"/>
  <path d="${dia(R - 26)}" fill="${fill}"/>
  <path d="${dia(r2)}" fill="none" stroke="#2A2824" stroke-width="3"/>
  <path d="${dia(r3)}" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="2"/>`;
const mono = (fill = 'url(#prata)', fx = ' filter="url(#relevo)"', gap = '#0B0B0B') => `
  <g${fx} fill="${fill}"><path transform="${sT}" d="${Sg}"/><path transform="${vT}" d="${V}" stroke="${gap}" stroke-width="4" paint-order="stroke"/></g>`;
const word = (fill = 'url(#prata)') => `<path d="${IMPORTS}" fill="${fill}"/>`;

const svg = (body, vbox = '0 0 1000 1000') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbox}" role="img" aria-label="VS Imports"><title>VS Imports</title><defs>${defs}</defs>${body}</svg>\n`;

mkdirSync('public/brand', { recursive: true });
// 1) logo completa (losango + VS + IMPORTS)
writeFileSync('public/brand/vs-logo.svg', svg(frame() + mono() + word()));
// 2) ícone (losango + VS), para cabeçalho e favicon
writeFileSync('public/brand/vs-icon.svg', svg(frame() + `<g transform="translate(0 50)">${mono()}</g>`));
// 3) monograma solto em dourado (sobre fundos claros) e em prata (fundos escuros)
writeFileSync('public/brand/vs-mono-ouro.svg', svg(mono('url(#ouro)', '', '#F5F3EF'), '300 150 400 420'));
writeFileSync('public/brand/vs-mono-preto.svg', svg(mono('#0B0B0B', '', '#F5F3EF'), '300 150 400 420'));
console.log('logos em public/brand');
