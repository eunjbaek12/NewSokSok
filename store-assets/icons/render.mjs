import { chromium } from 'file:///C:/Users/kimos/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = (rel) => resolve(__dirname, rel);
const fileUrl = (p) => 'file://' + p.replace(/\\/g, '/');

const jobs = [
  { html: 'icon-512.html',        png: 'icon-512.png',        w: 512,  h: 512,  bg: false },
  { html: 'icon-foreground.html', png: 'icon-foreground.png', w: 2048, h: 2048, bg: true  },
  { html: 'icon-background.html', png: 'icon-background.png', w: 2048, h: 2048, bg: false },
  { html: 'icon-monochrome.html', png: 'icon-monochrome.png', w: 2048, h: 2048, bg: true  },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const ctx = await browser.newContext({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(fileUrl(here(j.html)));
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: here(j.png), omitBackground: j.bg, type: 'png' });
  await ctx.close();
  console.log('✓', j.png, `${j.w}x${j.h}`, j.bg ? '(transparent)' : '');
}
await browser.close();
