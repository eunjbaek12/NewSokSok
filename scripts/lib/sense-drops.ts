/**
 * 카드에 실으면 안 되는 뜻 — 언어쌍·표제어별 뜻 번호.
 *
 * 무엇을 거르나: 뜻이 하나뿐인 낱말에도 모델이 두 번째 뜻을 만들어 낸다. 병기는 그 뜻을
 * **카드 앞면까지** 올리므로 학습자가 없는 말을 외운다 — 교사 = "낡은 것을 새것으로 고침",
 * 꾸다 = "잠을 자다", 잘되다 = "to fail"(정반대), banker = "바지선", 饼 = "성씨".
 *
 * ── 어떻게 골랐나 (2026-08-20) ────────────────────────────────────────────────
 * 뜻풀이와 그 뜻의 예문을 **짝으로** 주고 "예문 속 낱말이 정말 그 뜻으로 쓰였는가"를 묻는다.
 * 🔑 판정 단위는 문장이 아니라 **뜻풀이–예문 쌍**이다. 문장 자연스러움만 물으면 뜻 배정
 *    오류를 놓친다 — "이 담배 파이프는 오래된 것이다"는 자연스러운 한국어인데 그 문장의
 *    담배는 피우는 기구가 아니다.
 *
 * 🔴 **한 번 물어서는 안 된다. 같은 물음을 두 번 던지면 절반이 뒤집힌다.**
 *    temperature 0 인데도 배치 이웃만 바꿔 다시 돌리면 두 판정이 함께 지우자고 한 것은
 *    en 42% · zh 53% · ja 63% · vi 44% · ko 61% 뿐이었다. 손으로 읽어 확인한 결과:
 *      둘 다 drop → 8건 중 8건이 진짜 결함
 *      한쪽만 drop → 8건 중 3~4건
 *    그래서 이 표에는 **판정 둘이 함께 지우자고 한 것만** 담는다.
 *    (기준을 더 엄하게 바꿔 다시 묻는 방법은 앞서 시도해 70 → 72% 로 실패했다.
 *     정밀도를 올린 것은 질문을 바꾸는 게 아니라 **같은 질문을 두 번 던지는 것**이었다.)
 *
 * 🔑 한국어만 판정이 **셋**이다 — 2026-08-20 에 먼저 적용됐던 표(다른 프롬프트·다른 세션,
 *    커밋 a4d78cb)까지 한 표로 친다. 그래서 ko 는 **셋 중 둘**, 나머지 언어는 둘 중 둘이다.
 *    교집합만 고집하면 어제 잡았던 명백한 결함이 빠진다 — `잘되다` ② = "to fail"(정반대),
 *    `교사` ② = "낡은 것을 새것으로 고침". 둘 다 어제 표와 2차는 지우자고 했고 1차만
 *    놓쳤다. 판정 하나가 놓치는 것은 흔하다. **가진 판정을 버리지 말고 표를 세라.**
 *
 * 🔴 **덱이 가르치는 뜻은 지우지 않는다.** 판정의 15~22%가 덱 원본 뜻과 겹치는 뜻을
 *    지우라고 한다(bribe = "뇌물을 주다", 欠 = "부족하다", nước = "나라", 聞く = "듣다").
 *    지우면 카드가 엉뚱한 뜻으로 바뀌므로 그런 판정은 버렸다 — 총 125건.
 *    ⚠️ 뜻이 **전부** 지워지는 경우는 오히려 안전하다. composeWord 가 캐시를 통째로
 *       쓰지 않고 덱 뜻을 그대로 두기 때문이다.
 *
 * 정밀도(최종 표 기준, 언어당 8건씩 손으로 읽음): en 8/8 · zh 7/8 · ja 7/8 · vi 7/8.
 * 반대쪽(놓침)도 재 봤다 — 둘 다 "그대로 두라"고 한 zh 12건에서 결함은 0~1건이었다.
 *
 * ── 키에 출발어가 들어가는 이유 ──────────────────────────────────────────────
 * 🔴 도착어만으로는 **일본어와 중국어가 부딪힌다.** 等·米·日·朝 등 **48개 표제어**가
 *    두 언어에 함께 있고 둘 다 도착어가 ko 라 같은 칸을 쓴다. 캐시는 언어쌍별로 따로이므로
 *    한쪽 판정이 다른 쪽 카드에 적용되면 엉뚱한 뜻이 사라진다.
 *
 * ── 유형 넷 ─────────────────────────────────────────────────────────────────
 *   A 예문에 그 낱말이 그 뜻으로 없다 — 군사 → "군사력", vest → "waistcoat"
 *   B 순환 정의 — 답답하다 = "답답하게 느껴질 만큼 답답하다" (시딩 게이트로 옮겼다)
 *   C 그 언어에 없는 뜻 — 우려 = "낡은 물건을 모아두는 곳", 饼 = "성씨"
 *   D 뜻 배정 오류 — 담배 = "피울 때 쓰는 기구", nominal = "이름에 관한"
 * 🔑 **같은 유형 이름이 언어마다 다른 것을 가리킨다.** 중국어의 A 는 못 믿는다(표본 10건 중
 *    4~5건만 진짜) — 한자는 복합어 안에서도 그 뜻을 지니기 때문이다(下降의 下, 身旁의 旁).
 *    베트남어의 A 는 정반대로 대부분 맞다 — 음절이 정말 다른 낱말의 일부다.
 *
 * 🔴 **"프롬프트가 뜻을 여러 개 요구해서 생긴다"는 진단은 틀렸다.**
 *    supabase/functions/_shared/gemini-vertex.ts 는 정반대로 말한다 — "distinct, unrelated
 *    meanings", "If the word has a single meaning … return an empty senses array".
 *    원인은 요구가 잘못된 게 아니라 **금지가 안 지켜지는 것**이다. 그러므로
 *    **PROMPT_VERSION 을 올릴 이유가 없다** — 올리면 캐시 82,470행이 통째로 무효가 된다.
 */
import drops from './sense-drops.json';

type DropEntry = { drop: number[]; why: string[] };
const TABLE = drops as Record<string, DropEntry>;

const key = (sourceLang: string, targetLang: string, term: string) =>
  `${sourceLang}>${targetLang}|${term}`;

/** 이 카드에서 뺄 뜻 번호(1부터). 없으면 빈 배열. */
export function droppedSenses(sourceLang: string, targetLang: string, term: string): number[] {
  return TABLE[key(sourceLang, targetLang, term)]?.drop ?? [];
}

/** 판정 사유 — 사람이 목록을 되짚을 때 쓴다. */
export function dropReasons(sourceLang: string, targetLang: string, term: string): string[] {
  return TABLE[key(sourceLang, targetLang, term)]?.why ?? [];
}

export function dropCounts(): { terms: number; senses: number } {
  const values = Object.values(TABLE);
  return { terms: values.length, senses: values.reduce((n, v) => n + v.drop.length, 0) };
}

/** 출발어별 뜻 개수 — 표가 한 언어로 쏠렸는지 눈으로 확인할 때. */
export function dropCountsByLang(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(TABLE)) {
    const lang = k.slice(0, k.indexOf('>'));
    out[lang] = (out[lang] ?? 0) + v.drop.length;
  }
  return out;
}
