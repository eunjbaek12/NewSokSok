/**
 * 단음절 표제어 캐시에서 **그 단어의 뜻이 아닌 sense** 를 걷어낸다.
 *
 * 왜 캐시를 고치는가: 덱 시딩만 손보면 같은 오답이 사용자 자동완성에는 그대로 나간다.
 * enrich_cache 는 공용이라 여기서 고쳐야 양쪽이 함께 낫는다.
 *
 * 배경: 단음절 한국어는 한자 동음이의어가 많아 모델이 뜻을 억지로 만들어낸다. 실측으로
 * 병기가 적용되는 단음절 118건 중 32건에 그 단어의 뜻이 아닌 것이 섞여 있었다
 * (급 = "혈액형", 비 = "blood", 이 = "잇몸", 말 = "동물의 울음소리").
 * 병기는 카드 앞면(meaningKr)까지 덮으므로 그대로 두면 학습자가 오답을 외운다.
 *
 * 삭제 뒤에는 남은 뜻으로 최상위 definition·meaningKr 을 다시 조립한다. 조립은 앱이
 * 쓰는 lib/senses.ts 를 그대로 부른다 — 복제하면 앱과 어긋나도 모른다.
 *
 * 실행:
 *   SUPABASE_URL=... SERVICE_ROLE_KEY=... npx -y tsx scripts/fix-mono-senses.ts --dry-run
 *   SUPABASE_URL=... SERVICE_ROLE_KEY=... npx -y tsx scripts/fix-mono-senses.ts
 */
import { createClient } from '@supabase/supabase-js';
import { composeSenseFill, normalizeSenses } from '../lib/senses';
import type { WordSense } from '../shared/contracts';

const DRY = process.argv.includes('--dry-run');
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL 과 SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type DropSpec = { drop: number[]; expect: Record<number, string>; why: string };

/**
 * 표제어 → 지울 sense 인덱스. 인덱스는 **판정 당시 캐시 기준**이라, 지우기 전에
 * meaningKr 이 기대와 같은지 대조한 뒤에만 지운다(EXPECT).
 *
 * 🔑 차수로 나눠 두는 이유: 같은 표제어가 두 번 판정될 수 있다(극 은 1차에서 "물건의
 *    가장 먼 부분"을, 2차에서 "연극의 한 막"을 지운다). 한 객체에 두 번 쓰면 뒤엣것이
 *    조용히 이기므로, 차수를 순서대로 돌리고 각 차수마다 캐시를 다시 읽는다.
 *    이미 적용된 차수는 인덱스가 밀려 EXPECT 대조에서 전부 건너뛰어진다 — 그게 정상이다.
 */
