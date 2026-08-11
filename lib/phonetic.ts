// 베트남어 IPA의 Chao 성조 막대(˥˦˧˨˩, U+02E5–U+02E9)는 모바일 폰트에서 한글
// ㅓ와 거의 똑같이 렌더링돼 사용자에게 깨진 표기("ㅓㅓ")로 보인다. 베트남어
// 철자가 성조를 diacritic으로 완전 표기하므로(ma/mà/má…) 발음 표기의 성조
// 막대는 정보 손실 없이 제거한다.
//
// 프롬프트도 '성조 기호 없이'를 지시하지만(PHONETIC_INSTRUCTION 4곳), 학술
// 자료의 베트남어 IPA가 대부분 성조 막대를 포함해 모델이 관성적으로 붙일 수
// 있고, 구버전 프롬프트로 생성된 저장 단어·서버 캐시 항목도 남아 있다 — 이
// 함수가 읽기/수신 경로의 최종 가드.
//
// ⚠️ 제거 범위는 성조 막대 5종만. 영어 IPA 강세 기호 ˈ(U+02C8)·ˌ(U+02CC)는
// 범위 밖이라 보존된다.
export function stripToneBars(phonetic: string): string {
  return phonetic.replace(/[˥-˩]/g, '').trim();
}

const KANA = /[぀-ヿ]/;      // 히라가나·가타카나 (장음 ー U+30FC 포함)
const HANGUL = /[가-힣]/;

// 일본어 후리가나는 도착어 문자로 전사되기 쉽다. 특히 표제어가 이미 가나뿐인
// 단어(ワイン·ここ·でも)에서 심한데, 이때 후리가나는 표제어와 같아지는 게 정답인데도
// 모델은 "답이 입력과 같을 리 없다"고 여겨 무언가로 바꾼다 — 도착어가 한국어면
// 한글 전사가 가장 손쉬운 변환이라 그리로 간다(실측 ja>ko 가나 전용 25개 중 12개, 48%.
// 같은 단어를 ja>en 으로 뽑으면 0개라 도착어가 원인인 게 갈린다).
//
// 표시만의 문제가 아니다. 일본어는 한자 음독을 TTS 가 못 정해 무음이 되는 걸 피하려고
// phonetic 을 우선 읽는데(constants/languages.ts), 그 자리에 "와인"이 들어가면 일본어
// 음성이 한글을 받는다. 프롬프트도 막지만(PHONETIC_INSTRUCTION 4곳) temperature 0.4 라
// 같은 단어가 실행마다 흔들려 — 여기가 읽기/수신 경로의 최종 가드.
//
// 살릴 수 있으면 살리고("ああ (아아)" → "ああ", "ござ いま す" → "ございます"),
// 가나가 안 남으면 버린다. 빈 값이면 TTS 가 표제어를 읽는데, 가나 전용 단어는
// 그게 곧 정답이라 손해가 없다.
export function cleanJapanesePhonetic(phonetic: string, term: string): string {
  // 괄호 병기 — "ああ (아아)", "タイトル (title)", "システム (しすてむ)"
  let out = phonetic.replace(/[（(][^）)]*[）)]/g, '');
  // 복수 읽기 병기는 첫 번째만 — "よい / いい"
  if (out.includes('/')) out = out.slice(0, out.indexOf('/'));
  // 표제어에 공백이 없으면 후리가나에도 없어야 한다 — "ござ いま す"
  out = /\s/.test(term) ? out.trim() : out.replace(/\s+/g, '');

  if (HANGUL.test(out)) return '';   // 한글이 섞인 것은 되살릴 방법이 없다
  if (!KANA.test(out)) return '';    // 가나가 하나도 없으면 후리가나가 아니다
  return out;
}

// 발음 표기 정리의 단일 진입점. 언어별 규칙이 늘어도 호출부는 그대로 두기 위해
// 여기서 갈라 쓴다.
export function cleanPhonetic(phonetic: string, sourceLang: string, term: string): string {
  const out = stripToneBars(phonetic);
  return sourceLang === 'ja' ? cleanJapanesePhonetic(out, term) : out;
}
