// 한글 → 개정 로마자 변환기 회귀 테스트.
//
// 케이스는 전부 실제 사례다 — ko→en 큐레이션 덱 4개(의성어·Untranslatable·편의점·
// TOPIK I, 550단어)를 만들며 AI가 낸 로마자에서 사람이 눈으로 잡아낸 오류 40건과,
// 그 자리에 들어간 정답이다. 변환기의 목적은 완벽한 변환이 아니라 이런 오류를
// 자동으로 걸러 사람이 볼 후보를 좁히는 것이므로, 감지율과 거짓경보를 함께 본다.
import { checkRomaja, romanizeCandidates, normalizeRomaja } from '@/scripts/lib/romanize';

describe('romanize — 실제로 나왔던 오류를 잡는다', () => {
  // 글자가 빠지거나 오타난 것들. 가장 흔하고 가장 치명적이다.
  test.each([
    ['영상', 'yeongsan'],      // 받침 ㅇ 누락
    ['침실', 'chimil'],        // s 누락
    ['요금', 'yogeurm'],       // r 오타
    ['초대', 'chode'],         // 모음 오타
    ['하교하다', 'hagyoada'],   // h 누락
    ['신호등', 'sinhodung'],    // 으 → u 오류
    ['후다닥', 'hudachak'],     // 닥 → chak 오류
  ])('오타·누락: %s = %s 는 걸러진다', (hangul, bad) => {
    expect(checkRomaja(hangul, bad)?.ok).toBe(false);
  });

  // 된소리 표기 오류 — 개정 로마자는 된소리되기를 적지 않지만 ㄲ/ㅉ 자체는 적는다
  test.each([
    ['첫째', 'cheotjae'],       // ㅉ = jj
    ['둘째', 'duljae'],
    ['낚시', 'nakksi'],         // 된소리되기는 표기하지 않음 → naksi
    ['짤랑짤랑', 'jallang-jallang'], // ㅉ = jj
  ])('된소리: %s = %s 는 걸러진다', (hangul, bad) => {
    expect(checkRomaja(hangul, bad)?.ok).toBe(false);
  });

  // 음운 변화 미반영 — 눈으로는 가장 놓치기 쉬운 유형
  test.each([
    ['동물원', 'dongmulwon'],    // 연음 [동무뤈]
    ['관람하다', 'gwanramhada'],  // 유음화 [괄람]
    ['컵라면', 'keopramyeon'],    // 비음화 [컴나면]
    ['흐물흐물', 'heumeul-heumeul'], // 물 = mul
  ])('음운 변화: %s = %s 는 걸러진다', (hangul, bad) => {
    expect(checkRomaja(hangul, bad)?.ok).toBe(false);
  });
});

describe('romanize — 정답에 거짓경보를 내지 않는다', () => {
  test.each([
    ['영상', 'yeongsang'],
    ['침실', 'chimsil'],
    ['요금', 'yogeum'],
    ['초대', 'chodae'],
    ['첫째', 'cheotjjae'],
    ['낚시', 'naksi'],
    ['동물원', 'dongmurwon'],
    ['관람하다', 'gwallamhada'],
    ['컵라면', 'keomnamyeon'],
    ['박물관', 'bangmulgwan'],   // 비음화 [방물관]
    ['정류장', 'jeongnyujang'],  // [정뉴장]
    ['국적', 'gukjeok'],         // 된소리되기 [국쩍]는 표기하지 않는다
    ['여권', 'yeogwon'],
    ['눈치', 'nunchi'],
    ['좌회전', 'jwahoejeon'],
    ['반짝반짝', 'banjjak-banjjak'],  // 붙임표는 무시하고 비교한다
    ['첫눈', 'cheonnun'],
  ])('정답 통과: %s = %s', (hangul, good) => {
    expect(checkRomaja(hangul, good)?.ok).toBe(true);
  });

  // 격음화는 표기 관행이 갈려 둘 다 허용한다
  test('격음화는 반영·미반영 양쪽을 허용한다', () => {
    expect(checkRomaja('부탁하다', 'butakada')?.ok).toBe(true);
    expect(checkRomaja('부탁하다', 'butakhada')?.ok).toBe(true);
    expect(checkRomaja('습하다', 'seupada')?.ok).toBe(true);
    expect(checkRomaja('습하다', 'seuphada')?.ok).toBe(true);
  });

  // 자음이 셋 겹치는 자리는 표기가 갈려 양쪽 다 통과시킨다(거짓경보 방지)
  test('자음 3연속은 겹친 형태와 축약형을 모두 허용한다', () => {
    expect(checkRomaja('색깔', 'saekkkal')?.ok).toBe(true);
    expect(checkRomaja('색깔', 'saekkal')?.ok).toBe(true);
  });

  // ㄴ 첨가는 합성어 경계를 알아야 해서 등록어로만 처리한다. 등록을 빠뜨리면 정답이
  // 오류로 잡혀 사람이 맞는 값을 '고쳐' 버리게 되므로, 실제로 겪은 세 낱말을 고정한다.
  test('ㄴ 첨가 등록어는 첨가형을 정답으로 통과시킨다', () => {
    expect(checkRomaja('알약', 'allyak')?.ok).toBe(true);
    expect(checkRomaja('물약', 'mullyak')?.ok).toBe(true);
    expect(checkRomaja('입덕영상', 'ipdeongnyeongsang')?.ok).toBe(true);
  });

  // 첨가형을 '더하는' 것이라 미첨가 표기도 그대로 통과해야 한다(표기 관행이 갈린다)
  test('ㄴ 첨가 등록어는 미첨가 표기도 계속 허용한다', () => {
    expect(checkRomaja('알약', 'aryak')?.ok).toBe(true);
    expect(checkRomaja('입덕영상', 'ipdeogyeongsang')?.ok).toBe(true);
  });

  // 등록어라고 아무 값이나 통과시키면 검사기가 무력해진다
  test('ㄴ 첨가 등록어도 오타는 걸러낸다', () => {
    expect(checkRomaja('알약', 'alyak')?.ok).toBe(false);
    expect(checkRomaja('입덕영상', 'ipdeok-yeongsan')?.ok).toBe(false);
  });
});

describe('romanize — 기본 동작', () => {
  test('붙임표·공백·대소문자는 차이로 보지 않는다', () => {
    expect(normalizeRomaja('Banjjak-Banjjak ')).toBe('banjjakbanjjak');
  });

  test('한글이 아닌 글자가 섞이면 판정을 포기한다', () => {
    expect(checkRomaja('1+1 행사', 'won peullaseu won')).toBeNull();
    expect(romanizeCandidates('K-pop')).toEqual([]);
  });

  test('어절이 여럿이면 이어 붙인다', () => {
    expect(checkRomaja('택배 접수', 'taekbae jeopsu')?.ok).toBe(true);
  });
});
