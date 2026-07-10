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
const SAVE_LIMITS = { meaningKr: 300, exampleEn: 300, exampleKr: 300, definition: 500 } as const;

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
//   재부여 — ①+③만 골라도 카드엔 ①②. 품사·발음은 첫 선택 기준(뜻마다 대체로 동일).
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
    const s = picks[0];
    return {
      meaningKr: s.meaningKr,
      definition: s.definition || base.definition || '',
      exampleEn: s.exampleEn || base.exampleEn || '',
      exampleKr: s.exampleKr || base.exampleKr || '',
      pos: s.pos || base.pos || '',
      phonetic: s.phonetic || base.phonetic || '',
    };
  }

  // NO_CONTROL 저장 규칙 때문에 줄바꿈은 못 쓴다 — 공백으로 잇는다.
  const numbered = (key: keyof WordSense): string =>
    picks
      .map((s, i) => {
        const v = (s[key] ?? '').trim();
        return v ? `${CIRCLED_NUMBERS[i]} ${v}` : '';
      })
      .filter(Boolean)
      .join(' ');

  return {
    meaningKr: numbered('meaningKr'),
    definition: numbered('definition'),
    exampleEn: numbered('exampleEn'),
    exampleKr: numbered('exampleKr'),
    pos: picks[0].pos || base.pos || '',
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
    fill.definition.length <= SAVE_LIMITS.definition
  );
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
