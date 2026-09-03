// 표제어 정제·결함 판정 — AI 보강이 돌기 **전에** 적용한다.
//
// 배경: 표제어가 깨진 채 보강이 돌면 한도가 먼저 나가고 되돌릴 수 없다. AI는 무엇을
// 넣어도 거부하지 않고 그럴듯한 답을 만들기 때문에(`appropriate : 적절한` → 뜻·품사·
// 예문 전부 정상, 표제어만 깨짐) 응답을 보고 판별하는 방법이 원리적으로 없다.
// enrich_cache 에 남은 실측 사고 4건:
//
//   6/10  걸렸습니다. / 환영!"이 / "자랑스러운   5건   사진 스캔(문장 조각)
//   7/6   appropriate : 적절한                13건   일괄 추가(콜론)
//   7/24  in the last + 시간                   1건   일괄 추가
//   8/26  lemon — 레몬                        83건   일괄 추가(em dash)
//
// 매번 **다른 구분자**였다. 파서의 구분자 목록을 늘리는 방식은 세 번 졌다.
//
// ⚠️ supabase/functions/_shared/headword-guard.ts 에 동일 복제본 존재 —
//    수정 시 함께 갱신 (__tests__/headword-guard.test.ts 패리티가 검증).
//
// 🔑 규칙은 전부 enrich_cache 84,102행 전수 실측으로 오탐을 확인하고 정했다.
//    **길이·토큰 수는 쓰지 않는다** — 24자 상한은 정상 표제어 69건
//    (`cognitive behavioral therapy (cbt)` 등), 3토큰 규칙은 220건
//    (`activities of daily living (adls)` 등)을 죽인다. 사진 스캔의
//    isLikelyPhrase(lib/stopwords.ts)를 이 경로에 붙이면 안 되는 이유다.

// ── 문자 체계 ────────────────────────────────────────────────────────
const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const KANA_RE = /[぀-ヿ]/;
const HAN_RE = /[一-鿿]/;
const LATIN_RE = /[A-Za-zÀ-ɏḀ-ỿ]/; // 라틴 기본 + 확장(es 악센트·vi 성조 문자 포함)

type Script = 'hangul' | 'kana' | 'han' | 'latin';

// 토큰이 담고 있는 문자 체계 집합. 숫자·기호만 있으면 빈 집합(판정에서 무시).
function scriptsOf(token: string): Set<Script> {
  const out = new Set<Script>();
  if (HANGUL_RE.test(token)) out.add('hangul');
  if (KANA_RE.test(token)) out.add('kana');
  if (HAN_RE.test(token)) out.add('han');
  if (LATIN_RE.test(token)) out.add('latin');
  return out;
}

// ── 정규화(벗기기) ───────────────────────────────────────────────────

// 목록 표지 접두. 번호 매긴 목록 붙여넣기는 가장 흔한 입력 형태 중 하나인데
// 파서가 전혀 자르지 못했다(`1. apple` 이 통째로 표제어가 됐다).
//
// ⚠️ 표지 뒤 **공백을 필수**로 둔다. `1.5kg` 의 소수점(뒤가 숫자)과 `-apple` 의
//    하이픈(단어 내부일 수 있다)을 지키기 위해서다.
const LIST_MARKER_RE = /^(?:\d{1,3}\s*[.)\]]|[-–—•*·▪◦‣]|#\d{1,3})\s+/;

