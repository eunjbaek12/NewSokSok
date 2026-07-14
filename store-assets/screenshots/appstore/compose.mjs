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
// 두 스킨 겹침용 duo 템플릿 (entry.shots 있는 항목에만 사용)
const templateDuo = existsSync(here('template-duo.html'))
  ? readFileSync(here('template-duo.html'), 'utf-8')
  : null;
const sbPx = config.captureStatusBarPx ?? 132;

const browser = await chromium.launch();
let made = 0, skipped = 0;

for (const lang of ['ko', 'en']) {
  const outDir = here(`final/6.9inch/${lang}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const entry of config.screenshots) {
    const capClass = lang === 'en' ? 'caption en' : 'caption';
    let html;

    // duo: entry.shots(2개) = 한 장에 두 스킨 겹침
    if (Array.isArray(entry.shots) && entry.shots.length === 2) {
      if (!templateDuo) {
        console.log(`⏭  ${lang}/${entry.id} — template-duo.html 없음`);
        skipped++;
        continue;
      }
      const rawA = here(`raw/${lang}/${entry.shots[0]}.png`);
      const rawB = here(`raw/${lang}/${entry.shots[1]}.png`);
      const missing = [rawA, rawB].filter((p) => !existsSync(p));
      if (missing.length) {
        console.log(`⏭  ${lang}/${entry.id} — raw 누락 (${missing.join(', ')})`);
        skipped++;
        continue;
      }
      html = templateDuo
        .replace('{{CAPTION}}', entry[lang].caption)
        .replace('{{SUB}}', entry[lang].sub)
        .replace('{{SHOT_A}}', toDataUrl(rawA))
        .replace('{{SHOT_B}}', toDataUrl(rawB))
        .replace('class="caption"', `class="${capClass}"`);
    } else {
      const rawPath = here(`raw/${lang}/${entry.id}.png`);
      if (!existsSync(rawPath)) {
        console.log(`⏭  ${lang}/${entry.id} — raw 누락 (${rawPath})`);
        skipped++;
        continue;
      }
      html = template
        .replace('{{CAPTION}}', entry[lang].caption)
        .replace('{{SUB}}', entry[lang].sub)
        .replace('{{SHOT}}', toDataUrl(rawPath))
        .replace('class="caption"', `class="${capClass}"`);
    }

    const ctx = await browser.newContext({ viewport: config.viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    // 모든 목업 이미지 로드 보장 (단일 1개 / duo 2개)
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.screen img')];
      return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    });

    // 상태바: 각 .screen 마다 캡처 상단색 샘플 → 더미 배경/높이/전경색 동적 주입
    await page.evaluate((statusBarPx) => {
      document.querySelectorAll('.screen').forEach((screen) => {
        const img = screen.querySelector('img');
        const sb = screen.querySelector('.statusbar');
        if (!img || !sb) return;
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
        const time = sb.querySelector('.time');
        if (time) time.style.color = fg;
        const icons = sb.querySelector('.icons');
        if (icons) icons.style.color = fg;
      });
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
if (skipped > 0) console.log('누락분은 raw/{ko|en}/{id}.png (duo는 shots 파일명) 저장 후 재실행.');
console.log('6.5"(1284x2778)는: python store-assets/screenshots/appstore/resize65.py');
