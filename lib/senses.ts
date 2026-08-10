import type { WordSense } from '@shared/contracts';
import type { AutoFillResult } from './types';

// 동음이의어 토글 칩(add-word 검색창 아래, 뜻마다 켜고 끄는 중복 선택)의 순수 로직.
// - AI 응답의 senses 배열 정규화
// - 선택된 뜻 집합 → 폼 6개 필드 조립(1개=단독 카드, 2개+=①② 병기, 예문 포함)
// - 저장 한도 검사(넘치면 토글 거부 → 칩 상태와 카드 내용이 항상 일치)
// UI 상태(선택 집합·수동 편집 숨김)는 useAddWord가 들고, 여기는 값 계산만 한다.

// 칩으로 제안할 뜻 후보 상한. 프롬프트는 2~3개를 요구하지만 모델 폭주 방어용.
export const MAX_SENSES = 3;

export const CIRCLED_NUMBERS = ['①', '②', '③', '④'] as const;

// WordSaveSchema(shared/contracts.ts)의 저장 상한과 반드시 동기.
// 병기 조립이 이 한도를 넘으면 저장 자체가 실패하므로 토글 단계에서 거부한다.
const SAVE_LIMITS = { meaningKr: 300, exampleEn: 300, exampleKr: 300, definition: 500, pos: 60 } as const;

// AI 응답의 senses를 검증·정규화한다. 뜻이 2개 이상일 때만 배열을 돌려주고,
// 그 외(없음·1개·비정상)는 null — null이면 UI는 칩 없이 기존 흐름 그대로.
export function normalizeSenses(senses: unknown): WordSense[] | null {
  if (!Array.isArray(senses)) return null;
  const valid = senses.filter(
    (s): s is WordSense =>
      !!s && typeof s === 'object' && typeof (s as WordSense).meaningKr === 'string'
      && (s as WordSense).meaningKr.trim().length > 0,
  );
  if (valid.length < 2) return null;
  return valid.slice(0, MAX_SENSES);
}

// senses[] 안에 이미 번호가 박혀 오는 경우가 실측 4% 있다(vi>es "lại" 의 senses[0].meaningKr
// 이 "① de nuevo"). 그대로 번호를 붙이면 "① ① de nuevo" 가 되므로 앞 번호를 벗긴다.
// 프롬프트는 "senses 안에는 번호를 넣지 말라"고 지시하지만 지켜지지 않는다.
function stripLeadingMark(value: string | undefined): string {
  return (value ?? '').replace(/^\s*[①②③④]\s*/, '').trim();
}