// 감싼 따옴표. 아포스트로피(')는 **제외** — `'tis`·`dogs'` 처럼 의미의 일부다.
const LEADING_QUOTE_RE = /^["“”「『«»]+/;
const TRAILING_QUOTE_RE = /["“”」』«»]+$/;

// 단일 토큰 끝의 구두점. 두 단어 이상이면 문장이므로 건드리지 않는다
// (`How are you?`·`데워 드릴까요?`·`off with their heads!` 는 의미의 일부).
const TRAILING_PUNCT_RE = /[.,!?;:…。！？、]+$/;

/**
 * 사용자가 입력한 표제어에서 잡티를 벗긴다. 저장·조회 양쪽에서 쓴다.
 *
 * 구분선은 **공백이 없으면 잔재, 있으면 의미**다. 실측상 캐시에서 단일 토큰 +
 * 끝 구두점인 것은 `session?`·`날.`·`걸렸습니다.` 셋뿐이고 전부 오염이었다.
 *
 * 덤: `session?` → `session` 정규화는 기존 캐시를 히트시켜 Vertex 호출을 없애고,
 * 물음표 때문에 놓치던 동음이의 ①②③ 병기까지 되돌려준다.
 */
export function normalizeHeadword(raw: string): string {
  if (!raw) return '';
  let t = raw.trim();

  // 따옴표 → 목록 표지 순서. `"1. apple"` 처럼 겹쳐 있을 수 있다.
  t = t.replace(LEADING_QUOTE_RE, '').replace(TRAILING_QUOTE_RE, '').trim();
  t = t.replace(LIST_MARKER_RE, '').trim();

  // 연속 공백 정리(OCR·붙여넣기 잔재)
  t = t.replace(/\s+/g, ' ');

  if (t && !t.includes(' ')) {
    t = t.replace(TRAILING_PUNCT_RE, '');
  }
  return t.trim();
}

// ── 결함 판정(차단) ──────────────────────────────────────────────────

export type HeadwordDefect =
  | 'separator'    // 표제어와 뜻을 잇는 구분자가 남아 있다
  | 'script_mix'   // 서로 다른 문자 체계가 섞여 있다(표제어+뜻이 붙은 형태)
  | 'list_marker'; // 목록 표지가 벗겨지지 않았다(정규화를 안 거친 옛 앱 요청)

// 단어 내부에 절대 나타나지 않는 문자 — 위치와 무관하게 차단.
// 실측 84,102행 중 0건.
const HARD_SEPARATOR_RE = /[,—–|\t]/;

// 구분자로도 쓰이고 단어 안에도 쓰이는 문자 — **공백에 둘러싸일 때만** 차단.
// 🔴 이 구분이 없으면 정당한 표제어가 죽는다. 실측 실물:
//      ~匹 · ~杯 · ~際   (ja 접미사 표기 — `~` 는 일본어 학습 자료의 표준 표기)
//      shift+tab         (en)
//    그 밖에 km/h · C# · e-mail · self-esteem 도 같은 이유로 지켜야 한다.
const SOFT_SEPARATOR_RE = /\s[-:;=+/<>*&#@~^\\]+\s/;

const LATIN_SOURCE_LANGS = new Set(['en', 'es', 'vi']);

/**
 * 표제어의 결함을 판정한다. 결함이 없으면 null.
 *
 * 클라이언트는 normalizeHeadword 를 먼저 부르므로 'list_marker' 가 나오지 않는다.
 * 서버는 정규화 없이 이 함수만 부른다 — 옛 앱이 보낸 `1. apple` 을 조용히 고치면
 * 사용자가 저장한 표제어와 어긋나므로, 고치지 않고 막는다.
 */
export function headwordDefectOf(term: string, sourceLang: string): HeadwordDefect | null {
  const t = (term ?? '').trim();
  if (!t) return null;

  if (LIST_MARKER_RE.test(t)) return 'list_marker';
  if (HARD_SEPARATOR_RE.test(t)) return 'separator';
  if (SOFT_SEPARATOR_RE.test(t)) return 'separator';

  const lang = (sourceLang ?? '').toLowerCase();

  // G2: 라틴 문자권 출발어에 CJK 가 섞였다. 영어 표제어에 한글이 들어갈 정당한
  //     이유가 없다 — `encouragement:격려` 처럼 구분자가 **붙어 있어** soft 규칙이
  //     놓치는 형태를 여기서 잡는다.
  if (LATIN_SOURCE_LANGS.has(lang)) {
    if (HANGUL_RE.test(t) || KANA_RE.test(t) || HAN_RE.test(t)) return 'script_mix';
  }

  // G3: 공백으로 나뉜 토큰들이 서로 다른 문자 체계에 속한다(`사과 apple`).
  //     ⚠️ 토큰 **내부**의 혼재는 보지 않는다 — `反덤핑`(한자+한글 한 덩어리)·
  //        `食べる`(한자+가나)·`T셔츠` 는 정당하다.
  const tokens = t.split(' ').filter(Boolean);
  if (tokens.length >= 2) {
    let base: Set<Script> | null = null;
    for (const token of tokens) {
      const scripts = scriptsOf(token);
      if (scripts.size === 0) continue; // 숫자·기호만인 토큰은 판정에서 뺀다
      if (base === null) {
        base = scripts;
        continue;
      }
      // 겹치는 체계가 하나도 없으면 서로 다른 언어의 토큰이 붙은 것이다.
      let shared = false;
      for (const s of scripts) {
        if (base.has(s)) { shared = true; break; }
      }
      if (!shared) return 'script_mix';
    }
  }

  return null;
}

// 출발어가 기대하는 문자 체계. 관대하게 잡는다 — 이 판정은 막는 데 쓰지 않으므로
// 애매하면 통과시키는 쪽이 옳다(ko 의 한자어 표기, ja 의 한자 표제어).
const EXPECTED_SCRIPTS: Record<string, Script[]> = {
  en: ['latin'], es: ['latin'], vi: ['latin'],
  ko: ['hangul', 'han'],
  ja: ['kana', 'han'],
  zh: ['han'],
};

/**
 * 표제어가 **배우는 언어의 문자 체계와 하나도 겹치지 않는가.** 안내 문구를 가르는 데만 쓴다.
 *
 * 🔴 이것을 headwordDefectOf(게이트)로 올리지 말 것. 한국어 단어장의 `TV`·`DNA`,
 * 일본어의 로마자 입력처럼 **정당한 표제어가 있고**, 막으면 그것들이 함께 죽는다.
 * AI 가 모르면 404 로 돌아오고 한도는 환불되므로 시도 자체에는 손해가 없다.
 *
 * 🔴 2026-09-03 실측: 한국어 단어장에 `running` 을 넣으면 서버가 "한국어 단어가 아니다"
 * (isReal=false) 로 404 를 주고, 앱은 **"철자를 확인하세요"** 라고 안내했다. 원인은
 * 철자가 아니라 언어 설정이라 사용자는 확인할 방법이 없었다. 반대 방향(영어 단어장에
 * 한글)에는 이미 정확한 안내가 있었는데, 게이트가 그쪽만 검사해 이쪽은 비어 있었다.
 */
export function isForeignScriptFor(term: string, sourceLang: string): boolean {
  const expected = EXPECTED_SCRIPTS[(sourceLang ?? '').toLowerCase()];
  if (!expected) return false;               // 모르는 언어는 판단하지 않는다
  const scripts = scriptsOf((term ?? '').trim());
  if (scripts.size === 0) return false;      // 숫자·기호만 — 다른 안내가 맡는다
  return !expected.some(s => scripts.has(s));
}

/** 정규화 후에도 결함이 남는지 — 클라이언트 입력 경계용 한 번에 쓰는 헬퍼. */
export function inspectHeadword(raw: string, sourceLang: string): {
  term: string;
  defect: HeadwordDefect | null;
} {
  const term = normalizeHeadword(raw);
  return { term, defect: headwordDefectOf(term, sourceLang) };
}
