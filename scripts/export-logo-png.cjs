// Exporta PNGs da logo vetorial (transparente) em alta resolução.
// Uso: node scripts/export-logo-png.cjs
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const dir = path.resolve(__dirname, '../public/brand');
(async () => {
  const b = await pw.chromium.launch();
  const jobs = [['vs-logo.svg', 'vs-logo-4096.png', 4096], ['vs-icon.svg', 'vs-icon-1024.png', 1024], ['vs-icon.svg', 'apple-touch-icon.png', 180], ['vs-icon.svg', 'icon-512.png', 512]];
  for (const [src, out, size] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.goto('file://' + path.join(dir, src));
    await p.screenshot({ path: path.join(dir, out), omitBackground: true });
    await p.close();
  }
  await b.close(); console.log('PNGs em public/brand');
})();
