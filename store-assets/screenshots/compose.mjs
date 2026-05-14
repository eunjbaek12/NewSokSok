import { chromium } from 'file:///C:/Users/kimos/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = (rel) => resolve(__dirname, rel);
const toDataUrl = (p) => {
  const b64 = readFileSync(p).toString('base64');
  return `data:image/png;base64,${b64}`;
};

const config = JSON.parse(readFileSync(here('config.json'), 'utf-8'));
const template = readFileSync(here('template.html'), 'utf-8');

const browser = await chromium.launch();
let made = 0, skipped = 0;

for (const lang of ['ko', 'en']) {
  const outDir = here(`final/${lang}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const entry of config.screenshots) {
    const rawPath = here(`raw/${lang}/${entry.id}.png`);
    if (!existsSync(rawPath)) {
      console.log(`⏭  ${lang}/${entry.id} — raw 누락 (${rawPath})`);
      skipped++;
      continue;
    }

    const captionClass = lang === 'en' ? 'caption en' : 'caption';
    const html = template
      .replace('{{CAPTION}}', entry[lang].caption)
      .replace('{{SUB}}', entry[lang].sub)
      .replace('{{SHOT}}', toDataUrl(rawPath))
      .replace('class="caption"', `class="${captionClass}"`);

    const ctx = await browser.newContext({
      viewport: config.viewport,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const outPath = `${outDir}/${entry.id}.png`;
    await page.screenshot({ path: outPath, type: 'png' });
    await ctx.close();
    console.log(`✓ ${lang}/${entry.id}.png`);
    made++;
  }
}

await browser.close();
console.log(`\n결과: ${made}장 생성, ${skipped}장 raw 누락으로 스킵.`);
if (skipped > 0) {
  console.log('raw 누락분은 store-assets/screenshots/raw/{ko|en}/{id}.png 에 저장 후 재실행.');
}
