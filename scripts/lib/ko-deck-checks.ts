/**
 * ko→en 큐레이션 덱 공용 검수 규칙.
 *
 * 왜 공용인가: 덱을 만들 때마다 translate 스크립트를 복제해 온 탓에 검사 규칙이
 * 파일마다 흩어졌다. '당신' 금지는 topik1에만, 어근 중복 검사는 mimetic에만 있었고,
 * 정작 상황 덱 4개가 함께 쓰는 translate-situation-vocab.ts에는 아무것도 없었다.
 * 그래서 새 덱이 이전 덱에서 이미 잡은 실수를 그대로 되풀이했다. 규칙을 여기 모아두면
 * 새 스크립트가 import 한 줄로 전부 물려받는다.
 *
 * 규칙은 전부 실제로 겪은 사고에서 나왔다 — 어느 덱에서 무엇이 터졌는지는 각 검사의
 * 주석에 적어 두었으니, 규칙을 지우거나 완화하기 전에 그 사례부터 확인할 것.
 */
import { checkRomaja } from './romanize';

export interface DeckEntry {
  term: string;
  romaja?: string;
  meaningEn?: string;
  exampleKo?: string;
  exampleEn?: string;
}

export interface CheckOptions {
  /** 뜻(meaningEn) 길이 상한. 카드 뒷면을 넘기지 않게 한다. */
  meaningMax?: number;
  /** 예문 길이 상한. 초급 덱에서만 의미가 있다. */
  exampleMax?: number;
  /** 초급 덱: 중급 이상 문법이 예문에 섞였는지 본다. */
  beginnerGrammar?: boolean;
  /** 의성어·의태어 덱: 어근 중복과 -거리다 재부착을 본다. */
  mimeticEcho?: boolean;
  /** 로마자 검사를 건너뛴다(표제어가 한글이 아닌 덱 등). */
  skipRomaja?: boolean;
}

export interface Finding {
  kind: string;
  term: string;
  detail: string;
  /** true면 규칙이 확실하지 않아 사람이 판단해야 하는 항목 */
  advisory?: boolean;
}

// 초급 덱 예문에 나오면 안 되는 중급 이상 문법 (topik1에서 확인)
const BANNED_GRAMMAR = ['잖아', '더라고', '느라고', '더니', '바람에', '마련이', '을 텐데', '을걸'];

/**
 * ko→en 덱 프롬프트에 공통으로 끼워 넣는 규칙. 검사는 사후 방어일 뿐이라
 * 애초에 나오지 않게 하는 편이 낫다. 새 translate 스크립트를 쓸 때 프롬프트의
 * Rules 절에 ${SHARED_PROMPT_RULES} 로 삽입할 것.
 */
export const SHARED_PROMPT_RULES = `- NEVER write 당신 in a Korean sentence. Korean does not use a second-person pronoun the way English uses "you" — 당신 reads as translationese or, to a stranger, as hostile. Use the person's role (선생님, 사장님), their name + 씨, or simply drop the subject.
- The example MUST actually contain the headword (conjugated naturally for verbs and adjectives).
- Give each item its own example — do not reuse one sentence across several items in this batch.
- exampleEn is English: never leave Hangul in it. Romanize or translate the term instead.`;