// AI 응답의 상위 병기 텍스트(meaningKr·definition)를 senses 배열에서 다시 만든다.
// 모델에게 같은 내용을 배열과 텍스트로 두 번 쓰게 하면 어긋난다 — v7 실측 220건 중
// 34건에서 텍스트가 배열보다 적었고 그렇게 빠진 뜻이 46개였다(반대 방향은 0건).
// 배열이 정본이므로 텍스트는 여기서 만든다. 서버(supabase/functions/_shared/gemini-vertex.ts
// 의 joinSenses)와 같은 규칙이니 한쪽을 고치면 반대쪽도 함께 고칠 것.
//
// composeSenseFill 과 규칙이 같다: 공백으로 잇고(NO_CONTROL), 빈 항목은 번호째 건너뛴다.
// ⚠️ senses[] 안에 이미 번호가 박혀 오는 경우가 실측 4% 있어 앞 번호를 벗긴다.
export function assembleTopText(
  senses: readonly WordSense[],
  key: 'meaningKr' | 'definition',
): string {
  return senses
    .map((s, i) => {
      const v = stripLeadingMark(s[key]);
      return v ? `${CIRCLED_NUMBERS[i]} ${v}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

export interface SenseFill {
  meaningKr: string;
  definition: string;
  exampleEn: string;
  exampleKr: string;
  pos: string;
  phonetic: string;
}

// 선택된 뜻 집합으로 폼에 채울 값을 조립한다. selected는 senses 인덱스(중복 없음 가정).
// - 1개: 그 뜻의 필드 그대로(번호 없음). 뜻별 필드가 비면 상위(병기) 결과로 보충.
// - 2개+: 뜻·예문·예문 번역·정의를 ①② 번호로 병기. 번호는 빈도순(인덱스 오름차순)으로
//   재부여 — ①+③만 골라도 카드엔 ①②. 품사는 전부 같으면 하나만, 다르면 ①② 병기
//   (동음이의어는 품사가 다른 경우가 흔하다 — watch: ① verb ② noun). 발음은 첫 선택 기준.
//   비어 있는 뜻별 필드는 그 필드 목록에서 번호째 생략(뜻 번호와의 대응 유지).
export function composeSenseFill(
  selected: readonly number[],
  senses: readonly WordSense[],
  base: AutoFillResult,
): SenseFill {
  const picks = [...selected]
    .sort((a, b) => a - b)
    .map(i => senses[i])
    .filter((s): s is WordSense => !!s);

  if (picks.length === 0) {
    // 방어 — 호출부는 최소 1개 선택을 보장한다.
    return {
      meaningKr: base.meaningKr || '',
      definition: base.definition || '',
      exampleEn: base.exampleEn || '',
      exampleKr: base.exampleKr || '',
      pos: base.pos || '',
      phonetic: base.phonetic || '',
    };
  }

  if (picks.length === 1) {
    // 뜻 하나만 고르면 번호를 붙이지 않는다 — senses 안에 번호가 딸려 온 경우
    // ("① de nuevo") 그대로 두면 홀로 남은 ①이 카드에 찍힌다.
    const s = picks[0];
    return {
      meaningKr: stripLeadingMark(s.meaningKr),
      definition: stripLeadingMark(s.definition) || base.definition || '',
      exampleEn: stripLeadingMark(s.exampleEn) || base.exampleEn || '',
      exampleKr: stripLeadingMark(s.exampleKr) || base.exampleKr || '',
      pos: stripLeadingMark(s.pos) || base.pos || '',
      phonetic: s.phonetic || base.phonetic || '',
    };
  }

  // NO_CONTROL 저장 규칙 때문에 줄바꿈은 못 쓴다 — 공백으로 잇는다.
  const numbered = (key: keyof WordSense): string =>
    picks
      .map((s, i) => {
        const v = stripLeadingMark(s[key]);
        return v ? `${CIRCLED_NUMBERS[i]} ${v}` : '';
      })
      .filter(Boolean)
      .join(' ');

  // 품사: 선택된 뜻들의 pos가 (대소문자 무시) 하나로 모이면 그 값, 갈리면 뜻과 같은
  // 번호로 병기. 병기 문자열은 pos 필터(lib/pos.ts)가 토큰 단위로 읽어 양쪽 다 매칭된다.
  const posValues = picks.map(s => stripLeadingMark(s.pos));
  const distinctPos = new Set(posValues.filter(Boolean).map(p => p.toLowerCase()));
  const pos = distinctPos.size > 1
    ? numbered('pos')
    : posValues.find(Boolean) || base.pos || '';

  return {
    meaningKr: numbered('meaningKr'),
    definition: numbered('definition'),
    exampleEn: numbered('exampleEn'),
    exampleKr: numbered('exampleKr'),
    pos,
    phonetic: picks[0].phonetic || base.phonetic || '',
  };
}

// 조립 결과가 저장 상한(WordSaveSchema)에 들어가는지. 넘치면 토글을 거부해
// "칩은 3개 선택인데 카드엔 2개만" 같은 상태-내용 불일치를 원천 차단한다.
export function fitsSaveLimits(fill: SenseFill): boolean {
  return (
    fill.meaningKr.length <= SAVE_LIMITS.meaningKr &&
    fill.exampleEn.length <= SAVE_LIMITS.exampleEn &&
    fill.exampleKr.length <= SAVE_LIMITS.exampleKr &&
    fill.definition.length <= SAVE_LIMITS.definition &&
    fill.pos.length <= SAVE_LIMITS.pos
  );
}

// 검색 직후 칩의 기본 선택 집합. 사진 스캔·AI 생성 경로가 전 뜻 병기로 저장하는 것과
// 맞춰 전체 선택으로 시작한다(경로별 불일치 해소 + 못 알아챈 사용자의 뜻 유실 방지).
// 전체 병기가 저장 한도를 넘으면 뒤 순위(저빈도) 뜻부터 제외하고, 최소 ①은 한도와
// 무관하게 유지 — 기존 [0] 초기값과 동일한 바닥이라 저장 실패 케이스가 늘지 않는다.
export function defaultSenseSelection(
  senses: readonly WordSense[],
  base: AutoFillResult,
): number[] {
  for (let n = senses.length; n >= 2; n--) {
    const candidate = senses.slice(0, n).map((_, i) => i);
    if (fitsSaveLimits(composeSenseFill(candidate, senses, base))) return candidate;
  }
  return [0];
}

// 예문 낭독(TTS) 직전에 병기 번호 기호를 제거한다 — 음성이 "일", "circled one"처럼
// 기호를 읽는 것을 방지. 표시는 기호 유지, 낭독만 문장으로.
export function stripSenseMarkers(text: string): string {
  return text.replace(/[①②③④⑤]/g, ' ').replace(/\s+/g, ' ').trim();
}

// 칩 레이블에 쓸 뜻 요약. 병기 방어(혹시 ①②가 섞여 오면 첫 항목만)+길이 제한.
export function senseChipLabel(sense: WordSense, maxLen = 22): string {
  let label = sense.meaningKr.trim();
  // ①② 병기가 잘못 섞인 경우 첫 뜻만 취한다.
  const circled = label.split(/[①②③④]/).map(p => p.trim()).filter(Boolean);
  if (circled.length > 1) label = circled[0];
  // 쉼표 나열이면 첫 항목만 — 칩은 짧을수록 좋다.
  const parts = label.split(/[,;·]/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) label = parts[0];
  if (label.length > maxLen) label = `${label.slice(0, maxLen - 1)}…`;
  return label;
}
