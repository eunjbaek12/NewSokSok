/**
 * 카드에 실으면 안 되는 뜻 — 표제어별 뜻 번호.
 *
 * 왜 있나: 시딩 프롬프트가 "뜻을 여러 개 내라"고 요구하는 탓에, 뜻이 하나뿐인 낱말에도
 * 모델이 두 번째 뜻을 만들어 낸다. 병기는 그 뜻을 **카드 앞면까지** 올리므로 학습자가
 * 없는 말을 외우게 된다(교사 = "낡은 것을 새것으로 고침", 꾸다 = "잠을 자다",
 * 잘되다 = "to fail" — 정반대).
 *
 * 어떻게 골랐나 (2026-08-20, ko 출발 덱 전수 4,585개 뜻):
 * 뜻풀이와 그 뜻의 예문을 짝으로 주고 "예문 속 낱말이 정말 그 뜻으로 쓰였는가"를 물었다.
 * 문장 자연스러움만 물으면 **뜻 배정 오류를 놓친다** — "이 담배 파이프는 오래된 것이다"는
 * 자연스러운 한국어인데, 그 문장의 담배는 기구가 아니라 담뱃잎이다. 그래서 판정 단위는
 * 문장이 아니라 **뜻풀이–예문 쌍**이다.
 *
 * 정밀도: 무작위 40건을 손으로 읽어 28건이 진짜 결함, 12건이 경계 사례였다(70%).
 * 🔴 **같은 모델에 다시 물어 봐야 오르지 않는다** — 더 엄격한 기준으로 2차 판정을 돌려도
 *    70% → 72%, 오탐 12건 중 11건이 그대로 남았다. 판정끼리 독립이 아니다.
 * 🔑 그래도 적용하는 이유는 손익이 대칭이 아니어서다. 경계 사례를 빼면 부차적인 뜻 하나를
 *    잃지만(카드는 ①로 멀쩡하다), 남기면 없는 말을 가르친다. 놓침은 두 판정 모두 0이었다.
 *
 * 유형은 넷이고, 겹침 판정으로는 절반을 못 잡는다(그래서 이 목록이 필요하다):
 *   A 예문에 그 낱말이 단독으로 없다 — 군사 → "군사력", 조금 → "잠깐만"
 *   B 순환 정의 — 답답하다 = "답답하게 느껴질 만큼 답답하다"
 *   C 한국어에 없는 뜻 — 우려 = "낡은 물건을 모아두는 곳"
 *   D 뜻 배정 오류 — 담배 = "피울 때 쓰는 기구"
 * 🔑 B 는 규칙으로 잡힌다(뜻풀이에 표제어가 그대로 들어 있다). 시딩 게이트로 옮길 것.
 *
 * ⚠️ 판정이 있는 것은 **한국어 출발 덱뿐**이다. en·ja·zh·vi 출발 덱의 병기 카드
 *    3,268장은 아직 재지 않았다 — 없는 게 아니라 모르는 것이다.
 */
import drops from './ko-sense-drops.json';

type DropEntry = { drop: number[]; why: string[] };
const TABLE = drops as Record<string, DropEntry>;

/** 이 카드에서 뺄 뜻 번호(1부터). 없으면 빈 배열. */
export function droppedSenses(targetLang: string, term: string): number[] {
  return TABLE[`${targetLang}|${term}`]?.drop ?? [];
}

/** 판정 사유 — 사람이 목록을 되짚을 때 쓴다. */
export function dropReasons(targetLang: string, term: string): string[] {
  return TABLE[`${targetLang}|${term}`]?.why ?? [];
}

export function dropCounts(): { terms: number; senses: number } {
  const values = Object.values(TABLE);
  return { terms: values.length, senses: values.reduce((n, v) => n + v.drop.length, 0) };
}
