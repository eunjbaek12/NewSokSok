// 언어 파일의 빠진 키를 AI로 채운다 — `pnpm run i18n:fill -- --lang=es`.
//
// 왜 있나: 번역 파일은 기능을 만들 때마다 바뀐다(i18n 도입 4개월간 103번, 1,974줄).
// 언어가 둘일 땐 손으로 맞출 수 있었지만 늘어나면 반드시 샌다. 이 스크립트가 있으면
// 유지 흐름이 "ko에 키 추가 → i18n:fill → 눈으로 훑기"가 되어, 언어가 2개든 6개든
// 사람이 하는 일의 양이 같다.
//
// 안전 장치:
//   - 이미 있는 값은 절대 덮지 않는다. 빠진 키만 채운다.
//   - 보간 변수({{count}})가 원문과 달라지면 그 키를 버리고 보고한다. 번역기가 변수를
//     날리는 건 가장 흔한 사고인데 화면상으로는 멀쩡해 보여서 눈으로 못 잡는다.
//   - 문자열만 채운다. 배열·객체 값(licenses.sections 같은 덩어리)은 건드리지 않고
//     "수동 필요"로 보고한다 — 법적 문서라 기계번역을 얹을 자리가 아니다.
//   - --dry-run으로 무엇을 채울지만 볼 수 있다.
//
// 실행 후에는 반드시 `pnpm run i18n:check`로 확인할 것.

import fs from 'fs';
import path from 'path';

const LOCALES_DIR = 'i18n/locales';
const BASE = process.env.I18N_BASE || 'ko';
const CONTEXT = 'en';           // 원문 이해를 돕는 보조 언어
const BATCH_SIZE = 40;
const BATCH_DELAY_MS = 3000;

