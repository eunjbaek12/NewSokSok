import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = (rel) => resolve(__dirname, rel);
const toDataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;

// playwright 모듈: 표준 설치 우선, 없으면 기존 npx 캐시 경로 fallback
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('file:///C:/Users/kimos/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'));
}

const config = JSON.parse(readFileSync(here('config.json'), 'utf-8'));
const template = readFileSync(here('template.html'), 'utf-8');
const sbPx = config.captureStatusBarPx ?? 132;

const browser = await chromium.launch();
let made = 0, skipped = 0;

for (const lang of ['ko', 'en']) {
  const outDir = here(`final/6.9inch/${lang}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const entry of config.screenshots) {
    const rawPath = here(`raw/${lang}/${entry.id}.png`);
    if (!existsSync(rawPath)) {
      console.log(`⏭  ${lang}/${entry.id} — raw 누락 (${rawPath})`);
      skipped++;
      continue;
    }

    const capClass = lang === 'en' ? 'caption en' : 'caption';
    const html = template
      .replace('{{CAPTION}}', entry[lang].caption)
      .replace('{{SUB}}', entry[lang].sub)
      .replace('{{SHOT}}', toDataUrl(rawPath))
      .replace('class="caption"', `class="${capClass}"`);

    const ctx = await browser.newContext({ viewport: config.viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    // 캡처 이미지 로드 보장
    await page.waitForFunction(() => {
      const i = document.getElementById('shot');
      return i && i.complete && i.naturalWidth > 0;
    });

    // 상태바: 캡처 상단색 샘플 → 더미 배경/높이/전경색 동적 주입
    await page.evaluate((statusBarPx) => {
      const img = document.getElementById('shot');
      const sb = document.getElementById('statusbar');
      const scale = img.clientWidth / img.naturalWidth;
      sb.style.height = Math.round(statusBarPx * scale) + 'px';

      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      // 노치 양옆(가로 8% 지점, 상태바 중간 높이) = 앱 헤더 배경색
      const sx = Math.round(img.naturalWidth * 0.08);
      const sy = Math.max(1, Math.round(statusBarPx * 0.5));
      const p = cx.getImageData(sx, sy, 1, 1).data;
      sb.style.background = `rgb(${p[0]},${p[1]},${p[2]})`;
      const lum = (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000;
      const fg = lum > 150 ? '#1c1c1e' : '#ffffff';
      document.getElementById('sb-time').style.color = fg;
      document.getElementById('sb-icons').style.color = fg;
    }, sbPx);

    await page.waitForTimeout(400);

    const outPath = `${outDir}/${entry.id}.png`;
    await page.screenshot({ path: outPath, type: 'png' });
    await ctx.close();
    console.log(`✓ 6.9inch/${lang}/${entry.id}.png`);
    made++;
  }
}

await browser.close();
console.log(`\n결과: ${made}장 생성(6.9"), ${skipped}장 raw 누락 스킵.`);
if (skipped > 0) console.log('누락분은 raw/{ko|en}/{id}.png 저장 후 재실행.');
console.log('6.5"(1284x2778)는: python store-assets/screenshots/appstore/resize65.py');
