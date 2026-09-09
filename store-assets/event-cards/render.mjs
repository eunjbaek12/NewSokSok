/**
 * App Store 인앱 이벤트 카드 이미지 렌더러.
 *
 * 이벤트 하나에 두 장이 필요하다 — 카드(16:9 · 1920×1080)와 상세(9:16 · 1080×1920).
 * 스크린샷 합성(`store-assets/screenshots/compose.mjs`)과 같은 방식이다: HTML 을 그려
 * Playwright 크로미움으로 정확한 픽셀 크기에 스크린샷한다.
 *
 * 🔑 재료는 앱에서 그대로 가져온다 — 스킨 배경 그림(webp) · 스킨 팔레트(constants/colors.ts) ·
 *    스킨 글꼴(GowunBatang / Pretendard) · 덱의 진짜 단어. 카드가 앱과 다른 얼굴이면
 *    스토어에서 보고 들어온 사람이 다른 앱을 만난다.
 *
 * 🔴 글꼴·그림은 **base64 로 심는다**. 저장소 경로에 한글(`문서`)이 들어 있어 file:// URL 이
 *    크로미움에서 조용히 실패한다 — 실패해도 오류가 없고 기본 산세리프로 그려질 뿐이라,
 *    명조로 그린 줄 알았던 한글 카드가 고딕으로 나온다.
 *
 * 실행: node store-assets/event-cards/render.mjs [--out DIR] [--only hangul|horror]
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const playwrightUrl = 'file:///C:/Users/kimos/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const { chromium } = await import(playwrightUrl);

// 🔴 npx 캐시의 playwright 는 최신 브라우저 빌드를 기대하는데 내려받힌 것은 한 세대 전이다.
//    `npx playwright install` 로 100MB 를 더 받는 대신 있는 것을 가리킨다.
const CHROME = 'C:/Users/kimos/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const OUT = resolve(arg('--out', resolve(__dirname, 'out')));
const ONLY = arg('--only', '');

const b64 = (p) => readFileSync(resolve(repo, p)).toString('base64');
const font = (p) => `data:font/ttf;base64,${b64(p)}`;
const webp = (p) => `data:image/webp;base64,${b64(p)}`;
const svg = (p) => `data:image/svg+xml;base64,${b64(p)}`;

const FONTS = {
  gowunRegular: font('node_modules/@expo-google-fonts/gowun-batang/400Regular/GowunBatang_400Regular.ttf'),
  gowunBold: font('node_modules/@expo-google-fonts/gowun-batang/700Bold/GowunBatang_700Bold.ttf'),
  pretendardBold: `data:font/otf;base64,${b64('assets/fonts/Pretendard-Bold.otf')}`,
  pretendardMedium: `data:font/otf;base64,${b64('assets/fonts/Pretendard-Medium.otf')}`,
};
const CHARACTER = svg('assets/images/Avocado-main character.svg');

/** 스킨 팔레트 — constants/colors.ts 에서 옮겨 적었다(렌더러는 앱 코드를 import 할 수 없다). */
const EVENTS = {
  hangul: {
    art: webp('assets/images/skin-hanok-bg.webp'),
    bg: '#F4EFE3', surface: '#FCF9F2', border: '#DDD2BE',
    surfaceRgb: '252,249,242', borderRgb: '221,210,190',
    text: '#22201C', sub: '#4A443A', accent: '#1F5C8C',
    face: 'Gowun', scrim: 'rgba(244,239,227,0.34)',
    title: '한글날', titleEn: 'Hangul Day',
    words: [
      { ko: '훈민정음', ro: 'hunminjeongeum', en: 'the 1446 proclamation of Hangul', card: 'the 1446 proclamation of Hangul' },
      { ko: '받침', ro: 'batchim', en: 'the consonant at the bottom of a block' },
      { ko: '집현전', ro: 'jiphyeonjeon', en: "King Sejong's royal institute" },
    ],
  },
  horror: {
    art: webp('assets/images/skin-halloween-bg.webp'),
    bg: '#191327', surface: '#241B36', border: '#3B2E56',
    surfaceRgb: '36,27,54', borderRgb: '59,46,86',
    text: '#EDE6F2', sub: '#B7A9C9', accent: '#E8873A',
    face: 'Pretendard', scrim: 'rgba(25,19,39,0.42)',
    title: '할로윈', titleEn: 'Halloween',
    words: [
      { ko: '도깨비', ro: 'dokkaebi', en: 'a mischievous goblin of Korean folklore', card: 'a goblin of Korean folklore' },
      { ko: '구미호', ro: 'gumiho', en: 'the nine-tailed fox' },
      { ko: '저승사자', ro: 'jeoseungsaja', en: 'the reaper who escorts the dead' },
    ],
  },
};

