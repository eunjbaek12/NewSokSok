import { circularDefinition } from '../scripts/seed-cache';

// 뜻풀이가 표제어 자신을 써서 돌려 말하는 것을 잡는다. 규칙으로 잡을 수 있는 유일한
// 유형이라 시딩 게이트(defectOf)에 있다 — 나머지 세 유형은 판정 목록으로 다뤘다
// (scripts/lib/sense-drops.ts). 케이스는 전부 2026-08-20 캐시 실측이다.

describe('순환 정의 검출', () => {
  it('표제어로 표제어를 설명하면 잡는다', () => {
    expect(circularDefinition('뽑히다', '선택되어 뽑히다.')).toBeTruthy();
    expect(circularDefinition('답답하다', '답답하게 느껴질 만큼 답답하다.')).toBeTruthy();
    expect(circularDefinition('소식', '반가운 소식')).toBeTruthy();
    expect(circularDefinition('백화점', '상품을 백화점으로 모아 판매하는 대규모 소매점.')).toBeTruthy();
    expect(circularDefinition('매일', '매일')).toBeTruthy();
  });

  it('병기된 뜻 중 하나만 순환이어도 잡는다', () => {
    expect(circularDefinition('시도', '① 어떤 일을 이루거나 행하려고 시도함. ② 나라의 행정 구역 단위.')).toBeTruthy();
  });

  it('정상 뜻풀이는 통과한다', () => {
    expect(circularDefinition('산소', '생물체가 호흡하는 데 필요한 기체. 원소 기호는 O이다.')).toBeNull();
    expect(circularDefinition('며느리', '아들의 아내를 이르는 말.')).toBeNull();
  });

  it('🔴 합성어의 일부는 순환이 아니다 — 부분 문자열로 재면 정밀도가 58%로 떨어진다', () => {
    expect(circularDefinition('고양이', '고양이과에 속하는 포유동물.')).toBeNull();   // 분류학 접미사 -과
    expect(circularDefinition('잔디', '잔디밭을 이루는 잎이 무성한 여러해살이풀')).toBeNull();
    expect(circularDefinition('조기', '조기과에 속하는 바닷물고기')).toBeNull();
  });

  it("🔴 인용된 언급은 쓰인 것이 아니다", () => {
    expect(circularDefinition('살리', "동사 '살리다'의 어간.")).toBeNull();
    expect(circularDefinition('대개', "(주로 '대개는' 꼴로 쓰이어) 거의 전부.")).toBeNull();
  });

  it('🔴 뜻은 첫 문장에서 정해진다 — 뒷문장의 부연은 표제어를 다시 써도 된다', () => {
    expect(circularDefinition('도승지', '조선 시대 왕명을 출납하던 승정원의 최고 벼슬아치. 도승지는 승정원의 으뜸 벼슬이었다.')).toBeNull();
  });

  it('단음절 표제어는 보지 않는다 — 오탐이 너무 많다(물 ↔ 물질)', () => {
    expect(circularDefinition('물', '액체 상태의 물질.')).toBeNull();
  });

  it('빈 값에 터지지 않는다', () => {
    expect(circularDefinition('사과', undefined)).toBeNull();
    expect(circularDefinition('', '아무 말')).toBeNull();
  });
});
