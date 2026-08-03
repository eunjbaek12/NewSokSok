// i18n 일관성 검사 — `node scripts/i18n-check.mjs` (또는 `pnpm run i18n:check`).
//
// 두 축을 본다.
//   1) 코드 ↔ 기준 언어 : t()로 부르는데 없는 키 / 정의만 되고 안 불리는 키
//   2) 언어 파일끼리     : 키 드리프트, 보간 변수 불일치, 미번역 의심
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

console.log();
console.log('─'.repeat(60));
if (failed) {
  console.log('❌ 실패 — 위 ❌ 항목을 고쳐 주세요.');
  process.exit(1);
}
console.log('✅ 통과');
