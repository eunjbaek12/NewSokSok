import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = (rel) => resolve(__dirname, rel);
const fileUrl = (p) => 'file://' + p.replace(/\\/g, '/');

// playwright: 표준 설치 우선, 없으면 기존 npx 캐시 경로 fallback
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('file:///C:/Users/kimos/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'));
}

const jobs = [
  { html: 'monthly.html', png: 'pro_monthly.png' },
  { html: 'yearly.html',  png: 'pro_yearly.png'  },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(fileUrl(here(j.html)));
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  await page.screenshot({ path: here(j.png), type: 'png' });
  await ctx.close();
  console.log('✓', j.png, '1024x1024');
}
await browser.close();
