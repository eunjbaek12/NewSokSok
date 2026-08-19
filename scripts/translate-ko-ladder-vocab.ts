/**
 * 한국어 학습 사다리 4덱의 **신규 표제어만** Gemini로 enrich (ko→en).
 *
 * 입력: scripts/.ko-ladder-new-terms.json  (build-ko-ladder-source.ts 뒤 재배치에서 산출)
 * 출력: scripts/ko-ladder-translated.json
 * 진행: scripts/.ko-ladder-progress.json   (표제어 단위. 중단해도 그대로 이어진다)
 *
 * 기존 translate-ko-{,intermediate-,advanced-}vocab.ts 셋을 합친 것이다. 프롬프트는
 * 그 셋을 그대로 옮겨 왔다 — 이미 만들어 둔 카드 1,482개가 이 프롬프트 산출물이라,
 * 문구를 손대면 한 덱 안에서 카드 형식이 갈린다.
 *
 * 셋과 달라진 점 하나: **예문에 표제어가 실제로 쓰였는지 검사한다.**
 *   레딧 제보의 `그러다` 카드가 예문에서 `그렇게`를 쓰고 있었다. 문자열 검사로는
 *   이걸 못 잡는다 — 한국어 용언은 활용으로 어간까지 바뀌고(자르다→잘랐어요),
 *   반대로 느슨하게 재면 `그러다`의 첫 글자 `그`가 `그가 그렇게`에 걸린다.
 *   앱이 쓰는 canBlankExample 로 실측해도 두 경우 다 오판했다.
 *   그래서 판정을 모델에게 넘긴다 — 예문에 쓴 활용형을 `usedForm` 으로 함께 받고,
 *   그 문자열이 예문 안에 실제로 있는지만 확인한다. 모델이 예문에서 아무 낱말이나
 *   베껴 오는 것을 막으려고 표제어와 첫 음절을 공유하는지도 같이 본다.
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/translate-ko-ladder-vocab.ts
 * 옵션:
 *   --limit=N      앞에서 N개만 (소규모 시험용)
 *   --deck=KEY     basic | inter1 | inter2 | advanced 중 하나만
 *   --model=NAME   모델 지정 (기본값·주의사항은 scripts/_shared/model.ts)
 *   --batch=N      한 요청에 담을 표제어 수 (기본 25). BATCH_SIZE 주석 참고.
 */
import fs from 'fs';
import path from 'path';
import { resolveScriptModel, scriptGenerateContentUrl } from './_shared/model';
import { checkRomaja } from './lib/romanize';

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const deckArg = process.argv.find(a => a.startsWith('--deck='));
const DECK_FILTER = deckArg ? deckArg.split('=')[1] : '';
const MODEL = resolveScriptModel();

const envPath = path.resolve(process.cwd(), '.env');
let GEMINI_API_KEY = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^EXPO_PUBLIC_GEMINI_API_KEY=(.*)$/m)
    ?? envContent.match(/^GEMINI_API_KEY=(.*)$/m);
  if (match) GEMINI_API_KEY = match[1].trim();
}
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY (또는 EXPO_PUBLIC_GEMINI_API_KEY)가 .env에 없습니다.');
  process.exit(1);
}

const API_URL = scriptGenerateContentUrl(GEMINI_API_KEY, MODEL);
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/.ko-ladder-new-terms.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/ko-ladder-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.ko-ladder-progress.json');

/**
 * 유료 키에서는 이 값이 속도만 정한다. 무료 키로 되돌아갈 일이 있다면 얘기가 달라지므로
 * 남겨 둔다 — **무료 한도는 단어 수가 아니라 요청 수로 걸린다**(모델당 하루 20요청,
 * `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, quotaValue 20). 그래서
 * 무료에서는 하루 산출이 `20 × BATCH_SIZE` 였고, 배치를 키우는 것이 유일한 증산 수단이었다.
 * 🔴 그때 요청 예산의 40%가량을 아래 "예문 재생성"이 먹었다 — 자투리 1~3개짜리 재시도가
 *    25개짜리 배치와 같은 값 1요청을 치른다. 무료로 돌릴 일이 있으면 이것부터 모을 것.
 *
 * 올리기 전에 한 배치만 시험할 것. 목록이 길어지면 모델이 개수를 빠뜨리거나 뒤쪽을
 * 대충 쓸 수 있다. 다만 짧게 와도 유실은 없다 — 받은 것만 저장하고 빠진 표제어는
 * 다음 실행에서 다시 잡힌다(진행 파일이 표제어 단위다).
 */
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? Number(batchArg.split('=')[1]) : 25;
if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1) {
  console.error(`❌ --batch 는 1 이상의 정수여야 합니다: ${batchArg}`);
  process.exit(1);
}
const BATCH_DELAY_MS = 5000;

