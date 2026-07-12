// 언어별 불용어(stopwords) — 사진 추출 후 자동 제거 대상.
// 학습 가치가 낮은 기능어/조사/관사/대명사 등.

const EN = new Set<string>([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'until', 'while',
  'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
  'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
  'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
  'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them',
  'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'should',
  'could', 'can', 'may', 'might', 'must', 'shall', 'ought', 'need', 'dare',
  's', 't', 'd', 'll', 'm', 're', 've', 'y', 'don', 'shouldn', 'wasn', 'weren',
  'won', 'wouldn', 'isn', 'aren', 'hasn', 'haven', 'hadn', 'doesn', 'didn',
]);

const KO = new Set<string>([
  '이', '그', '저', '것', '수', '등', '및', '의', '를', '을', '가', '이가', '은',
  '는', '에', '에서', '으로', '로', '와', '과', '도', '만', '까지', '부터', '하다',
  '있다', '없다', '되다', '아니다', '이다', '같다', '그리고', '그러나', '하지만',
  '또는', '또한', '그래서', '따라서', '때문에', '만약', '만일', '아주', '매우',
  '너무', '정말', '아마', '혹시', '어떤', '어느', '무슨', '나', '너', '우리', '저희',
  '당신', '그들',
]);

const JA = new Set<string>([
  'の', 'は', 'を', 'に', 'が', 'と', 'で', 'も', 'や', 'から', 'まで', 'へ',
  'です', 'ます', 'だ', 'である', 'ある', 'いる', 'する', 'なる', 'こと', 'もの',
  'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'ここ', 'そこ', 'あそこ',
  'わたし', '私', 'あなた', '彼', '彼女', 'そして', 'しかし', 'でも', 'また',
  'たち', 'よう', 'ため', 'けど', 'ね', 'よ', 'か', 'な',
]);

const ZH = new Set<string>([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '没', '看', '好', '自己',
  '这', '那', '它', '他', '她', '我们', '你们', '他们', '吗', '呢', '吧', '啊',
  '把', '被', '让', '从', '对', '向', '为', '与', '及', '或', '但', '而',
]);

const VI = new Set<string>([
  'là', 'có', 'không', 'của', 'và', 'với', 'cho', 'về', 'để', 'từ', 'đến',
  'ở', 'tại', 'trong', 'ngoài', 'trên', 'dưới', 'sau', 'trước', 'giữa',
  'đã', 'đang', 'sẽ', 'rồi', 'được', 'bị', 'phải', 'cần',
  'mà', 'thì', 'nên', 'nếu', 'khi', 'vì', 'hoặc', 'hay', 'nhưng', 'tuy',
  'này', 'đó', 'kia', 'ấy', 'đây', 'đấy', 'nào', 'gì', 'sao', 'đâu', 'ai',
  'tôi', 'bạn', 'anh', 'chị', 'em', 'ông', 'bà', 'họ', 'chúng', 'mình', 'nó', 'ta',
  'chúng tôi', 'chúng ta', 'các bạn',
  'cái', 'con', 'chiếc', 'người', 'một', 'hai', 'các', 'những', 'mọi', 'mỗi',
  'rất', 'quá', 'lắm', 'cũng', 'vẫn', 'chỉ', 'đều', 'thế', 'vậy', 'nhiều', 'ít',
  'nhé', 'ạ', 'à', 'ơi', 'nhỉ', 'thôi',
]);

