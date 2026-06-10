// feature graphic HTML → 1024x500 PNG 렌더.
// 사용: node store-assets/feature-graphic/render.mjs feature-ko-cream.html [out.png]
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inArg = process.argv[2];
if (!inArg) { console.error('usage: node render.mjs <html> [out.png]'); process.exit(1); }
const htmlPath = resolve(__dirname, inArg);
const outPath = resolve(__dirname, process.argv[3] ?? basename(inArg).replace(/\.html$/, '.png'));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('file:///C:/Users/kimos/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
// file:// 로 열어야 상대경로(SVG 캐릭터)가 로드됨
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(500); // 웹폰트 안정화
await page.screenshot({ path: outPath, type: 'png' });
await browser.close();
console.log('✓', basename(outPath));
