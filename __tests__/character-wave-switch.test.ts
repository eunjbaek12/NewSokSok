import { readFileSync } from 'node:fs';

/**
 * 🚩 손 흔들기는 «한 곳»에서 꺼야 한다.
 *
 * 1.6.3 이 호출부에 `wave={false}` 를 붙여 껐는데, `CharacterSvg` 의 `wave` 기본값이
 * `true` 라 **절반만 꺼졌다.** 붙인 곳은 셋(홈 시트 둘 · ShareCard)뿐이고, 정작 눈에
 * 제일 잘 띄는 자리가 전부 남았다 — 홈 인사말 · 단어장 탭 머리 · 단어 모음 탭 머리 ·
 * AI 생성 중 화면. 은정님 iPhone 1.6.3 실기에서 「손이 흔들리는데 이상하게 흔들린다」로
 * 드러났다(Android preview 에서는 정상으로 봤다 — iOS 첫 관측이다).
 *
 * 🔴 **끈 곳을 세면 다 껐다고 착각한다.** 기본값이 「켜짐」인 prop 은 grep 이
 *    `wave={false}` 만 찾아 주고 나머지는 조용히 남는다. 세어야 하는 것은 «안 끈 곳»이다.
 *    그래서 이 검사는 「`wave={false}` 가 몇 개인가」를 묻지 않는다 — 애초에 그 방식이
 *    틀렸기 때문이다. 스위치가 컴포넌트 안에 하나 있고, 애니메이션이 그 스위치를
 *    통과해야만 도는지를 본다.
 *
 * 컴포넌트를 import 하지 않고 소스를 읽는다 — 이 저장소의 테스트는 node 환경이라
 * react-native-svg·reanimated 를 들여올 수 없다(다른 소스 스캔 검사와 같은 방식).
 */

const CHARACTER = 'components/CharacterSvg.tsx';

/** 주석과 공백을 걷어낸다 — 서식 변경으로 검사가 깨지지 않게. */
function normalize(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX 주석
    .replace(/\/\*[\s\S]*?\*\//g, '')           // 블록 주석
    .replace(/\/\/[^\n]*/g, '')                 // 행 주석
    .replace(/\s+/g, '');
}

describe('🚩 손 흔들기 스위치', () => {
  const raw = readFileSync(CHARACTER, 'utf8');
  const src = normalize(raw);

  it('스위치가 컴포넌트 안에 하나 있다', () => {
    expect(src).toMatch(/exportconstWAVE_ENABLED=(true|false);/);
  });

  it('애니메이션은 그 스위치를 통과해야만 돈다', () => {
    // 이른 반환 조건에 스위치가 들어 있어야 한다. 없으면 호출부 prop 만으로 도는
    // 옛 구조로 돌아간 것이다.
    expect(src).toContain('if(!WAVE_ENABLED||!wave||');
  });

  /**
   * 이 테스트는 **켤 때 함께 걸리라고** 있는 것이다 — 완주 자랑하기의
   * `celebration-pick.test.ts` 「아직 닫혀 있다」와 같은 역할이다. 다시 켜는 날에는
   * 이 기대값을 뒤집으면서 **여덟 자리를 눈으로 확인**하라는 표식이다:
   * 홈 인사말 · 홈 빈 플랜 시트 · 홈 학습 결과 시트 · 단어장 탭 머리 ·
   * 단어 모음 탭 머리 · AI 생성 중 · 온보딩 데모 · 완주 카드.
   *
   * 🔴 특히 iOS 에서 봐야 한다. 「이상하게 흔들린다」가 나온 쪽이 iOS 이고,
   *    Android preview 는 같은 코드로 정상이었다.
   */
  it('지금은 꺼져 있다', () => {
    expect(src).toContain('exportconstWAVE_ENABLED=false;');
  });
});
