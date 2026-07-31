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
const sbPx = config.captureStatusBarPx ?? 80;

// 히어로 2장은 별도 템플릿. 같은 원본을 장마다 다른 배율·오프셋으로 깐다(파노라마 아님 — hero/README.md 참고).
const heroCfg = config.hero;
const heroTemplate = heroCfg ? readFileSync(here('hero.html'), 'utf-8') : null;
const heroNotch = heroCfg ? toDataUrl(here(`${heroCfg.dir}/notch.png`)) : null;
const heroPlates = new Map();  // 배경판은 크다(4MB+) — 파일당 한 번만 읽는다
const plate = (file) => {
  if (!heroPlates.has(file)) heroPlates.set(file, toDataUrl(here(`${heroCfg.dir}/${file}`)));
  return heroPlates.get(file);
};
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const buildHero = (entry, lang, shotPath) => heroTemplate
  .replace('{{HERO}}', plate(entry.bg.file))
  .replace('{{NOTCH}}', heroNotch)
  .replace('{{CREAM}}', heroCfg.cream)
  .replace('{{BG_W}}', entry.bg.width)
  .replace('{{BG_H}}', entry.bg.height)
  .replaceAll('{{OFFSET_X}}', entry.bg.x)
  .replaceAll('{{OFFSET_Y}}', entry.bg.y)
  .replace('{{SCREEN_X}}', heroCfg.screen.x)
  .replace('{{SCREEN_Y}}', heroCfg.screen.y)
  .replace('{{SCREEN_W}}', heroCfg.screen.width)
  .replace('{{SCREEN_H}}', heroCfg.screen.height)
  .replace('{{SCREEN_R}}', heroCfg.screen.radius)
  .replace('{{NOTCH_X}}', heroCfg.notch.x)
  .replace('{{NOTCH_W}}', heroCfg.notch.width)
  .replace('{{SCREEN_DISPLAY}}', shotPath ? 'block' : 'none')
  .replace('{{SHOT}}', shotPath ? toDataUrl(shotPath) : BLANK)
  .replace('{{CAPTION}}', entry[lang].caption)
  .replace('{{SUB}}', entry[lang].sub);

const only = process.argv.slice(2);
const browser = await chromium.launch();
let made = 0, skipped = 0;

for (const lang of ['ko', 'en']) {
  const outDir = here(`final/${lang}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const entry of config.screenshots) {
    // `node compose.mjs hero` 처럼 인자를 주면 해당 id만 다시 만든다.
    if (only.length && !only.some((o) => entry.id.includes(o))) continue;

    const isHero = entry.type === 'hero';
    // duo(entry.shots 2개) = 한 장에 두 스킨 겹침.
    // 히어로 1장(캐릭터)은 폰이 없어 raw가 필요 없다. 2장은 entry.phone의 캡처를 쓴다.
    const isDuo = Array.isArray(entry.shots) && entry.shots.length === 2;
    const rawIds = isDuo ? entry.shots : [isHero ? entry.phone : entry.id].filter(Boolean);
    const rawPaths = rawIds.map((id) => here(`raw/${lang}/${id}.png`));
    const missing = rawPaths.filter((p) => !existsSync(p));
    if (missing.length || (isDuo && !templateDuo)) {
      console.log(`⏭  ${lang}/${entry.id} — ${missing.length ? `raw 누락 (${missing.join(', ')})` : 'template-duo.html 없음'}`);
      skipped++;
      continue;
    }

    const capClass = lang === 'en' ? 'caption en' : 'caption';
    const html = (isDuo
      ? templateDuo
          .replace('{{CAPTION}}', entry[lang].caption)
          .replace('{{SUB}}', entry[lang].sub)
          .replace('{{SHOT_A}}', toDataUrl(rawPaths[0]))
          .replace('{{SHOT_B}}', toDataUrl(rawPaths[1]))
      : isHero
        ? buildHero(entry, lang, rawPaths[0] ?? null)
        : template
            .replace('{{CAPTION}}', entry[lang].caption)
            .replace('{{SUB}}', entry[lang].sub)
            .replace('{{SHOT}}', toDataUrl(rawPaths[0]))
    ).replace('class="caption"', `class="${capClass}"`);

    const ctx = await browser.newContext({ viewport: config.viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    // 목업 이미지 로드 보장 (히어로 1장은 폰이 없어 건너뛴다)
    if (rawPaths.length) await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.screen img')];
      return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    });

    // 상태바: .screen 마다 캡처 상단색 샘플 → 더미 배경/높이/전경색 동적 주입
    if (rawPaths.length) await page.evaluate((statusBarPx) => {
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
        sb.querySelectorAll('.time, .icons').forEach((el) => { el.style.color = fg; });
      });
    }, isHero ? (heroCfg.statusBarPx ?? sbPx) : sbPx);

    await page.waitForTimeout(400);

    const outPath = `${outDir}/${entry.id}.png`;
    await page.screenshot({ path: outPath, type: 'png' });
    await ctx.close();
    console.log(`✓ ${lang}/${entry.id}.png`);
    made++;
  }
}

await browser.close();
console.log(`\n결과: ${made}장 생성(1290x2580), ${skipped}장 raw 누락 스킵.`);
if (skipped > 0) console.log('누락분은 raw/{ko|en}/{id}.png 저장 후 재실행.');