const css = (e) => `
@font-face { font-family: 'Gowun'; src: url('${FONTS.gowunRegular}'); font-weight: 400; }
@font-face { font-family: 'Gowun'; src: url('${FONTS.gowunBold}'); font-weight: 700; }
@font-face { font-family: 'Pretendard'; src: url('${FONTS.pretendardBold}'); font-weight: 700; }
@font-face { font-family: 'Pretendard'; src: url('${FONTS.pretendardMedium}'); font-weight: 500; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: '${e.face}', 'Pretendard', sans-serif; background: ${e.bg}; }
.stage { position: relative; overflow: hidden; background: ${e.bg}; }
.art { position: absolute; inset: 0; background-image: url('${e.art}'); background-size: cover; }
.scrim { position: absolute; inset: 0; background: ${e.scrim}; }
.card {
  background: ${e.surface}; border: 2px solid ${e.border}; border-radius: 34px;
  box-shadow: 0 26px 60px rgba(0,0,0,0.22); padding: 44px 46px 40px;
}
.word { font-weight: 700; color: ${e.text}; letter-spacing: -0.5px; }
.ro { color: ${e.accent}; font-weight: 500; }
.en { color: ${e.sub}; font-weight: 400; line-height: 1.35; }
.badge {
  display: inline-block; background: ${e.accent}; color: ${e.surface};
  font-weight: 700; border-radius: 999px;
}
`;

/** 카드 한 장 — 앱의 학습 카드를 그대로 옮긴 모양. 높이를 고정해 밑선을 맞춘다. */
const wordCard = (e, x, opt = {}) => {
  const { w = 520, h = 300, big = 82, rot = 0, dy = 0, extra = '' } = opt;
  return `
  <div class="card" style="width:${w}px;height:${h}px;transform:rotate(${rot}deg) translateY(${dy}px);${extra}">
    <div class="word" style="font-size:${big}px">${x.ko}</div>
    <div class="ro" style="font-size:${Math.round(big * 0.37)}px;margin-top:10px">${x.ro}</div>
    ${x.en ? `<div class="en" style="font-size:${Math.round(big * 0.34)}px;margin-top:20px">${x.en}</div>` : ''}
  </div>`;
};

