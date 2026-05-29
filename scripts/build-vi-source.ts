/**
 * 베트남어 기초(상위 빈도) 단어 소스 빌더.
 *
 * 출처(CC BY-SA 4.0):
 *   - hermitdave/FrequencyWords (OpenSubtitles, vi_50k.txt) — 빈도순 단어 목록
 *
 * JP/ZH와 달리 FreeDict 베트남어 사전이 없어 정의·품사는 빈 값으로 두고
 * Gemini가 translate 단계에서 채운다. 베트남어 정자법에 성조·발음이 포함되어
 * phonetic도 비워둔다(JP=후리가나/ZH=병음과 다른 점).
 *
 * 사전 준비:
 *   curl -L "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/vi/vi_50k.txt" -o scripts/data/vi-freq-50k.txt
 *
 * 실행: npx ts-node scripts/build-vi-source.ts
 * 출력: scripts/vi-source.json (상위 500개 콘텐츠 단어)
 */
import fs from 'fs';
import path from 'path';

// lib/stopwords.ts의 VI 집합을 인라인 복제 (ts-node ESM 해석 문제 회피).
// lib 쪽 갱신 시 같이 갱신할 것.
const VI_STOPWORDS = new Set<string>([
  'là', 'có', 'không', 'của', 'và', 'với', 'cho', 'về', 'để', 'từ', 'đến',
  'ở', 'tại', 'trong', 'ngoài', 'trên', 'dưới', 'sau', 'trước', 'giữa',
  'đã', 'đang', 'sẽ', 'rồi', 'được', 'bị', 'phải', 'cần',
  'mà', 'thì', 'nên', 'nếu', 'khi', 'vì', 'hoặc', 'hay', 'nhưng', 'tuy',
  'này', 'đó', 'kia', 'ấy', 'đây', 'đấy', 'nào', 'gì', 'sao', 'đâu', 'ai',
  'tôi', 'bạn', 'anh', 'chị', 'em', 'ông', 'bà', 'họ', 'chúng', 'mình', 'nó', 'ta',
  'cái', 'con', 'chiếc', 'người', 'một', 'hai', 'các', 'những', 'mọi', 'mỗi',
  'rất', 'quá', 'lắm', 'cũng', 'vẫn', 'chỉ', 'đều', 'thế', 'vậy', 'nhiều', 'ít',
  'nhé', 'ạ', 'à', 'ơi', 'nhỉ', 'thôi',
]);
const isStopword = (w: string) => VI_STOPWORDS.has(w.toLowerCase());

const FREQ_PATH = path.resolve(process.cwd(), 'scripts/data/vi-freq-50k.txt');
const OUTPUT = path.resolve(process.cwd(), 'scripts/vi-source.json');
const TARGET_COUNT = 500;

interface SourceEntry {
  rank: number;
  term: string;
  pos: string;       // Gemini가 채움
  definition: string; // Gemini가 채움 (English)
  category: string;
}

// 학습 가치가 낮은 항목 제거 규칙.
// - 베트남어 글자(diacritic 포함) 또는 라틴 소문자가 아닌 토큰: 숫자, 영어 차용어, 기호
// - 한 글자(베트남어 단음절은 의미 있음 — `học` 같은 콘텐츠 단어는 허용)
//   → 단음절도 허용하되, 매우 짧은 기능어는 stopword set이 거름
function isValidViTerm(term: string): boolean {
  if (!term) return false;
  if (term.length < 2 && !/^[a-zà-ỹĐđ]+$/i.test(term)) return false;
  // 베트남어 글자만 허용 (영문 a-z + 베트남어 diacritic + đ/Đ)
  if (!/^[a-zA-Zà-ỹĐđ]+$/.test(term)) return false;
  // 순수 라틴 알파벳 (영어 차용어 가능성) — 짧으면 제외
  if (/^[a-zA-Z]+$/.test(term) && term.length < 4) return false;
  return true;
}

function main() {
  if (!fs.existsSync(FREQ_PATH)) {
    console.error(`❌ 빈도 리스트 없음: ${FREQ_PATH}`);
    console.error('  curl -L "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/vi/vi_50k.txt" -o scripts/data/vi-freq-50k.txt');
    process.exit(1);
  }

  const lines = fs.readFileSync(FREQ_PATH, 'utf8').split('\n');
  console.log(`📖 빈도 리스트: ${lines.length}줄 로드`);

  const seen = new Set<string>();
  const entries: SourceEntry[] = [];
  let scanned = 0, droppedStop = 0, droppedInvalid = 0;

  for (const line of lines) {
    const [term, _freq] = line.trim().split(/\s+/);
    if (!term) continue;
    scanned++;
    const lower = term.toLowerCase();
    if (seen.has(lower)) continue;
    if (!isValidViTerm(lower)) { droppedInvalid++; continue; }
    if (isStopword(lower)) { droppedStop++; continue; }
    seen.add(lower);

    entries.push({
      rank: entries.length + 1,
      term: lower,
      pos: '',
      definition: '',
      category: 'Top frequency',
    });

    if (entries.length >= TARGET_COUNT) break;
  }

  console.log(`✅ ${entries.length}개 추출 (스캔 ${scanned}, stopword ${droppedStop}, invalid ${droppedInvalid})`);
  fs.writeFileSync(OUTPUT, JSON.stringify(entries, null, 2));
  console.log(`💾 ${OUTPUT}`);
  console.log(`샘플: ${entries.slice(0, 10).map(e => e.term).join(', ')}`);
}

main();
