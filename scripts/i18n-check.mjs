// i18n 일관성 검사 — `node scripts/i18n-check.mjs` (또는 `pnpm run i18n:check`).
//
// 세 축을 본다.
//   1) 코드 ↔ 기준 언어 : t()로 부르는데 없는 키 / 정의만 되고 안 불리는 키
//   2) 언어 파일끼리     : 키 드리프트, 보간 변수 불일치, 미번역 의심
//   3) 자리 ↔ 글자 길이  : 폭이 고정된 자리에 번역이 물리적으로 안 들어가는 것
//
// (2)가 이 스크립트의 존재 이유다. 언어가 둘일 땐 눈으로 맞출 수 있었지만(실제로
// 103번 고치는 동안 ko/en 1,040키가 한 번도 어긋나지 않았다), 언어가 늘면 손으로는
// 반드시 샌다. 특히 보간 변수는 조용히 깨진다 — 번역기가 {{count}}를 통째로 날려도
// 화면에는 문장이 그럴듯하게 나오고, 숫자만 사라진다.
//
// exit 1 (CI·pre-commit에 물릴 수 있게):
//   - 코드가 부르는 키가 기준 언어에 없다        → 화면에 키 문자열이 그대로 뜬다
//   - 폴백 언어에 키가 빠졌다                    → 폴백이 뚫려 역시 키가 그대로 뜬다
//   - 어느 언어에만 있는 잉여 키                 → 죽은 키(오타이거나 지우다 만 것)
//   - 보간 변수가 언어마다 다르다                → 런타임에 값이 사라진다
//   - 등록된 좁은 자리의 폭 예산을 넘었다        → 화면에서 잘리거나 줄이 감긴다
// 그 외(폴백이 아닌 언어의 누락, 미번역 의심)는 보고만 한다. 폴백으로 메워지므로
// 화면이 깨지지는 않는다 — 이걸 실패로 만들면 언어를 새로 추가하는 순간 CI가 빨개진다.

import fs from 'fs';
import path from 'path';

const LOCALES_DIR = 'i18n/locales';

/** 폴백 언어는 i18n/locale.ts가 정한다 — 여기 하드코딩하면 두 곳이 갈린다. */
function readFallbackLocale() {
  try {
    const src = fs.readFileSync('i18n/locale.ts', 'utf8');
    const m = src.match(/FALLBACK_LOCALE[^=]*=\s*['"](\w+)['"]/);
    if (m) return m[1];
  } catch {
    /* 파일을 못 읽으면 아래 기본값 */
  }
  console.warn('⚠️  i18n/locale.ts에서 FALLBACK_LOCALE을 못 찾아 en으로 가정합니다.');
  return 'en';
}

/**
 * 기준 언어 = 키를 새로 쓰는 언어. 폴백과 다를 수 있다.
 * 이 저장소는 한국어로 먼저 쓰고 영어로 폴백한다.
 */
const BASE = process.env.I18N_BASE || 'ko';
const FALLBACK = readFallbackLocale();

const localeFiles = fs.readdirSync(LOCALES_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace(/\.json$/, ''))
  .sort();

if (!localeFiles.includes(BASE)) {
  console.error(`❌ 기준 언어 ${BASE}.json이 ${LOCALES_DIR}에 없습니다.`);
  process.exit(1);
}

const bundles = new Map(
  localeFiles.map(code => [code, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'))]),
);

/**
 * 중첩 객체를 `a.b.c` → 값 맵으로 편다.
 * 배열은 leaf로 둔다 — licenses.sections처럼 통째로 갈아끼우는 덩어리라,
 * 안까지 펴면 번역자가 항목 수를 바꿀 수 없게 된다.
 */
function flattenEntries(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenEntries(v, full, out);
    } else {
      out.set(full, v);
    }
  }
  return out;
}

const entries = new Map([...bundles].map(([code, json]) => [code, flattenEntries(json)]));
const baseEntries = entries.get(BASE);
const definedKeys = new Set(baseEntries.keys());

let failed = false;
const fail = (msg) => { failed = true; console.log(msg); };

// ─────────────────────────────────────────────────────────────────────────────
// 1. 코드 ↔ 기준 언어
// ─────────────────────────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'build') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

// t('key.path') / t("key.path") / t(`key.path`) 중 점이 있는 정적 리터럴만.
// 동적 조립(t(variable), t('a.'+b))은 못 잡는다 — 그래서 "안 불리는 키"에는
// 오탐이 섞인다. 지우기 전에 사람이 눈으로 볼 것.
const CALL_RE = /\bt\(\s*['"`]([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)['"`]/g;
const calledKeys = new Map();

for (const file of walk('.')) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = CALL_RE.exec(content)) !== null) {
    if (!calledKeys.has(m[1])) calledKeys.set(m[1], file);
  }
}

const missingInBase = [...calledKeys.entries()].filter(([k]) => !definedKeys.has(k));
const unused = [...definedKeys].filter(k => !calledKeys.has(k));

console.log(`언어 파일: ${localeFiles.join(', ')}  (기준 ${BASE}, 폴백 ${FALLBACK})`);
console.log(`정적 t() 호출 키 ${calledKeys.size}개 / ${BASE} 정의 키 ${definedKeys.size}개`);
console.log();

if (missingInBase.length) {
  fail(`❌ 코드가 부르는데 ${BASE}.json에 없는 키: ${missingInBase.length}`);
  for (const [k, file] of missingInBase) console.log(`   - ${k}  <- ${file}`);
} else {
  console.log(`✅ 코드가 부르는 키는 모두 ${BASE}.json에 있습니다.`);
}

console.log();
console.log(`ℹ️  정적 호출이 없는 키: ${unused.length}개 (동적 t()는 못 잡으므로 오탐 포함)`);
for (const k of unused.slice(0, 20)) console.log(`   - ${k}`);
if (unused.length > 20) console.log(`   ... 외 ${unused.length - 20}개`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. 언어 파일끼리
// ─────────────────────────────────────────────────────────────────────────────

/** `{{count}}` 같은 보간 변수 이름 집합. 배열 값도 통째로 훑는다. */
function interpolationVars(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]));
}

