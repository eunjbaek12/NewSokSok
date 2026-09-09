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
import { Buffer } from 'node:buffer';
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
// `--final` 은 «확정본을 뽑는다»는 뜻이라 기본 출력 자리도 final/ 이다. README 가 그렇게 적혀
// 있는데 코드는 out/ 으로 떨어뜨리고 있었다 — 확정본을 갱신한 줄 알고 옛 파일을 스토어에 올릴 자리다.
const FINAL_ONLY = process.argv.includes('--final');
const OUT = resolve(arg('--out', resolve(__dirname, FINAL_ONLY ? 'final' : 'out')));
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

/**
 * 할로윈 박쥐 망토 — `components/CharacterAccessory.tsx` 의 `HalloweenCape` 를 그대로 옮겼다.
 * 앱에서 할로윈 스킨을 켜면 캐릭터가 이 망토를 입는다. 카드의 캐릭터만 맨몸이면 스토어에서
 * 보고 눌러 들어온 사람이 다른 캐릭터를 만난다 — 배경·팔레트·글꼴을 앱에서 가져오는 것과 같은 이유다.
 *
 * 🔴 RN SVG 를 옮길 때 바뀌는 것은 셋뿐이다 — 태그 대소문자(`<Path>`→`<path>`), 속성 이름
 *    (`strokeWidth`→`stroke-width`), transform 배열(`[{translateX:250},{scaleX:-1}]` →
 *    `translate(250 0) scale(-1 1)`). **치수는 한 자리도 건드리지 않는다.** 팔 끝에서 +9(x26) ·
 *    상단이 몸통 경계에 접하는 y100·x61 은 앱에서 실측으로 맞춘 값이라, 여기서 손대면 둘이 갈라진다.
 *
 * 🔑 앱에서 망토가 서는 크기는 56dp 라 주름 한 줄이 1px 로 사라지지만, 이 카드에선 캐릭터가
 *    300~430px 라 세 겹(그라디언트·주름·안쪽 그늘)이 전부 제 몫을 한다. 같은 그림이 두 크기에서
 *    다르게 읽히는 자리다 — 앱 쪽 값을 여기 보기 좋으라고 바꾸면 56dp 가 망가진다.
 */
const capePanel = `
  <path d="M61 100 C52 104 42 112 38 128 C31 144 27 160 26 176 C24 190 22 199 20 208 Q36 191 50 214 Q66 190 80 216 Q88 199 93 212 C96 172 92 132 78 112 C73 106 67 101 61 100 Z" fill="url(#cape_g)"/>
  <path d="M56 112 C48 140 42 172 38 202" stroke="#241938" stroke-width="2.4" fill="none" opacity="0.55" stroke-linecap="round"/>
  <path d="M72 110 C70 142 72 174 74 206" stroke="#241938" stroke-width="2.4" fill="none" opacity="0.55" stroke-linecap="round"/>
  <path d="M78 112 C92 132 94 172 91 210" stroke="#1E1531" stroke-width="3.4" fill="none" opacity="0.5"/>
  <path d="M61 100 C52 104 42 112 38 128 C31 144 27 160 26 176 C24 190 22 199 20 208" stroke="#7A5FA8" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M26 176 C24 190 22 199 20 208 Q36 191 50 214 Q66 190 80 216 Q88 199 93 212" stroke="#E8873A" stroke-width="4.4" fill="none" stroke-linejoin="round"/>`;

const HALLOWEEN_CAPE = `
<defs>
  <linearGradient id="cape_g" x1="0" y1="100" x2="0" y2="212" gradientUnits="userSpaceOnUse">
    <stop stop-color="#4E3A73" offset="0"/>
    <stop stop-color="#3B2A57" offset="0.55"/>
    <stop stop-color="#281C3F" offset="1"/>
  </linearGradient>
</defs>
<!-- 아보카도는 viewBox 한가운데(125)가 아니라 x=113.4 에 서 있다(두 눈 90.09·136.7 의 중점).
     소품은 읽기 쉽게 125 기준으로 그려 두고 그 차이만큼 통째로 민다 — 앱의 ACCESSORY_CENTER_OFFSET_X. -->
<g transform="translate(-11.6 0)">
  ${capePanel}
  <g transform="translate(250 0) scale(-1 1)">${capePanel}</g>
  <path d="M93 138 Q125 156 157 138" stroke="#6B5A8C" stroke-width="2.6" fill="none"/>
  <path d="M120.2 147.4 L107.4 141 L110.6 148.2 L100.2 145.8 L105.8 153.8 L114.6 154.6 L120.2 153 Z" fill="#2E2140"/>
  <path d="M129.8 147.4 L142.6 141 L139.4 148.2 L149.8 145.8 L144.2 153.8 L135.4 154.6 L129.8 153 Z" fill="#2E2140"/>
  <path d="M122.2 137.8 L123.8 143.8 L120.6 143 Z" fill="#2E2140"/>
  <path d="M127.8 137.8 L126.2 143.8 L129.4 143 Z" fill="#2E2140"/>
  <path d="M125 144.2 C121.8 144.2 120.2 147.4 120.2 151.4 C120.2 155.4 122.6 158.6 125 160.2 C127.4 158.6 129.8 155.4 129.8 151.4 C129.8 147.4 128.2 144.2 125 144.2 Z" fill="#2E2140"/>
  <circle cx="123.24" cy="148.2" r="1.2" fill="#E8873A"/>
  <circle cx="126.76" cy="148.2" r="1.2" fill="#E8873A"/>
</g>`;