const DROP_1: Record<string, DropSpec> = {
  // ── 확신한 18건 ────────────────────────────────────────────────────────
  '갓': { drop: [0, 1], expect: { 0: 'A traditional Korean hat', 1: 'Just born' }, why: '덱은 인터넷 슬랭 god-tier 인데 조선시대 모자·갓난아이가 붙었다' },
  '공': { drop: [2], expect: { 2: 'circulation, spread' }, why: '널리 퍼뜨림은 공(公/共)이라 공(ball)과 무관' },
  '급': { drop: [2], expect: { 2: 'Blood type' }, why: 'A급의 급을 혈액형으로 오해했다' },
  '나': { drop: [1, 2], expect: { 1: 'young animal', 2: 'third (archaic)' }, why: '짐승의 새끼·셋째는 나(I)와 무관' },
  '낮': { drop: [1, 2], expect: { 1: 'time, occasion', 2: 'times, instances' }, why: '낮(daytime)의 뜻이 아니다' },
  '막': { drop: [1], expect: { 1: 'Block, prevent, stop' }, why: '막다이지 부사 막이 아니다' },
  '말': { drop: [1], expect: { 1: 'animal sound, cry' }, why: '말(馬)은 울음소리가 아니다' },
  '문': { drop: [1, 2], expect: { 1: 'clue, opportunity', 2: 'way of thinking' }, why: '문(door)의 뜻이 아니다' },
  '밥': { drop: [2], expect: { 2: 'A person who is fed' }, why: '부리는 사람은 밥의 뜻이 아니다' },
  '밤': { drop: [2], expect: { 2: 'climax/peak' }, why: '절정은 밤의 뜻이 아니다' },
  '병': { drop: [1], expect: { 1: 'Cause or principle' }, why: '원리는 병의 뜻이 아니다' },
  '비': { drop: [1], expect: { 1: 'blood' }, why: 'blood 는 피다' },
  '산': { drop: [1, 2], expect: { 1: 'field made by burning trees', 2: 'grade, level' }, why: '화전·등급은 산의 뜻이 아니다' },
  '안': { drop: [1, 2], expect: { 1: 'Barrier, obstruction', 2: 'Unit for counting houses' }, why: '안(not)과 무관' },
  '이': { drop: [2], expect: { 2: 'gum (part of mouth)' }, why: '이는 치아다. 잇몸이 아니다' },
  '형': { drop: [2], expect: { 2: 'Husband' }, why: '남편은 형의 뜻이 아니다' },
  '저': { drop: [2], expect: { 2: 'that (demonstrative' }, why: '[1] 과 같은 내용의 중복' },
  '극': { drop: [2], expect: { 2: 'The furthest part' }, why: '물건의 가장 먼 부분은 극의 일반적 뜻이 아니다' },
  // ── 재검토에서 오류로 확정한 14건 ──────────────────────────────────────
  '귀': { drop: [2], expect: { 2: 'Disposition/Character' }, why: '됨됨이·품성은 귀의 뜻이 아니다' },
  '기': { drop: [1, 2], expect: { 1: 'an event or experience', 2: 'innate disposition' }, why: '겪음·성질은 기(氣)의 뜻이 아니다' },
  '골': { drop: [2], expect: { 2: 'hole, gap' }, why: '구멍이나 틈은 골의 뜻이 아니다' },
  '목': { drop: [1, 2], expect: { 1: 'the first or foremost part', 2: 'goal or objective' }, why: '맨 앞·목표는 목(neck)의 뜻이 아니다' },
  '별': { drop: [2], expect: { 2: 'specialness' }, why: '특별함은 별(星)이 아니라 별(別)의 파생이다' },
  '선': { drop: [1, 2], expect: { 1: 'Grade, rank, class', 2: 'Sequence, series' }, why: '등급·일의 갈피는 선의 뜻이 아니다' },
  '숨': { drop: [1], expect: { 1: 'Secret/Hidden feeling' }, why: '숨은 감정은 숨다의 파생이지 명사 숨이 아니다' },
  '야': { drop: [2], expect: { 2: 'Night' }, why: '야(夜)는 한자 형태소지 단독 명사가 아니다' },
  '예': { drop: [2], expect: { 2: 'Example, illustration' }, why: '[1] 과 같은 내용의 중복' },
  '전': { drop: [0], expect: { 0: 'Counter for objects' }, why: '전(錢)은 화폐 단위지 물건 세는 단위가 아니다' },
  '정': { drop: [2], expect: { 2: 'Rule, law, system' }, why: '법·제도는 정(情)과 무관' },
  '빛': { drop: [1, 2], expect: { 1: 'light (understanding', 2: 'to shine' }, why: '견해·동사형은 빛의 뜻이 아니다' },
  '키': { drop: [1, 2], expect: { 1: 'unit of measurement', 2: 'value or importance' }, why: '단위·가치는 키의 뜻이 아니다' },
  '해': { drop: [2], expect: { 2: 'limit/scope' }, why: '한계·범위는 해의 뜻이 아니다' },
};

/**
 * 2차 (2026-08-19) — 새 한국어 사다리 4덱의 단음절 표제어 218개 중, 병기가 실제로
 * 붙는 112건을 전수로 읽고 고른 20건. 1차는 기존 덱 기준이라 새 표제어가 빠져 있었다.
 *
 * 판정 기준은 1차와 같다: **그 표제어의 뜻이 아닌 것만** 지운다. 진짜 동음이의어는
 * 남긴다(배 = 배·船·腹, 과 = 科·果·와/과 는 셋 다 맞아서 손대지 않았다).
 */