const setsEqual = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

console.log();
console.log('─'.repeat(60));
console.log('언어 간 비교');
console.log('─'.repeat(60));

for (const code of localeFiles) {
  if (code === BASE) continue;

  const target = entries.get(code);
  const missing = [...definedKeys].filter(k => !target.has(k));
  const extra = [...target.keys()].filter(k => !definedKeys.has(k));

  /*
   * 보간 변수 검사 — 기준·대상 양쪽에 있는 키만 본다.
   *
   * 변수 이름이 언어마다 다른 것 자체는 사고가 아니다. 호출부가 쓸 수 있는 변수를
   * 전부 넘기고 언어별로 골라 쓰는 설계가 실제로 있다:
   *
   *   t('stats.monthTitle', { year, month, monthName })
   *   ko "{{year}}년 {{month}}월"   en "{{monthName}} {{year}}"
   *
   * 그래서 이름이 갈리는 것은 경고로만 두고, 실패는 "기준엔 변수가 있는데 대상엔
   * 하나도 없는" 경우로 좁힌다. 그게 번역기가 {{count}}를 통째로 날린 모습이고,
   * 화면에는 문장이 멀쩡히 나오면서 숫자만 사라지므로 눈으로는 못 잡는다.
   */
  const varDropped = [];   // 실패: 변수가 통째로 사라짐
  const varRenamed = [];   // 경고: 이름이 갈림 (의도일 수 있음)
  for (const [k, baseVal] of baseEntries) {
    if (!target.has(k)) continue;
    const a = interpolationVars(baseVal);
    const b = interpolationVars(target.get(k));
    if (setsEqual(a, b)) continue;
    if (a.size > 0 && b.size === 0) varDropped.push({ key: k, base: [...a] });
    else varRenamed.push({ key: k, base: [...a], target: [...b] });
  }

  // 값이 기준과 글자 그대로 같은 키 — 고유명사(AI·TOPIK)면 정상이라 보고만 한다.
  const identical = [...target].filter(([k, v]) =>
    baseEntries.has(k) && JSON.stringify(v) === JSON.stringify(baseEntries.get(k))).length;

  const isFallback = code === FALLBACK;
  console.log();
  console.log(`[${code}]${isFallback ? ' (폴백)' : ''} 키 ${target.size}개`);

  if (missing.length === 0) {
    console.log(`   ✅ 누락 없음`);
  } else if (isFallback) {
    fail(`   ❌ 누락 ${missing.length}개 — 폴백 언어라 이 키는 화면에 키 문자열 그대로 뜹니다`);
    for (const k of missing.slice(0, 15)) console.log(`      - ${k}`);
    if (missing.length > 15) console.log(`      ... 외 ${missing.length - 15}개`);
  } else {
    console.log(`   ⚠️  누락 ${missing.length}개 — ${FALLBACK}로 폴백됩니다 (pnpm run i18n:fill 로 채울 수 있음)`);
    for (const k of missing.slice(0, 10)) console.log(`      - ${k}`);
    if (missing.length > 10) console.log(`      ... 외 ${missing.length - 10}개`);
  }

  if (extra.length) {
    fail(`   ❌ ${BASE}에 없는 잉여 키 ${extra.length}개 — 오타이거나 지우다 만 키입니다`);
    for (const k of extra.slice(0, 15)) console.log(`      - ${k}`);
    if (extra.length > 15) console.log(`      ... 외 ${extra.length - 15}개`);
  }

  if (varDropped.length) {
    fail(`   ❌ 보간 변수가 통째로 빠진 키 ${varDropped.length}개 — 런타임에 값이 사라집니다`);
    for (const { key, base } of varDropped.slice(0, 15)) {
      console.log(`      - ${key}: ${BASE}에는 {{${base.join('}}, {{')}}} 가 있는데 ${code}에는 없음`);
    }
    if (varDropped.length > 15) console.log(`      ... 외 ${varDropped.length - 15}개`);
  }

  if (varRenamed.length) {
    console.log(`   ⚠️  보간 변수 이름이 다른 키 ${varRenamed.length}개 (언어별 어순 차이면 정상)`);
    for (const { key, base, target: t } of varRenamed.slice(0, 10)) {
      console.log(`      - ${key}: ${BASE}={{${base.join(',')}}} vs ${code}={{${t.join(',')}}}`);
    }
    if (varRenamed.length > 10) console.log(`      ... 외 ${varRenamed.length - 10}개`);
  }

  if (identical) console.log(`   ℹ️  값이 ${BASE}와 동일한 키 ${identical}개 (고유명사면 정상)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 자리 ↔ 글자 길이
// ─────────────────────────────────────────────────────────────────────────────

/*
 * 왜 필요한가 — 2026-08-03, 스페인어를 넣고 실기에서야 다섯 군데가 깨진 걸 발견했다.
 * 그중 탭 라벨은 스페인어와 무관하게 **영어에서도 이미 잘리고 있었는데** 아무도
 * 몰랐다("Collections" 11자). 눈으로 도는 검증은 언어 수만큼 비용이 곱해지는데,
 * 정작 잘림은 한 언어만 봐도 안 보인다. 그래서 기계가 먼저 잰다.
 *
 * 왜 등록제인가 — `numberOfLines={1}`이 걸린 키는 35개나 되지만 대부분은 화면 폭을
 * 통째로 쓰는 설정 행 설명이라 길어도 멀쩡하다. 문제는 "얼마나 좁은 자리인가"인데
 * 그건 코드에서 못 읽는다(레이아웃을 돌려야 안다). 좁은 자리는 사람이 등록하고,
 * 예산은 실측에서 역산한다.
 *
 * 단위는 em(폰트 크기 배수)이다. px로 적으면 폰트 크기를 바꿀 때 같이 못 고친다.
 */
const WIDTH_BUDGETS = [
  {
    slot: '탭 바 라벨',
    max: 5.6,
    basis: '탭 폭 ≈72dp(360÷5) / 12px → 6.0em, 여유 두어 5.6',
    keys: ['tabs.home', 'tabs.vocabLists', 'tabs.curation', 'tabs.settings'],
  },
  {
    slot: '학습 모드 버튼 (3분할)',
    max: 8.3,
    basis: '골라서 학습 하단바·학습계획 ≈101dp / 11.5px → 8.8em. 하단바는 numberOfLines={1}이라 잘리고, 학습계획은 두 줄로 감긴다',
    keys: ['studySelect.flashcardsTitle', 'studySelect.quizTitle', 'studySelect.examplesTitle'],
  },
  {
    slot: '카드학습 좌우 버튼',
    max: 6.5,
    basis: '버튼 폭 절반 ≈148dp에서 아이콘·gap 32 뺀 116dp / 17px → 6.8em',
    keys: ['flashcards.reviewBtn', 'flashcards.memorized'],
  },
  {
    slot: '홈 통계 3분할 캡션',
    max: 8.5,
    basis: 'StatsStrip 한 칸 ≈99dp / 11px → 9.0em',
    keys: ['stats.streakLabel', 'stats.todayMemorized', 'stats.memorizedLabel'],
  },
  {
    slot: '통계 화면 타일 (4분할)',
    max: 6.3,
    basis: '360 - 좌우 16×2 - gap 7×3 = 307을 4등분 76.8dp, 타일 안쪽 패딩·테두리 10 빼고 66.8dp / 10px → 6.7em',
    keys: ['stats.todayMemorized', 'stats.weekMemorized', 'stats.totalMemorized', 'stats.totalDays'],
  },
  {
    slot: 'AI 생성 모달 3분할 버튼',
    max: 5.6,
    basis: '모달 312dp(360 - 오버레이 24×2) - 본문 24×2 = 264, gap 8×2 빼고 3등분 82.7dp / 14px → 5.9em',
    keys: ['curation.beginner', 'curation.intermediate', 'curation.advanced'],
  },
  {
    slot: 'AI 생성 모달 주제 입력칸',
    max: 14.0,
    basis: '본문 264dp - 입력칸 좌우 14×2 = 236dp / 16px → 14.8em. 한 줄 입력이라 넘치면 잘린다',
    keys: ['curation.aiTopicPlaceholder'],
  },
];

/**
 * 글자 폭을 em으로 어림한다. 정확한 값은 폰트 메트릭이 필요하지만, 잘리느냐 마느냐는
 * 이 정도 해상도로 갈린다 — 한글과 라틴이 자당 두 배 가까이 차이 나는 것만 반영하면
 * "11자면 위험, 7자면 안전" 수준의 판정은 맞는다.
 *
 * 보간 변수는 런타임 값이라 길이를 모른다. 숫자 두 자리로 가정한다({{count}} 대부분이
 * 한 자리~세 자리다). 여기가 틀려도 예산에 둔 여유가 흡수한다.
 */
function textWidthEm(raw) {
  const text = String(raw).replace(/\{\{\s*[\w.]+\s*\}\}/g, '88');
  let w = 0;
  for (const ch of text) {
    if (/[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-｠]/.test(ch)) w += 1.0;
    else if (ch === ' ') w += 0.26;
    else if (/[iIl1.,:;'!|()[\]]/.test(ch)) w += 0.3;
    else if (/[mwMW]/.test(ch)) w += 0.88;
    else if (/[A-Z0-9]/.test(ch)) w += 0.62;
    else w += 0.52;
  }
  return w;
}

console.log();
console.log('─'.repeat(60));
console.log('좁은 자리 폭 예산');
console.log('─'.repeat(60));

for (const { slot, max, basis, keys } of WIDTH_BUDGETS) {
  const over = [];
  for (const key of keys) {
    if (!definedKeys.has(key)) {
      fail(`❌ 폭 예산에 등록된 키가 ${BASE}.json에 없습니다: ${key} — 키를 지웠다면 이 등록도 지워 주세요.`);
      continue;
    }
    for (const code of localeFiles) {
      const value = entries.get(code).get(key);
      if (typeof value !== 'string') continue;
      const w = textWidthEm(value);
      if (w > max) over.push({ code, key, value, w });
    }
  }

  console.log();
  console.log(`[${slot}] 상한 ${max}em — ${basis}`);
  if (!over.length) {
    console.log(`   ✅ ${keys.length}개 키 × ${localeFiles.length}개 언어 모두 예산 안`);
    continue;
  }
  fail(`   ❌ 예산 초과 ${over.length}건 — 화면에서 잘리거나 줄이 감깁니다`);
  for (const { code, key, value, w } of over.sort((a, b) => b.w - a.w)) {
    console.log(`      - [${code}] ${key} = "${value}"  ${w.toFixed(1)}em (${(w - max).toFixed(1)} 초과)`);
  }
}

console.log();
console.log('─'.repeat(60));
if (failed) {
  console.log('❌ 실패 — 위 ❌ 항목을 고쳐 주세요.');
  process.exit(1);
}
console.log('✅ 통과');