const ES = new Set<string>([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del',
  'de', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia',
  'hasta', 'desde', 'contra', 'durante', 'según', 'tras',
  'y', 'e', 'o', 'u', 'ni', 'pero', 'sino', 'aunque', 'porque', 'pues',
  'si', 'como', 'que', 'cuando', 'mientras',
  'yo', 'tú', 'él', 'ella', 'usted', 'nosotros', 'vosotros', 'ellos', 'ellas',
  'me', 'te', 'se', 'nos', 'os', 'le', 'les', 'mi', 'tu', 'su',
  'mío', 'tuyo', 'suyo', 'nuestro', 'vuestro',
  'ser', 'soy', 'eres', 'es', 'somos', 'sois', 'son', 'era', 'eras', 'éramos',
  'fui', 'fue', 'fueron', 'sea', 'sido', 'siendo',
  'estar', 'está', 'están', 'estoy', 'estás', 'estamos', 'estaba', 'estuvo',
  'haber', 'he', 'has', 'ha', 'hemos', 'han', 'había', 'hay',
  'muy', 'más', 'menos', 'también', 'tampoco', 'ya', 'aún', 'todavía',
  'no', 'sí', 'así', 'bien', 'mal', 'sólo', 'solo', 'casi', 'tan', 'tanto',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'esto', 'eso', 'aquello',
  'qué', 'quién', 'quiénes', 'cómo', 'dónde', 'cuándo', 'cuánto', 'cuál',
  'todo', 'todos', 'toda', 'todas', 'algo', 'alguien', 'alguno', 'algunos',
  'nada', 'nadie', 'ninguno', 'cada', 'otro', 'otra', 'otros', 'otras',
  'mismo', 'misma', 'mismos', 'mismas',
]);

const STOPWORDS_BY_LANG: Record<string, Set<string>> = { en: EN, ko: KO, ja: JA, zh: ZH, vi: VI, es: ES };

export function isStopword(word: string, lang: string): boolean {
  const set = STOPWORDS_BY_LANG[lang];
  if (!set) return false;
  return set.has(word.toLowerCase());
}

// ── 출발어 스크립트(문자 체계) 검사 ─────────────────────────────
// 사진 추출 모델이 프롬프트("Extract every Korean word...")를 무시하고 사진 속
// 다른 언어 텍스트까지 뽑는 실측 사례(ko 덱에 영어 단어 혼입)가 있어, 프롬프트에
// 기대지 않는 결정론적 필터를 둔다. Hermes의 \p{Script=...} 지원이 불확실해
// 명시적 유니코드 범위를 쓴다 (아래 isCJK와 같은 방식).
// ⚠️ supabase/functions/_shared/script-filter.ts에 동일 로직 복제본 존재 —
//    수정 시 반드시 함께 갱신 (__tests__/stopwords-script.test.ts 패리티 테스트가 검증).
const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const KANA_RE = /[぀-ヿ]/;
const HAN_RE = /[一-鿿]/;
const LATIN_RE = /[A-Za-zÀ-ɏḀ-ỿ]/; // 라틴 기본 + 확장(es 악센트·vi 성조 문자 포함)

// 단어가 출발어의 문자 체계로 적혀 있는지. 같은 라틴 문자끼리(en↔es↔vi)는
// 구분 불가 — 그 케이스는 enrich isReal 판정에 위임.
export function matchesSourceScript(term: string, sourceLang: string): boolean {
  switch (sourceLang) {
    case 'ko':
      return HANGUL_RE.test(term);
    case 'ja':
      return KANA_RE.test(term) || HAN_RE.test(term);
    case 'zh':
      return HAN_RE.test(term) && !KANA_RE.test(term) && !HANGUL_RE.test(term);
    case 'en':
    case 'es':
    case 'vi':
      return LATIN_RE.test(term) && !HANGUL_RE.test(term) && !KANA_RE.test(term) && !HAN_RE.test(term);
    default:
      return true; // 미지원 언어는 판정 불가 — 통과
  }
}

// 사진에서 추출한 raw 단어 배열 → 학습용 후보로 정제.
// - trim, lowercase 정규화
// - 길이 < 2 또는 숫자/기호만인 토큰 제거
// - 출발어 문자 체계가 아닌 토큰 제거 (ko 덱의 영어 혼입 등)
// - 해당 언어의 불용어 제거
// - 중복 제거 (lowercase 기준)
// 동작은 결정론적. 입력 순서를 보존.
export function filterExtractedWords(raw: string[], sourceLang: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!/\p{L}/u.test(trimmed)) continue;
    // CJK 한 글자(漢/がな/한글)는 의미 단위로 인정, 그 외(영문 등)는 2자 이상만
    const isCJK = /[぀-ヿ一-鿿가-힯]/.test(trimmed);
    if (!isCJK && trimmed.length < 2) continue;
    if (!matchesSourceScript(trimmed, sourceLang)) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    if (isStopword(key, sourceLang)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