/**
 * 소품을 캐릭터 SVG 의 **마지막 자식**으로 끼워 넣는다 — 앱이 `CharacterSvg` 의 `<Svg>` 안
 * 마지막에 얹는 것과 같은 자리라, 겹치는 순서(망토가 몸 위)가 저절로 같아진다.
 * 별도 `<img>` 를 절대배치로 포개지 않는 이유도 앱과 같다: 크기·중심을 두 곳에서 맞춰야 한다.
 */
const CHARACTER_SVG = readFileSync(resolve(repo, 'assets/images/Avocado-main character.svg'), 'utf8');
const wearing = (accessory) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(CHARACTER_SVG.replace('</svg>', `${accessory}\n</svg>`), 'utf8').toString('base64');
const CHARACTER_CAPED = wearing(HALLOWEEN_CAPE);

/** 이벤트가 소품을 지정했으면 그 캐릭터를, 아니면 맨몸 기본 캐릭터를 쓴다. */
const chr = (e) => e.character ?? CHARACTER;

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
    character: CHARACTER_CAPED,
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
  // 한국 스토어용 — 방향이 반대다(en>ko). 표제어가 영어라 크게 세우면 폭을 넘겨서
  // 글자 크기를 따로 준다. 카드 안의 셋은 여전히 표제어·발음·뜻이다.
  'halloween-en': {
    art: webp('assets/images/skin-halloween-bg.webp'),
    character: CHARACTER_CAPED,
    bg: '#191327', surface: '#241B36', border: '#3B2E56',
    surfaceRgb: '36,27,54', borderRgb: '59,46,86',
    text: '#EDE6F2', sub: '#B7A9C9', accent: '#E8873A',
    face: 'Pretendard', scrim: 'rgba(25,19,39,0.42)',
    title: '할로윈', titleEn: 'Halloween',
    bigWide: 92, bigTall: 64,
    words: [
      { ko: 'trick or treat', ro: '트릭 오어 트릿', en: '과자 안 주면 장난칠 거예요' },
      { ko: "jack-o'-lantern", ro: '잭오랜턴', en: '호박등' },
      { ko: 'goosebumps', ro: '구스범프스', en: '소름' },
    ],
  },
};

/**
 * 이벤트 ① Major Update 는 실체가 **1.7.0 의 새 기능**이라 덱과 다르다. 스킨 3종을
 * 나란히 세우는 것이 「10월엔 계절을 따라 옷을 갈아입는다」를 그대로 보여 준다.
 * 🔑 글자가 하나도 없어 **한국·미국을 한 벌로 덮는다** — 덱 이벤트가 한국에서 못 서는
 *    이유(뜻 언어 필터)가 여기엔 걸리지 않는다.
 */
const SKINS_TRIO = [
  { art: webp('assets/images/skin-autumn-bg.webp'), bg: '#F7E9D7', chip: '#A8442A' },
  { art: webp('assets/images/skin-hanok-bg.webp'), bg: '#F4EFE3', chip: '#1F5C8C' },
  { art: webp('assets/images/skin-halloween-bg.webp'), bg: '#191327', chip: '#E8873A' },
];

const layoutSkins = (w, h) => {
  const wide = w > h;
  const panes = SKINS_TRIO.map((sk, i) => `
    <div style="position:relative;flex:1;background:${sk.bg};overflow:hidden">
      <div style="position:absolute;inset:0;background-image:url('${sk.art}');
                  background-size:cover;background-position:center ${i === 2 ? 'top' : '38%'}"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:${wide ? 10 : 14}px;background:${sk.chip}"></div>
    </div>`).join('');
  return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div style="position:absolute;inset:0;display:flex;flex-direction:${wide ? 'row' : 'column'}">${panes}</div>
  <img src="${CHARACTER}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
       width:${wide ? 380 : 460}px;filter:drop-shadow(0 26px 46px rgba(0,0,0,.35))">
</div>`;
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
    <img src="${chr(e)}" style="width:${wide ? 460 : 560}px;display:block">
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
    <img src="${chr(e)}" style="width:${wide ? 400 : 460}px;display:block;
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
    <img src="${chr(e)}" style="width:${wide ? 430 : 520}px;display:block">
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
    ${glass(e.words[0], e.bigWide ?? 132)}
    <img src="${chr(e)}" style="width:430px;display:block">
  </div>
</div>`;
  }
  return `
<div class="stage" style="width:${w}px;height:${h}px">
  <div class="art"></div><div class="scrim"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
              justify-content:center;gap:26px">
    <img src="${chr(e)}" style="width:300px;display:block;margin-bottom:6px">
    ${e.words.map(x => glass(x, e.bigTall ?? 78)).join('')}
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
  skins: (e, w, h) => layoutSkins(w, h),
};

const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
let made = 0;
for (const [id, e] of Object.entries(EVENTS)) {
  if (ONLY && ONLY !== id) continue;
  for (const [variant, layout] of Object.entries(LAYOUTS)) {
    // 확정본은 둘이다 — 덱 이벤트(final)와 ① Major Update(skins).
    const isFinalVariant = variant === 'final' || variant === 'skins';
    if (FINAL_ONLY !== isFinalVariant) continue;
    // ① 은 이벤트 하나뿐이라 덱마다 다시 그리지 않는다.
    if (variant === 'skins' && id !== 'hangul') continue;
    for (const [ratio, [w, h]] of Object.entries(SIZES)) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(`<style>${css(e)}</style>${layout(e, w, h)}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const name = !FINAL_ONLY ? `${id}-${variant}-${ratio}`
        : variant === 'skins' ? `major-${ratio}` : `${id}-${ratio}`;
      const file = `${OUT}/${name}.png`;
      await page.screenshot({ path: file });
      await page.close();
      console.log(`✅ ${file}`);
      made++;
    }
  }
}
await browser.close();
console.log(`\n${made}장 렌더 완료 → ${OUT}`);