const DROP_2: Record<string, DropSpec> = {
  '강': { drop: [1, 2], expect: { 1: 'road, route', 2: 'plot, flow, course' }, why: '자동차·배가 다니는 길은 길이고, 줄거리·흐름도 강의 뜻이 아니다' },
  '곳': { drop: [1], expect: { 1: 'situation, case, circumstances' }, why: '일이 일어나는 상황·경우는 경우다' },
  '극': { drop: [1], expect: { 1: 'Act of a play' }, why: '연극의 한 막은 막이다. 극 자체가 연극이다' },
  '꼴': { drop: [1], expect: { 1: 'Grazing (of livestock)' }, why: '꼴은 마소에게 먹이는 풀 자체지 뜯어 먹는 행위가 아니다' },
  '날': { drop: [2], expect: { 2: 'wing' }, why: '새의 날개는 날개다' },
  '돌': { drop: [1], expect: { 1: 'day (as in, a full rotation of the earth)' }, why: '해·달이 한 바퀴 도는 시간이라는 설명이 틀렸고 [2] 와 겹친다' },
  '둘': { drop: [0], expect: { 0: 'The second (in order)' }, why: '둘은 two 다. 순서상 두 번째는 둘째이며, 덱 뜻이 two 인데 앞면 ① 이 The second 로 나간다' },
  '떡': { drop: [1], expect: { 1: 'Sudden occurrence (figurative)' }, why: '갑자기 닥쳐오는 것은 떡의 뜻이 아니다' },
  '발': { drop: [1], expect: { 1: 'origin, root, source' }, why: '근본이 되는 줄기·근원은 뿌리다' },
  '성': { drop: [2], expect: { 2: 'Love/Affection' }, why: '남녀 간의 사랑은 정(情)이다' },
  '술': { drop: [1], expect: { 1: 'Skill or talent (figurative)' }, why: '솜씨·재주의 술(術)은 형태소지 단독 명사 술이 아니다' },
  '약': { drop: [2], expect: { 2: 'Soft/weak' }, why: '무르다는 약(弱) 형태소이지 명사 약의 뜻이 아니다' },
  '열': { drop: [2], expect: { 2: 'Opening, gap, passage' }, why: '안팎으로 통하는 틈은 틈이다. 열다의 어간이지 명사가 아니다' },
  '잠': { drop: [1], expect: { 1: 'pause, dormancy' }, why: '잠시 멈춤의 잠(暫)은 형태소이지 명사 잠이 아니다' },
  '종': { drop: [1], expect: { 1: 'The act of ringing a bell' }, why: '종은 물건이지 타종하는 행위가 아니다' },
  '주': { drop: [1], expect: { 1: 'country, nation' }, why: '영토와 국민을 가진 실체는 국(國)이다. 주(州)는 state 다' },
  '차': { drop: [2], expect: { 2: 'counter for vehicles/people' }, why: '자동차·사람을 세는 단위는 대·명이다' },
  '층': { drop: [1], expect: { 1: 'pitch (of a sound)' }, why: '소리의 높낮이는 고저다' },
  '피': { drop: [1, 2], expect: { 1: 'basis/root', 2: 'sweat/bodily fluid' }, why: '바탕·땀은 피의 뜻이 아니다' },
  '후': { drop: [2], expect: { 2: 'consequence; result' }, why: '일의 결과로 생기는 영향은 결과다' },
};

const ROUNDS: { name: string; map: Record<string, DropSpec> }[] = [
  { name: '1차 (기존 덱 단음절 · 2026-08-19 적용 완료)', map: DROP_1 },
  { name: '2차 (사다리 4덱 단음절)', map: DROP_2 },
];

/** 이 문자가 섞이면 생성이 오염된 것이다. 실측: 정(情)의 뜻풀이에 벵골 문자가 들어 있었다. */
const FOREIGN_SCRIPT = /[ঀ-৿؀-ۿЀ-ӿ฀-๿]/;
// 🔴 지우기용은 g 를 붙인 별도 정규식이어야 한다. replace 는 비전역 정규식이면 첫
//    글자 하나만 지운다 — 실제로 정(情)의 "বিবে" 4자 중 1자만 지워져 3자가 남았고,
//    로그의 "청소 1" 은 "1건 처리"였지 "다 지웠다"가 아니었다. test 쪽에 g 를 붙이면
//    lastIndex 가 남아 호출마다 결과가 뒤집히므로 둘을 나눠 둔다.
const FOREIGN_SCRIPT_ALL = /[ঀ-৿؀-ۿЀ-ӿ฀-๿]/g;