const args = process.argv.slice(2);
const langArg = args.find(a => a.startsWith('--lang='));
const DRY_RUN = args.includes('--dry-run');
const LIMIT = Number((args.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;

if (!langArg) {
  console.error('사용법: pnpm run i18n:fill -- --lang=<코드> [--dry-run] [--limit=N]');
  console.error(`  예: pnpm run i18n:fill -- --lang=es`);
  console.error(`  현재 언어 파일: ${fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json')).join(', ')}`);
  process.exit(1);
}
const TARGET = langArg.split('=')[1];

if (TARGET === BASE) {
  console.error(`❌ ${TARGET}는 기준 언어입니다. 채울 대상이 아닙니다.`);
  process.exit(1);
}

/** 언어 이름 — 프롬프트에 넣을 값. 코드만 주면 모델이 엉뚱한 언어를 고르기도 한다. */
const LANGUAGE_NAMES = {
  ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Simplified Chinese',
  vi: 'Vietnamese', es: 'Spanish', pt: 'Brazilian Portuguese', fr: 'French',
  de: 'German', id: 'Indonesian', th: 'Thai', ru: 'Russian', tr: 'Turkish',
};
const TARGET_NAME = LANGUAGE_NAMES[TARGET];
if (!TARGET_NAME) {
  console.error(`❌ ${TARGET}의 언어 이름을 모릅니다. scripts/i18n-fill.mjs의 LANGUAGE_NAMES에 추가해 주세요.`);
  process.exit(1);
}

// ─── 입력 읽기 ───────────────────────────────────────────────────────────────

const readBundle = (code) => {
  const p = path.join(LOCALES_DIR, `${code}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

const base = readBundle(BASE);
if (!base) {
  console.error(`❌ 기준 언어 ${BASE}.json이 없습니다.`);
  process.exit(1);
}
const context = readBundle(CONTEXT) ?? {};
const existing = readBundle(TARGET) ?? {};
const isNewLanguage = readBundle(TARGET) === null;

function flattenEntries(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flattenEntries(v, full, out);
    else out.set(full, v);
  }
  return out;
}

const baseFlat = flattenEntries(base);
const ctxFlat = flattenEntries(context);
const targetFlat = flattenEntries(existing);

const missing = [...baseFlat.keys()].filter(k => !targetFlat.has(k));
const nonString = missing.filter(k => typeof baseFlat.get(k) !== 'string');
const fillable = missing.filter(k => typeof baseFlat.get(k) === 'string').slice(0, LIMIT);
const extra = [...targetFlat.keys()].filter(k => !baseFlat.has(k));

console.log(`대상 ${TARGET} (${TARGET_NAME})${isNewLanguage ? ' — 새 언어 파일을 만듭니다' : ''}`);
console.log(`  ${BASE} 키 ${baseFlat.size}개 / ${TARGET} 키 ${targetFlat.size}개`);
console.log(`  채울 키 ${fillable.length}개${LIMIT !== Infinity ? ` (--limit=${LIMIT} 적용)` : ''}`);
if (nonString.length) console.log(`  ⏭️  건너뜀 ${nonString.length}개 — 배열·객체 값이라 수동 번역이 필요합니다:\n     ${nonString.join('\n     ')}`);
if (extra.length) console.log(`  🗑️  ${BASE}에 없는 잉여 키 ${extra.length}개는 결과에서 빠집니다: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ' …' : ''}`);

if (fillable.length === 0) {
  console.log('\n채울 것이 없습니다.');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('\n--dry-run — 채울 키 목록:');
  for (const k of fillable.slice(0, 60)) console.log(`   ${k}  ${JSON.stringify(baseFlat.get(k)).slice(0, 60)}`);
  if (fillable.length > 60) console.log(`   ... 외 ${fillable.length - 60}개`);
  process.exit(0);
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

const envPath = path.resolve(process.cwd(), '.env');
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const m = envContent.match(/^EXPO_PUBLIC_GEMINI_API_KEY=(.*)$/m) ?? envContent.match(/^GEMINI_API_KEY=(.*)$/m);
  if (m) GEMINI_API_KEY = m[1].trim();
}
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY가 .env에 없습니다.');
  process.exit(1);
}

const MODEL = args.includes('--model=lite') ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PROMPT_HEADER = `You are localizing the UI strings of a vocabulary-learning mobile app into ${TARGET_NAME}.

Rules — these matter more than elegance:
- Keep every {{placeholder}} EXACTLY as written. Never translate, rename, or drop what is inside {{ }}. You may move it to fit natural word order.
- Keep \\n line breaks, emoji, and any Markdown-ish punctuation as they appear.
- These are UI labels in tight spaces (buttons, tab titles, toasts). Prefer short natural phrasing over literal translation.
- Address the user directly and politely, matching the tone of the Korean source.
- Product nouns stay as-is: TOPIK, AI, Pro, Gemini, CSV.

Korean is the source of truth. English is given only to disambiguate.
Return ONLY a JSON object mapping each key to its ${TARGET_NAME} translation. No commentary, no code fence.`;

/** `{{count}}` 같은 변수 이름 집합. */
const varsOf = (s) => new Set([...String(s ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]));
const sameVars = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

async function translateBatch(keys) {
  const payload = keys.map(k => ({ key: k, ko: baseFlat.get(k), en: ctxFlat.get(k) ?? undefined }));
  const body = {
    contents: [{ parts: [{ text: `${PROMPT_HEADER}\n\n${JSON.stringify(payload, null, 1)}` }] }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('빈 응답');
  return JSON.parse(text);
}

// ─── 실행 ───────────────────────────────────────────────────────────────────

const translated = new Map();
const rejected = [];

for (let i = 0; i < fillable.length; i += BATCH_SIZE) {
  const batch = fillable.slice(i, i + BATCH_SIZE);
  const n = Math.floor(i / BATCH_SIZE) + 1;
  const total = Math.ceil(fillable.length / BATCH_SIZE);
  process.stdout.write(`\n[${n}/${total}] ${batch.length}개 번역 중… `);

  let result;
  try {
    result = await translateBatch(batch);
  } catch (e) {
    console.log(`실패: ${e.message}`);
    console.log('   이 배치는 건너뜁니다. 다시 실행하면 남은 키만 시도합니다.');
    continue;
  }

  let ok = 0;
  for (const key of batch) {
    const value = result[key];
    if (typeof value !== 'string' || value.trim() === '') {
      rejected.push({ key, why: '응답에 없거나 빈 값' });
      continue;
    }
    // 변수가 원문과 달라졌으면 버린다 — 채우는 것보다 비워 두고 폴백하는 편이 낫다.
    if (!sameVars(varsOf(baseFlat.get(key)), varsOf(value))) {
      rejected.push({ key, why: `보간 변수 불일치 (${[...varsOf(baseFlat.get(key))].join(',')} → ${[...varsOf(value)].join(',') || '없음'})` });
      continue;
    }
    translated.set(key, value);
    ok++;
  }
  process.stdout.write(`${ok}개 확보`);

  if (i + BATCH_SIZE < fillable.length) await sleep(BATCH_DELAY_MS);
}

console.log('\n');

// 기준 언어의 구조·순서를 그대로 따라 재조립한다. 언어 파일끼리 diff가 깨끗해지고,
// 잉여 키는 자연히 빠진다(위에서 미리 알렸다).
function rebuild(baseNode, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(baseNode)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      // 자식이 하나도 안 채워졌으면 껍데기를 남기지 않는다 — 부분 번역(배치 실패·
      // --limit) 상태에서 `"common": {}` 같은 빈 객체가 파일을 뒤덮는다.
      const child = rebuild(v, full);
      if (Object.keys(child).length > 0) out[k] = child;
    } else if (targetFlat.has(full)) {
      out[k] = targetFlat.get(full);          // 기존 값 보존 — 절대 덮지 않는다
    } else if (translated.has(full)) {
      out[k] = translated.get(full);
    }
    // 셋 다 아니면 키를 넣지 않는다 → 폴백이 메운다
  }
  return out;
}

const merged = rebuild(base);
const outPath = path.join(LOCALES_DIR, `${TARGET}.json`);
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n');

console.log(`✅ ${outPath} 저장 — ${translated.size}개 채움`);
if (rejected.length) {
  console.log(`\n⚠️  버린 키 ${rejected.length}개 (비워 뒀으므로 폴백됩니다):`);
  for (const { key, why } of rejected.slice(0, 20)) console.log(`   - ${key}: ${why}`);
  if (rejected.length > 20) console.log(`   ... 외 ${rejected.length - 20}개`);
  console.log('   다시 실행하면 이 키들만 재시도합니다.');
}
if (nonString.length) console.log(`\n📝 배열·객체 값 ${nonString.length}개는 수동 번역이 필요합니다.`);
if (isNewLanguage) {
  console.log(`\n📌 새 언어를 앱에 등록하려면:`);
  console.log(`   1. shared/contracts.ts  UILocaleCodeSchema에 '${TARGET}' 추가`);
  console.log(`   2. 컴파일 에러가 나는 곳을 따라가면 됩니다 (i18n/locale.ts·i18n/index.ts·features/stats/quotes.ts)`);
  console.log(`   3. languages/${TARGET}.json (앱 이름·권한 문구)도 필요합니다 — expo.locales`);
}
console.log(`\n다음: pnpm run i18n:check`);
