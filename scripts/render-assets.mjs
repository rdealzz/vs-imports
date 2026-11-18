// Gera public/img/*.webp a partir dos modelos 3D (imagens provisórias).
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[erro]', e.message));
const only = process.argv[2] ? `?only=${process.argv[2]}` : '';
await page.goto(`http://localhost:5199/tools/render.html${only}`);
await page.waitForFunction(() => window.__assets, null, { timeout: 600000 });
const assets = await page.evaluate(() => window.__assets);
mkdirSync('public/img', { recursive: true });
for (const a of assets) writeFileSync(`public/img/${a.name}.webp`, Buffer.from(a.data.split(',')[1], 'base64'));
console.log(`${assets.length} imagens em public/img`);
await browser.close(); await server.close();
