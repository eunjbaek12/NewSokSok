import type { WordSense } from '@shared/contracts';
import type { AutoFillResult } from './types';

// 동음이의어 인라인 뜻 제안(add-word 검색창 아래 칩)의 순수 로직.
// - AI 응답의 senses 배열을 UI가 신뢰할 수 있는 형태로 정규화
// - 뜻 선택('all' 포함) 시 폼 6개 필드에 들어갈 값 산출
// UI 상태(현재 선택·수동 편집 숨김)는 useAddWord가 들고, 여기는 값 계산만 한다.

// 칩으로 제안할 뜻 후보 상한. 프롬프트는 2~3개를 요구하지만 모델 폭주 방어용.
export const MAX_SENSES = 3;

// 'all' = 병기 카드(상위 필드 = ①② 병기 결과) 선택.
export type SensePick = number | 'all';

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

// 선택한 뜻으로 폼에 채울 값. 뜻별 필드가 비어 있으면 상위(병기) 결과로 보충해
// "칩을 눌렀더니 예문이 사라짐" 같은 퇴행을 막는다. 'all'은 병기 결과 그대로.
export function senseToFill(pick: SensePick, senses: WordSense[], base: AutoFillResult): SenseFill {
  if (pick === 'all' || !senses[pick]) {
    return {
      meaningKr: base.meaningKr || '',
      definition: base.definition || '',
      exampleEn: base.exampleEn || '',
      exampleKr: base.exampleKr || '',
      pos: base.pos || '',
      phonetic: base.phonetic || '',
    };
  }
  const s = senses[pick];
  return {
    meaningKr: s.meaningKr,
    definition: s.definition || base.definition || '',
    exampleEn: s.exampleEn || base.exampleEn || '',
    exampleKr: s.exampleKr || base.exampleKr || '',
    pos: s.pos || base.pos || '',
    phonetic: s.phonetic || base.phonetic || '',
  };
}

// 칩 레이블에 쓸 뜻 요약. 병기 방어(혹시 ①②가 섞여 오면 첫 항목만)+길이 제한.
export function senseChipLabel(sense: WordSense, maxLen = 28): string {
  let label = sense.meaningKr.trim();
  // ①② 병기가 잘못 섞인 경우 첫 뜻만 취한다.
  const circled = label.split(/[①②③④]/).map(p => p.trim()).filter(Boolean);
  if (circled.length > 1) label = circled[0];
  // 쉼표 나열이면 첫 두 개까지만.
  const parts = label.split(/[,;·]/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 2) label = parts.slice(0, 2).join(', ');
  if (label.length > maxLen) label = `${label.slice(0, maxLen - 1)}…`;
  return label;
}
