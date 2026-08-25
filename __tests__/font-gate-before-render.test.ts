import { readFileSync } from 'node:fs';

/**
 * 폰트가 준비되기 전에는 화면 트리를 그리지 않는다.
 *
 * RN Android 는 Text 의 폭을 그 시점의 Typeface 로 잰다. 앱은 오래도록 스플래시로
 * 가린 채 트리를 먼저 그려 왔고, 주석은 "가려져 보이지 않으니 무해하다"고 적고 있었다.
 * 보이지 않아도 **측정은 남는다** — 커스텀 폰트가 아직이면 시스템 폴백(Roboto·OneUI
 * Sans KR)으로 잰 폭이 상자에 굳고, 나중에 더 넓은 Pretendard 로 그리면 글자가 상자를
 * 넘는다. 띄어쓰기가 있으면 마지막 낱말이 보이지 않는 둘째 줄로 넘어가고, 없으면
 * 마지막 글자가 깎인다.
 *
 * 실측(Galaxy S22 · 1.6.0 릴리스 · 로그아웃 콜드 스타트):
 *   "Google로 로그인" → "Google로"  상자 327 / Pretendard 요구 335.7
 *   "A Voca Do"      → "A VOCA"    상자 272 = Roboto 199.7 + 자간 8칸 72
 *   레딧 제보 "Next" → "Nex"        요구 111.1 / 폴백 105.4 → t 의 31% 가 깎임
 *
 * 🔴 이 한 줄을 지워도 홈 화면은 멀쩡해 보인다. 홈은 인증 hydrate 를 기다렸다 그려져
 *    그때는 폰트가 준비돼 있기 때문이다. 즉시 그려지는 **로그인·온보딩만** 당하므로,
 *    평소 쓰는 경로로는 회귀를 못 본다. 그래서 이 검사가 필요하다.
 *
 * 🔴 다시 마운트하는 것으로는 못 고친다 — RN 의 텍스트 측정 캐시는 문자열과 스타일로만
 *    키를 잡아 잘못 잰 값을 프로세스가 끝날 때까지 다시 쓴다. 애초에 재지 않게 막는
 *    것이 유일한 해법이라, "조건을 빼고 다른 데서 고치자"는 대안이 없다.
 */

const LAYOUT = 'app/_layout.tsx';

/** 주석과 공백을 걷어낸다 — 서식 변경으로 검사가 깨지지 않게. */
function normalize(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX 주석
    .replace(/\/\*[\s\S]*?\*\//g, '')           // 블록 주석
    .replace(/\/\/[^\n]*/g, '')                 // 행 주석
    .replace(/\s+/g, '');
}

describe('폰트 로딩 전에는 화면을 그리지 않는다', () => {
  const raw = readFileSync(LAYOUT, 'utf8');
  const src = normalize(raw);

  it('AppStack 은 fontsLoaded 조건 뒤에서만 렌더된다', () => {
    // 렌더 자리는 정확히 하나여야 한다. 둘이면 하나가 조건 없이 새어 나간 것이다.
    const uses = src.match(/<AppStack\b/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(src).toContain('{fontsLoaded&&<AppStack');
  });

  it('fontsLoaded 는 useFonts 에서 온다', () => {
    // 조건은 있는데 값이 딴 데서 오면 검사가 빈 통을 지킨다.
    expect(src).toMatch(/const\[fontsLoaded[^\]]*\]=useFonts\(/);
  });

  it('스플래시는 폰트가 끝날 때까지 유지된다', () => {
    // 게이트만 있고 스플래시가 먼저 걷히면 빈 화면이 보인다.
    expect(src).toContain('!fontsLoaded');
  });
});