/** A안 — 덱 카드만. 글자가 카드 안에만 있어 **로케일을 안 탄다**(스토어가 이름·설명을 위에 얹는다). */
const layoutA = (e, w, h) => {
  const wide = w > h;
  const size = wide
    ? { w: 500, h: 310, big: 76, gap: 44 }
    : { w: 780, h: 330, big: 92, gap: 40 };
  return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div class="art"></div><div class="scrim"></div>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
              gap:${size.gap}px;flex-direction:${wide ? 'row' : 'column'}">
    ${e.words.map((x, i) => wordCard(e, x, {
      w: size.w, h: size.h, big: size.big,
      rot: wide ? (i - 1) * 2.6 : (i - 1) * 1.2,
      dy: wide && i === 1 ? -22 : 0,
    })).join('')}
  </div>
</div>`;
};

/** B안 — 계절과 캐릭터가 주연. 글자가 있어 **로케일마다 따로 뽑아야 한다**. */
const layoutB = (e, w, h, lang = 'en') => {
  const wide = w > h;
  const count = lang === 'ko' ? '새 단어 50개' : '50 new words';
  return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div class="art"></div><div class="scrim"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:${wide ? 'row' : 'column'};
              align-items:center;justify-content:center;gap:${wide ? 60 : 40}px">
    <div style="text-align:${wide ? 'left' : 'center'}">
      <div class="badge" style="font-size:${wide ? 30 : 36}px;padding:${wide ? '12px 30px' : '14px 36px'}">${e.title}</div>
      <div class="word" style="font-size:${wide ? 148 : 160}px;margin-top:24px;line-height:1.05">${e.words[0].ko}</div>
      <div class="en" style="font-size:${wide ? 36 : 42}px;margin-top:20px">${count}</div>
    </div>
    <img src="${CHARACTER}" style="width:${wide ? 460 : 560}px;display:block">
  </div>
</div>`;
};

/** C안 — 둘을 합친다. 카드 둘이 앞에 서고 캐릭터가 뒤에서 함께 본다. 글자는 카드 안뿐. */
const layoutC = (e, w, h) => {
  const wide = w > h;
  return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div class="art"></div><div class="scrim"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:${wide ? 'row' : 'column'};
              align-items:center;justify-content:center;gap:${wide ? 70 : 30}px">
    <img src="${CHARACTER}" style="width:${wide ? 400 : 460}px;display:block;
         ${wide ? '' : 'margin-bottom:-30px;'}">
    <div style="display:flex;flex-direction:column;gap:${wide ? 30 : 26}px">
      ${wordCard(e, e.words[0], { w: wide ? 620 : 800, h: wide ? 250 : 280, big: wide ? 78 : 92, rot: -1.4 })}
      ${wordCard(e, e.words[1], { w: wide ? 620 : 800, h: wide ? 250 : 280, big: wide ? 78 : 92, rot: 1.4 })}
    </div>
  </div>
</div>`;
};

/**
 * D안 — B 의 구도(큰 표제어 + 캐릭터)를 그대로 두되 글자를 **카드 안에** 넣는다.
 *
 * 🔑 로케일을 푸는 건 「카드에 넣는 것」이 아니라 **번역이 필요한 문구를 빼는 것**이다.
 *    B 에서 그게 둘이었다 — 배지(할로윈/한글날)는 스토어가 이벤트 이름으로 이미 위에 얹고,
 *    「50 new words」는 로케일마다 다시 써야 한다. 표제어·로마자·영어 뜻만 남기면
 *    그건 덱이 가르치는 내용이라 어느 스토어프론트에서도 그대로 선다.
 *
 * alpha 는 카드 바탕의 불투명도다. 0 이면 B 처럼 글자가 그림 위에 바로 떠 있고,
 * 1 이면 C 처럼 카드가 또렷하게 선다.
 */
const layoutD = (e, w, h, alpha) => {
  const wide = w > h;
  const rgb = e.surfaceRgb;
  const shell = alpha === 0
    ? 'background:none;border:0;box-shadow:none;padding:0;'
    : `background:rgba(${rgb},${alpha});border-color:rgba(${e.borderRgb},${Math.min(1, alpha + 0.15)});`
      + (alpha < 1 ? 'backdrop-filter:blur(2px);box-shadow:0 18px 44px rgba(0,0,0,.16);' : '');
  return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div class="art"></div><div class="scrim"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:${wide ? 'row' : 'column'};
              align-items:center;justify-content:center;gap:${wide ? 54 : 24}px">
    <div class="card" style="width:${wide ? 690 : 820}px;${shell}">
      <div class="word" style="font-size:${wide ? 132 : 148}px;line-height:1.06">${e.words[0].ko}</div>
      <div class="ro" style="font-size:${wide ? 42 : 48}px;margin-top:${wide ? 14 : 16}px">${e.words[0].ro}</div>
      <div class="en" style="font-size:${wide ? 36 : 42}px;margin-top:${wide ? 22 : 24}px">${e.words[0].en}</div>
    </div>
    <img src="${CHARACTER}" style="width:${wide ? 430 : 520}px;display:block">
  </div>
</div>`;
};