export function collectFindings(items: DeckEntry[], opts: CheckOptions = {}): Finding[] {
  const out: Finding[] = [];
  const push = (kind: string, term: string, detail: string, advisory = false) =>
    out.push({ kind, term, detail, advisory });

  const exampleSeen = new Map<string, string[]>();

  for (const w of items) {
    const meaning = w.meaningEn ?? '';
    const ko = w.exampleKo ?? '';
    const en = w.exampleEn ?? '';

    if (!meaning || !ko || !en || (!opts.skipRomaja && !w.romaja)) {
      push('빈 슬롯', w.term, '뜻·로마자·예문 중 비어 있는 것이 있습니다');
      continue;
    }

    // 로마자 — 네 덱 550단어에서 40건이 틀렸고 전부 사람이 눈으로 잡았다.
    if (!opts.skipRomaja) {
      const r = checkRomaja(w.term, w.romaja!);
      if (r && !r.ok) push('로마자', w.term, `${w.romaja} → 기대: ${r.expected.join(' 또는 ')}`);
    }

    // '당신' — topik1 첫 생성에서 "당신의 직업은 무엇입니까?"가 나왔다. 한국어는
    // 2인칭 대명사를 이렇게 쓰지 않아 번역투이거나 무례하게 들리는데, 교재가 흔히
    // 저지르는 오류라 학습자에게 그대로 심긴다.
    // 표제어가 '당신' 자체인 카드는 예문에 쓸 수밖에 없다(기존 Intermediate 덱에 있다).
    if (w.term !== '당신' && ko.includes('당신')) push('당신', w.term, ko);

    // 영어 슬롯에 한글이 남은 것 (화병 덱에서 exampleEn에 '화병'이 그대로 남았다)
    if (/[가-힣]/.test(en)) push('영어 슬롯에 한글', w.term, en);

    // 뜻이 표제어를 그대로 되풀이하면 정의가 아니다 — 다만 파생형("pairs with
    // 알록달록하다")·동음이의 경고("짜다 also means to squeeze")·관용구 예시처럼
    // 표제어가 뜻 안에 나오는 게 오히려 학습 정보인 경우가 훨씬 많아 advisory로 둔다.
    if (meaning.includes(w.term)) push('뜻에 표제어 포함', w.term, meaning, true);

    if (opts.meaningMax && meaning.length > opts.meaningMax) {
      push('뜻 길이', w.term, `${meaning.length}자 (상한 ${opts.meaningMax}): ${meaning}`);
    }
    if (opts.exampleMax && ko.length > opts.exampleMax) {
      push('예문 길이', w.term, `${ko.length}자 (상한 ${opts.exampleMax}): ${ko}`);
    }

    // 예문에 표제어가 없으면 카드가 무의미하다. 용언은 활용으로 어간까지 바뀌므로
    // (맵다→매워요, 챙기다→챙겨) 첫 음절만 본다 — 느슨한 검사라 놓치는 건 있다.
    const probe = /다$/.test(w.term) && w.term.length >= 2 ? w.term.slice(0, 1) : w.term;
    if (!ko.includes(probe)) push('예문에 표제어 없음', w.term, ko, true);

    if (opts.beginnerGrammar) {
      const hit = BANNED_GRAMMAR.find(g => ko.includes(g));
      if (hit) push('중급 문법', w.term, `'${hit}' — ${ko}`);
    }

    // 의성어·의태어 전용. "번쩍번쩍 번쩍였어"처럼 같은 어근 동사를 뒤에 또 붙이거나,
    // 이미 반복된 형태에 -거리다를 재부착하는 오류("두리번두리번 거렸어").
    // 단 킥킥거리다·깔깔거리다는 사전 등재어라 정상이므로 advisory로 둔다.
    if (opts.mimeticEcho && w.term.length >= 2) {
      const idx = ko.indexOf(w.term);
      if (idx >= 0) {
        const rest = ko.slice(idx + w.term.length).trimStart();
        if (rest.startsWith(w.term.slice(0, 2)) || /^거[리려렸립]/.test(rest)) {
          push('어근 중복', w.term, ko, true);
        }
      }
    }

    if (!exampleSeen.has(ko)) exampleSeen.set(ko, []);
    exampleSeen.get(ko)!.push(w.term);
  }

  for (const [ko, terms] of exampleSeen) {
    if (terms.length > 1) push('예문 중복', terms.join(' / '), ko);
  }
  return out;
}

/** 검사 결과를 사람이 읽을 형태로 출력하고, 확실한 문제가 없으면 true를 돌려준다. */
export function reportFindings(findings: Finding[], total: number): boolean {
  if (!findings.length) {
    console.log(`\n✅ 자동 검사 ${total}개 전부 통과`);
    return true;
  }
  const byKind = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind)!.push(f);
  }
  for (const [kind, list] of byKind) {
    const advisory = list.every(f => f.advisory);
    console.log(`\n${advisory ? '📋' : '⚠️'} ${kind} ${list.length}건${advisory ? ' (확인 필요 — 오탐일 수 있음)' : ''}`);
    for (const f of list.slice(0, 25)) console.log(`   ${f.term}: ${f.detail}`);
    if (list.length > 25) console.log(`   … 외 ${list.length - 25}건`);
  }
  const hard = findings.filter(f => !f.advisory).length;
  console.log(`\n총 ${findings.length}건 (확실 ${hard} / 확인필요 ${findings.length - hard}) — 대상 ${total}개`);
  return hard === 0;
}