type DeckKey = 'basic' | 'inter1' | 'inter2' | 'advanced';

interface NewTerm {
  deck: DeckKey;
  term: string;
  pos: string;
  grade: string;
  rank: number;
}

export interface TranslatedEntry {
  deck: DeckKey;
  term: string;
  pos: string;
  grade: string;
  rank: number;
  meaningEn: string;
  romaja: string;
  exampleKo: string;
  exampleEn: string;
  usedForm: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * 덱마다 다른 것은 학습자 수준·예문 난이도뿐이다. 나머지 규칙은 공유한다.
 *
 * 🔴 `words` 는 취향이 아니라 **재사용 카드 1,482장의 실측치**다. 임의로 바꾸지 말 것.
 *    한 덱에는 옛 덱에서 그대로 옮겨 온 카드와 여기서 새로 만든 카드가 섞이므로
 *    (integrate-ko-ladder.ts — 학습 중인 사용자의 카드가 바뀌면 안 되어 옛 카드는 손대지
 *    않는다), 길이가 갈리면 학습 화면에서 바로 보인다. 옛 3덱 1,500장 실측(어절):
 *      basic 3.8(2~7) · intermediate 7.3(4~11) · advanced 11.1(6~18)
 *
 * 🔑 2026-08 이전 값(5-12 / 8-15 / 8-15 / 10-18)은 이 실측과 어긋나 있었는데도 문제가
 *    나지 않았다 — 옛 덱도 gemini-2.5-flash 로 만들어서, **같은 모델을 쓰는 한 스펙을
 *    무시하고 같은 길이가 나왔기 때문**이다(신규 591장 실측 3.7/7.3/7.1/10.3 이 옛 덱과
 *    소수점까지 일치했다). 일관성을 지탱한 것은 스펙이 아니라 모델이었다.
 *    2.5 가 신규 프로젝트에서 막혀 gemini-3.5-flash-lite 로 옮기자 그 모델은 스펙을
 *    실제로 따랐고, inter2 가 7.1 → 9.4어절로 튀었다. 그래서 숫자를 실측치로 다시 썼다.
 *    **모델을 바꿀 때는 이 값이 지켜지는지 한 배치로 먼저 재라.**
 *
 * 🔑 스펙을 그대로 믿지 말고 보정하라. 3.5-flash-lite 는 지정 범위의 **중앙값보다
 *    1.2~1.7어절 짧게** 낸다(관측 3회: 8-15→9.4 · 6-9→5.8 · 9-13→9.8). 그래서 목표
 *    평균을 얻으려면 범위를 그만큼 올려 잡아야 한다 — 아래 값이 그렇게 보정한 결과이고,
 *    실측으로 inter2 7.4 · advanced 11.3 이 나와 목표(7.3 · 11.1)에 들어맞았다.
 */
const LEVEL_SPEC: Record<DeckKey, {
  learner: string; adjective: string; words: string; topik: string;
  meaningEg: string; romajaEg: string; extraRules: string[];
}> = {
  basic: {
    // ⚠️ basic 만 실측으로 확인하지 못한 값이다 — 이번 작업에서 basic 은 이미 2.5-flash 로
    //    다 만들어져 있어 새 모델로 뽑을 표제어가 없었다. 아래 보정식으로 유추만 했다.
    //    basic 을 다시 생성하게 되면 한 배치를 뽑아 3.8어절이 나오는지 먼저 재라.
    learner: 'beginners', adjective: 'beginner', words: '4-7', topik: '1-2',
    meaningEg: 'to eat, to have a meal', romajaEg: 'saram',
    extraRules: [
      '- Example must be TOPIK 1-2 difficulty (basic vocabulary, simple grammar), Hangul only.',
      '- For grammatical/abstract words (것, 하다, 되다, etc.), give the most useful learner-facing meaning and a clear contextual example.',
    ],
  },
  inter1: {
    learner: 'intermediate learners', adjective: 'intermediate', words: '7-11', topik: '3-4',
    meaningEg: 'to face, to deal with', romajaEg: 'daehada',
    extraRules: [
      '- Example must be TOPIK 3-4 difficulty (intermediate vocabulary, connectives like -지만/-는데/-아서/-(으)면, common modal endings), Hangul only.',
      '- Avoid overly literary or formal sentences; aim for realistic everyday/work/study contexts.',
      '- For abstract or grammatical-flavored words (대하다, 위하다, 통하다, 따르다, etc.), pick the most useful learner-facing sense and a clear contextual example.',
    ],
  },
  inter2: {
    learner: 'intermediate learners', adjective: 'intermediate', words: '7-11', topik: '3-4',
    meaningEg: 'to face, to deal with', romajaEg: 'daehada',
    extraRules: [
      '- Example must be TOPIK 3-4 difficulty (intermediate vocabulary, connectives like -지만/-는데/-아서/-(으)면, common modal endings), Hangul only.',
      '- Avoid overly literary or formal sentences; aim for realistic everyday/work/study contexts.',
      '- For abstract or grammatical-flavored words (대하다, 위하다, 통하다, 따르다, etc.), pick the most useful learner-facing sense and a clear contextual example.',
    ],
  },
  advanced: {
    learner: 'advanced learners', adjective: 'advanced', words: '11-15', topik: '5-6',
    meaningEg: 'to carry out, to perform, to execute', romajaEg: 'suhaenghada',
    extraRules: [
      '- English must be natural and idiomatic; prefer slightly elevated register when appropriate.',
      '- Example must be TOPIK 5-6 difficulty: use advanced grammar such as -(으)ㄴ/는 데 반해, -(으)ㄹ 뿐만 아니라, -(으)ㅁ에도 불구하고, -(으)ㄴ 채(로), -(으)ㄴ/는 만큼, -(으)ㄹ 정도로, -았/었더라면, -기 마련이다, 사동·피동, 격식체 등. Hangul only.',
      '- Topics should fit advanced learner contexts: news, academic, workplace, social issues, culture, abstract reasoning.',
      '- For abstract or formal nouns (현상, 구조, 의식, 본격적, 근본적 등), give the most useful learner-facing sense and a clear contextual example.',
    ],
  },
};

export function buildPrompt(deck: DeckKey, batch: NewTerm[]): string {
  const s = LEVEL_SPEC[deck];
  const inputJson = JSON.stringify(batch.map(e => ({ term: e.term, hintPos: e.pos })), null, 0);
  return `You are an expert Korean vocabulary tutor for English-speaking ${s.learner}.

For each Korean word, provide an English meaning, Revised Romanization, a natural ${s.adjective} Korean example sentence, and its English translation.

Input:
${inputJson}

The "hintPos" is a rough part-of-speech guess and is occasionally wrong — judge the ACTUAL most common part of speech of the Korean word yourself.

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, Hangul>",
  "pos": "noun | verb | adjective | adverb | pronoun | numeral | interjection | determiner | dependent noun",
  "meaningEn": "English meaning (1-3 senses, comma-separated). e.g. \\"${s.meaningEg}\\"",
  "romaja": "Revised Romanization of the term. e.g. \\"${s.romajaEg}\\"",
  "exampleKo": "Natural ${s.adjective} Korean sentence (${s.words} words) using the term. TOPIK level ${s.topik} grammar and vocabulary.",
  "exampleEn": "Natural English translation of exampleKo.",
  "usedForm": "The exact substring of exampleKo that realises the term — the inflected form you actually wrote. e.g. term 그러다 → \\"그러다\\" or \\"그러다가\\"; term 자르다 → \\"잘랐\\". Copy it character-for-character from exampleKo."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- English must be natural and idiomatic.
- **exampleKo MUST contain the headword itself (any inflected form). Never substitute a synonym or a look-alike word** — writing 그렇게 for the headword 그러다 is wrong. usedForm must be copied verbatim out of exampleKo.
${s.extraRules.join('\n')}
- Return ONLY the JSON array.`;
}

/** 한글 음절의 초성. 음절이 아니면 글자 그대로. */
function initialConsonant(ch: string): string {
  const c = ch.charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return ch;
  return String.fromCharCode(0x1100 + Math.floor((c - 0xac00) / 588));
}

/**
 * 표제어가 예문에 실제로 쓰였는가.
 *
 * 모델이 신고한 usedForm 을 믿되, 두 가지 거짓말을 막는다:
 *   ① 예문에 없는 형태를 적는 것       → 문자열 포함 확인
 *   ② 예문에서 아무 낱말이나 베껴 오는 것 → 표제어 어간과 초성을 공유하는지 확인
 *
 * ②를 음절이 아니라 **초성**으로 재는 이유: 한국어 불규칙 활용은 어간의 첫 음절
 * 자체를 바꾼다(자르다→잘랐, 끄다→껐). 음절로 재면 이런 정상 카드가 걸려 헛되이
 * 재생성된다 — 실측 1.3%가 그랬다.
 *
 * 🔴 ②는 느슨하고, 느슨한 것이 의도다. `그러다`↔`그렇게`는 초성도 음절도 같아서
 *    형태만으로는 영영 가를 수 없다(앱의 canBlankExample 도 같은 이유로 오판한다).
 *    그 케이스를 실제로 막는 것은 ①이다 — 모델이 표제어를 안 썼다면 신고할 형태가
 *    없어 예문에 없는 문자열을 적게 되고, 거기서 걸린다. ②가 잡는 것은 "표제어와
 *    아무 관계없는 낱말을 베껴 온 경우"뿐이며, 초성이 우연히 같으면 통과한다.
 */
export function exampleUsesTerm(term: string, exampleKo: string, usedForm: string): boolean {
  const form = (usedForm ?? '').trim();
  if (!form || !exampleKo) return false;
  if (!exampleKo.includes(form)) return false;
  const stem = /다$/.test(term) && term.length >= 2 ? term.slice(0, -1) : term;
  return initialConsonant(form[0]) === initialConsonant(stem[0]);
}

async function translateBatch(deck: DeckKey, batch: NewTerm[], retry = 0): Promise<TranslatedEntry[]> {
  const prompt = buildPrompt(deck, batch);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if ((response.status === 429 || response.status === 503) && retry < 6) {
      const waits = [15, 30, 60, 120, 300, 600];
      console.log(`  ⏳ ${response.status}, ${waits[retry]}초 대기... (${retry + 1}/6)`);
      await sleep(waits[retry] * 1000);
      return translateBatch(deck, batch, retry + 1);
    }
    throw new Error(`API 오류 (${response.status}): ${err.slice(0, 300)}`);
  }