/**
 * 확정본 — 16:9 는 카드 한 장(투명도 55 %)과 캐릭터, 9:16 은 카드 셋.
 *
 * 🔑 두 장의 역할이 다르다. 16:9 는 **지나가다 보는 카드**라 단어 하나를 크게 세우고,
 *    9:16 은 이미 눌러 들어온 사람이 보는 자리라 덱이 무엇인지 보여 준다.
 * 🔑 글자는 표제어·로마자·영어 뜻뿐이다 — 셋 다 덱이 가르치는 내용이라 로케일을 안 탄다.
 *    배지·「50 new words」 같은 문구를 넣는 순간 스토어프론트마다 다시 뽑아야 한다.
 */
const ALPHA = 0.55;
const layoutFinal = (e, w, h) => {
  const wide = w > h;
  const rgb = e.surfaceRgb;
  const shell = `background:rgba(${rgb},${ALPHA});border-color:rgba(${e.borderRgb},${ALPHA + 0.15});`
    + 'backdrop-filter:blur(2px);box-shadow:0 18px 44px rgba(0,0,0,.16);';
  const glass = (x, big) => `
    <div class="card" style="width:${wide ? 690 : 800}px;${shell}">
      <div class="word" style="font-size:${big}px;line-height:1.06">${x.ko}</div>
      <div class="ro" style="font-size:${Math.round(big * 0.32)}px;margin-top:${wide ? 14 : 10}px">${x.ro}</div>
      <div class="en" style="font-size:${Math.round(big * 0.27)}px;margin-top:${wide ? 22 : 16}px">${x.card ?? x.en}</div>
    </div>`;
  if (wide) {
    return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div class="art"></div><div class="scrim"></div>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:54px">
    ${glass(e.words[0], 132)}
    <img src="${CHARACTER}" style="width:430px;display:block">
  </div>
</div>`;
  }
  return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div class="art"></div><div class="scrim"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
              justify-content:center;gap:26px">
    <img src="${CHARACTER}" style="width:300px;display:block;margin-bottom:6px">
    ${e.words.map(x => glass(x, 78)).join('')}
  </div>
</div>`;
};

const LAYOUTS = {
  A: layoutA,
  B: layoutB,
  C: layoutC,
  'D-0': (e, w, h) => layoutD(e, w, h, 0),
  'D-55': (e, w, h) => layoutD(e, w, h, 0.55),
  'D-100': (e, w, h) => layoutD(e, w, h, 1),
  final: layoutFinal,
};

// `--final` 이면 확정본만 뽑고 파일 이름에서 안 표시를 뺀다.
const FINAL_ONLY = process.argv.includes('--final');
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
let made = 0;
for (const [id, e] of Object.entries(EVENTS)) {
  if (ONLY && ONLY !== id) continue;
  for (const [variant, layout] of Object.entries(LAYOUTS)) {
    if (FINAL_ONLY !== (variant === 'final')) continue;
    for (const [ratio, [w, h]] of Object.entries(SIZES)) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(`<style>${css(e)}</style>${layout(e, w, h)}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const file = `${OUT}/${id}-${FINAL_ONLY ? ratio : `${variant}-${ratio}`}.png`;
      await page.screenshot({ path: file });
      await page.close();
      console.log(`✅ ${file}`);
      made++;
    }
  }
}
await browser.close();
console.log(`\n${made}장 렌더 완료 → ${OUT}`);