/** 한 차수를 적용한다. 차수마다 캐시를 다시 읽어야 앞 차수의 결과 위에서 판정된다. */
async function runRound(name: string, DROP: Record<string, DropSpec>) {
  const terms = Object.keys(DROP);
  const { data, error } = await db.from('enrich_cache')
    .select('term,result').eq('source_lang', 'ko').eq('target_lang', 'en').in('term', terms);
  if (error) throw new Error(error.message);
  console.log(`대상 ${terms.length}개 · 캐시에서 찾음 ${data?.length ?? 0}개\n`);

  let fixed = 0, skipped = 0, oneLeft = 0, contaminated = 0;
  for (const row of data ?? []) {
    const spec = DROP[row.term];
    const senses: WordSense[] = Array.isArray(row.result?.senses) ? row.result.senses : [];
    if (!senses.length) { console.log(`⏭ ${row.term}: senses 없음`); skipped++; continue; }

    // 인덱스가 밀렸는지 확인 — 캐시가 재생성됐다면 엉뚱한 뜻을 지우게 된다.
    const mismatch = Object.entries(spec.expect).find(([i, frag]) =>
      !(senses[Number(i)]?.meaningKr ?? '').includes(frag));
    if (mismatch) {
      console.log(`⚠️ ${row.term}: [${mismatch[0]}] 이 "${mismatch[1]}" 이 아니다 → 건너뜀`);
      console.log(`   현재: ${senses.map((s, i) => `[${i}] ${s.meaningKr}`).join(' / ')}`);
      skipped++; continue;
    }

    const kept = senses.filter((_, i) => !spec.drop.includes(i));
    // 오염 문자 청소 — 지울 대상이 아니어도 남은 뜻에 섞여 있으면 여기서 잡는다.
    for (const s of kept) {
      if (FOREIGN_SCRIPT.test(s.definition ?? '')) {
        s.definition = (s.definition ?? '').replace(FOREIGN_SCRIPT_ALL, '').replace(/\s{2,}/g, ' ').trim();
        contaminated++;
      }
    }

    const base = {
      definition: '', meaningKr: '', exampleEn: '', exampleKr: '', pos: '', phonetic: '', mnemonic: '',
    };
    const next = { ...row.result };
    if (kept.length >= 2) {
      const fill = composeSenseFill(kept.map((_, i) => i), kept, base);
      next.senses = kept;
      next.definition = fill.definition;
      next.meaningKr = fill.meaningKr;
      next.exampleEn = fill.exampleEn;
      next.exampleKr = fill.exampleKr;
    } else {
      // 뜻이 하나만 남으면 병기가 성립하지 않는다. senses 를 지우고 그 뜻으로 평평하게 만든다.
      const only = kept[0];
      delete next.senses;
      next.definition = only?.definition ?? '';
      next.meaningKr = only?.meaningKr ?? '';
      if (only?.exampleEn) next.exampleEn = only.exampleEn;
      if (only?.exampleKr) next.exampleKr = only.exampleKr;
      oneLeft++;
    }
    // 정규화가 거부하는 형태로 남지 않는지 확인 (2개 미만이면 null 이 정상)
    if (kept.length >= 2 && !normalizeSenses(next.senses)) {
      console.log(`⚠️ ${row.term}: 남은 senses 가 정규화를 통과하지 못한다 → 건너뜀`);
      skipped++; continue;
    }

    console.log(`✔ ${row.term} (${senses.length}→${kept.length}) ${spec.why}`);
    console.log(`   뜻: ${next.meaningKr}`);
    if (!DRY) {
      const { error: upErr } = await db.from('enrich_cache')
        .update({ result: next, updated_at: new Date().toISOString() })
        .eq('source_lang', 'ko').eq('target_lang', 'en').eq('term', row.term);
      if (upErr) throw new Error(`${row.term} 저장 실패: ${upErr.message}`);
    }
    fixed++;
  }

  console.log(`\n${name} — 고침 ${fixed} · 건너뜀 ${skipped} · 뜻이 하나만 남은 것 ${oneLeft} · 오염 문자 청소 ${contaminated}`);
  return fixed;
}

async function main() {
  let total = 0;
  for (const r of ROUNDS) total += await runRound(r.name, r.map);
  console.log(`\n합계 고침 ${total}`);
  if (DRY) console.log('--dry-run 이라 저장하지 않았습니다.');
  else console.log('🔴 덱에 반영하려면 seed-official-decks 를 다시 돌려야 합니다.');
}

main().catch(e => { console.error(e); process.exit(1); });