  const data: any = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`빈 응답: ${JSON.stringify(data).slice(0, 300)}`);

  let parsed: any[];
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`JSON 파싱 실패: ${text.slice(0, 300)}`);
  }
  if (!Array.isArray(parsed)) throw new Error('배열이 아님');

  // 순서가 어긋나는 일이 있어 term 으로 되찾는다.
  const byTerm = new Map<string, any>();
  for (const p of parsed) if (p?.term) byTerm.set(String(p.term).trim(), p);

  const out: TranslatedEntry[] = [];
  for (const src of batch) {
    const p = byTerm.get(src.term);
    if (!p) continue;
    out.push({
      deck: src.deck,
      term: src.term,
      pos: String(p.pos ?? src.pos).trim(),
      grade: src.grade,
      rank: src.rank,
      meaningEn: String(p.meaningEn ?? '').trim(),
      romaja: String(p.romaja ?? '').trim(),
      exampleKo: String(p.exampleKo ?? '').trim(),
      exampleEn: String(p.exampleEn ?? '').trim(),
      usedForm: String(p.usedForm ?? '').trim(),
    });
  }
  return out;
}

function loadProgress(): TranslatedEntry[] {
  if (!fs.existsSync(PROGRESS_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')); } catch { return []; }
}
function saveProgress(rows: TranslatedEntry[]) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(rows, null, 1));
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ 소스 없음: ${SOURCE_PATH}`);
    process.exit(1);
  }
  const all: NewTerm[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const filtered = DECK_FILTER ? all.filter(e => e.deck === DECK_FILTER) : all;

  const done = loadProgress();
  const doneTerms = new Set(done.map(e => e.term));
  const todo = filtered.filter(e => !doneTerms.has(e.term)).slice(0, LIMIT);

  console.log(`📚 남은 ${todo.length}개 / 대상 ${filtered.length}개 (완료 ${done.length}개, model=${MODEL}, batch=${BATCH_SIZE})`);
  if (todo.length === 0) { console.log('할 일 없음.'); return; }

  // 같은 덱끼리 묶어야 프롬프트를 한 배치에 하나만 쓴다.
  const byDeck = new Map<DeckKey, NewTerm[]>();
  for (const e of todo) {
    if (!byDeck.has(e.deck)) byDeck.set(e.deck, []);
    byDeck.get(e.deck)!.push(e);
  }

  const results = [...done];
  let rejected = 0;
  let romajaFixed = 0;
  const batches: [DeckKey, NewTerm[]][] = [];
  for (const [deck, list] of byDeck) {
    for (let i = 0; i < list.length; i += BATCH_SIZE) batches.push([deck, list.slice(i, i + BATCH_SIZE)]);
  }

  for (let b = 0; b < batches.length; b++) {
    const [deck, batch] = batches[b];
    console.log(`\n[${b + 1}/${batches.length}] ${deck} — ${batch[0].term} … ${batch[batch.length - 1].term}`);
    try {
      let got = await translateBatch(deck, batch);

      // 예문이 표제어를 안 쓴 항목만 한 번 더. 그래도 실패하면 기록만 남기고 넘어간다
      // (통합 단계에서 걸러내고 사람이 본다 — 여기서 멈추면 배치 전체가 막힌다).
      const bad = got.filter(r => !exampleUsesTerm(r.term, r.exampleKo, r.usedForm));
      if (bad.length) {
        console.log(`  ↻ 예문에 표제어 없음 ${bad.length}개 재생성`);
        const retryBatch = batch.filter(e => bad.some(r => r.term === e.term));
        await sleep(2000);
        const redone = await translateBatch(deck, retryBatch);
        const fixed = new Map(redone.map(r => [r.term, r]));
        got = got.map(r => fixed.get(r.term) ?? r);
        const stillBad = got.filter(r => !exampleUsesTerm(r.term, r.exampleKo, r.usedForm));
        rejected += stillBad.length;
        if (stillBad.length) console.log(`  ⚠️ 재생성 후에도 ${stillBad.length}개: ${stillBad.map(r => r.term).join(' ')}`);
      }

      // 로마자는 표준 발음에서 규칙으로 결정되는 값이라 생성에 맡기지 않는다. 이 검사가
      // 없던 첫 판에서 신규 카드 1,686장 중 138건(8.2%)이 틀린 채 통합까지 갔다 — 비음화
      // (음료 eumryo)·유음화(분리 bunri)·연음(활용 hwalyong)을 어떤 낱말에서는 맞히고
      // 어떤 낱말에서는 놓치는 **무작위** 오류라, 재생성해도 나아지지 않는다. 그래서
      // 예문처럼 다시 부르지 않고 그 자리에서 규칙으로 고정한다(요청도 아끼게 된다).
      //
      // 🔴 변환기가 틀리고 AI 가 맞는 자리가 실제로 있다 — 구개음화 묻히다 muchida,
      //    ㄴ첨가 알약 allyak. 그래서 후보 **어디에도** 맞지 않을 때만 바꾼다. 새로
      //    발견하면 여기가 아니라 scripts/lib/romanize.ts 를 고치고 회귀 테스트를 남길 것.
      for (const r of got) {
        const c = checkRomaja(r.term, r.romaja);
        if (!c || c.ok) continue;
        r.romaja = c.expected[0];
        romajaFixed++;
      }

      results.push(...got);
      saveProgress(results);
      console.log(`  ✅ ${got.length}개 (누적 ${results.length})`);
    } catch (e: any) {
      console.error(`  ❌ 배치 실패: ${e.message}`);
      console.error(`진행 ${results.length}개 저장됨. 같은 명령으로 재실행하면 이어집니다.`);
      saveProgress(results);
      process.exit(1);
    }
    if (b + 1 < batches.length) await sleep(BATCH_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n🎉 ${OUTPUT_PATH} (${results.length}개)`);
  if (rejected) console.log(`⚠️ 예문 검사 미통과 ${rejected}개 — 통합 전에 확인 필요`);
  if (romajaFixed) console.log(`🔤 로마자 규칙 교정 ${romajaFixed}개 (변환기 후보와 어긋난 것)`);
  if (results.length >= all.length && fs.existsSync(PROGRESS_PATH)) {
    fs.unlinkSync(PROGRESS_PATH);
    console.log('진행 파일 정리됨');
  }
}

if (require.main === module) {
  main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
}
