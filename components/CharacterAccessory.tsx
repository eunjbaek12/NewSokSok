import React from 'react';
import { G, Path, Ellipse, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { CharacterAccessory as AccessoryType } from '@/features/theme';

/**
 * 아보카도는 viewBox(0 0 250 250) 한가운데가 아니라 x=113.4에 서 있다
 * (머리 꼭짓점 `m113.4 37.7`, 두 눈 90.09·136.7의 중점 = 113.4).
 * 액세서리는 읽기 쉽게 125 기준으로 그려 두고 이 차이만큼 통째로 민다.
 * 보정이 없던 동안 모자·리본이 11.6단위(56dp에서 화면 2.6px) 오른쪽으로 튀어나와 있었다.
 */
const ACCESSORY_CENTER_OFFSET_X = 113.4 - 125;

/**
 * 캐릭터와 같은 250 viewBox를 쓰므로 `CharacterSvg`의 <Svg> 안에 마지막 자식으로 얹는다.
 * 별도 <Svg>를 절대배치로 겹치지 않는 이유: 그러려면 호출부마다 크기를 맞춘 View로
 * 감싸야 했고, 캐릭터를 그리는 8곳 중 5곳이 그 조립을 빠뜨려 액세서리가 홈에서만 보였다.
 */
export function CharacterAccessoryPaths({ accessory }: { accessory: AccessoryType }) {
  if (accessory === 'none') return null;

  return (
    <G transform={[{ translateX: ACCESSORY_CENTER_OFFSET_X }]}>
      {accessory === 'y2k-ribbon' && <Y2kRibbon />}
      {accessory === 'ocean-hat' && <OceanHat />}
      {accessory === 'autumn-leaf' && <AutumnLeaf />}
      {accessory === 'hangul-gat' && <HangulGat />}
      {accessory === 'halloween-cape' && <HalloweenCape />}
      {accessory === 'lab-goggles' && <LabGoggles />}
    </G>
  );
}

/**
 * 박쥐 망토 + 박쥐 목걸이 — 할로윈. 치수는 전부 실측에서 왔다.
 *
 * 🔴 **팔은 하나도 나오면 안 된다**(은정님). 팔은 몸통 밖으로 24 튀어나온 지느러미라
 *    (x33~56 · y116~176) 망토가 몸통보다 넓어야 하는데, 여유를 크게 주면 캐릭터가
 *    옷에 파묻힌다. 팔 끝이 가장 바깥인 지점이 x35 이므로 망토는 **x26 — 팔 끝에서 +9**.
 *    +29 로 그렸을 땐 «옷이 이상하게 크다», +3~5 면 «망토»가 아니라 «어깨걸이»가 됐다.
 *    가려졌는지는 눈이 아니라 팔 자리의 초록 픽셀로 판정했다(1683 → 0).
 *
 * 🔴 **상단은 몸통 경계에 «접해서» 시작한다**(y100 에서 x61). 그 안쪽에서 시작하면
 *    몸통이 망토 위로 삐져나와 «안에 받쳐 입은 것»으로 보인다.
 *    이 캐릭터에는 목이 없고 볼이 얼굴 옆 아래까지 내려와, «어깨 위»로 쓸 수 있는 자리는
 *    몸통 경계(x61)와 볼(x75~97) 사이 **폭 16 짜리 띠**뿐이다.
 *
 * 🔴 **어깨를 가로지르는 여밈 띠는 못 쓴다** — 그 높이(y104~110)가 바로 눈이다.
 *    목걸이가 아래에서 여밈 역할을 하고, 줄은 **망토 사이에서만** 보인다(망토 위로 길게
 *    지나가면 가로선이 그어져 «수염»처럼 보였다).
 */
function HalloweenCape() {
  return (
    <>
      {/*
        천으로 보이게 하는 것은 세 겹이다 — 단색 하나면 평면으로 읽힌다(은정님).
        ① 세로 그라디언트: 어깨는 빛을 받고 자락 끝으로 갈수록 어둡다. 캐릭터 본체가
           전부 그라디언트라 망토만 납작하면 더 눈에 띈다.
        ② 주름: 어깨에서 자락으로 흐르는 «골». 천은 골이 어둡게 보인다.
        ③ 안쪽 가장자리 그늘: 몸 위에 «얹힌» 두께를 만든다.
        자락 끝을 뒤집어 주황 안감을 «면»으로 보여주는 안도 그려 봤지만, 접힌 천이 아니라
        덧댄 띠로 보이고 56px 에서 주황이 과하게 튀어 접었다.

        🔴 **위 세 겹은 250px 에서만 보인다.** 실제로 쓰이는 56dp 에서 망토가 차지하는 것은
        475 픽셀이고 그 안에서 주름 한 줄은 1px 이라 사실상 사라진다 — «250px 에서 고치고
        56px 로 쓰고» 있었다. 작은 크기에서 살아남는 것은 **실루엣과 큰 대비**뿐이라
        ④ 아래 끝 스캘럽을 깊게 파고 ⑤ 주황 테두리를 2.6 → 4.4 로 키우고
        ⑥ 바깥 가장자리에 밝은 선을 얹었다. 그래야 56px 에서 «박쥐 날개»로 읽힌다.
      */}
      <Defs>
        <LinearGradient id="cape_g" x1="0" y1="100" x2="0" y2="212" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#4E3A73" offset="0" />
          <Stop stopColor="#3B2A57" offset="0.55" />
          <Stop stopColor="#281C3F" offset="1" />
        </LinearGradient>
      </Defs>
      <CapePanel />
      {/* 반대쪽 자락 — 중심 125 기준 좌우 대칭. 그라디언트는 세로라 x 반전과 무관하게 공유된다 */}
      <G transform={[{ translateX: 250 }, { scaleX: -1 }]}>
        <CapePanel />
      </G>

      {/* 목걸이 줄 */}
      <Path d="M93 138 Q125 156 157 138" stroke="#6B5A8C" strokeWidth={2.6} fill="none" />
      {/* 박쥐 펜던트 — y156 위에 머문다. 씨앗 한가운데(y165)를 가로지르면 씨앗이 반 잘려 보인다 */}
      <Path d="M120.2 147.4 L107.4 141 L110.6 148.2 L100.2 145.8 L105.8 153.8 L114.6 154.6 L120.2 153 Z" fill="#2E2140" />
      <Path d="M129.8 147.4 L142.6 141 L139.4 148.2 L149.8 145.8 L144.2 153.8 L135.4 154.6 L129.8 153 Z" fill="#2E2140" />
      <Path d="M122.2 137.8 L123.8 143.8 L120.6 143 Z" fill="#2E2140" />
      <Path d="M127.8 137.8 L126.2 143.8 L129.4 143 Z" fill="#2E2140" />
      <Path d="M125 144.2 C121.8 144.2 120.2 147.4 120.2 151.4 C120.2 155.4 122.6 158.6 125 160.2 C127.4 158.6 129.8 155.4 129.8 151.4 C129.8 147.4 128.2 144.2 125 144.2 Z" fill="#2E2140" />
      <Circle cx={123.24} cy={148.2} r={1.2} fill="#E8873A" />
      <Circle cx={126.76} cy={148.2} r={1.2} fill="#E8873A" />
    </>
  );
}

/** 망토 자락 하나. 아래 끝은 위로 오목한 호 셋 — 주황 테두리가 박쥐 날개로 읽힌다. */
function CapePanel() {
  return (
    <>
      <Path
        d="M61 100 C52 104 42 112 38 128 C31 144 27 160 26 176 C24 190 22 199 20 208 Q36 191 50 214 Q66 190 80 216 Q88 199 93 212 C96 172 92 132 78 112 C73 106 67 101 61 100 Z"
        fill="url(#cape_g)"
      />
      {/* 주름 — 어깨에서 자락으로 흐르는 골 */}
      <Path d="M56 112 C48 140 42 172 38 202" stroke="#241938" strokeWidth={2.4} fill="none" opacity={0.55} strokeLinecap="round" />
      <Path d="M72 110 C70 142 72 174 74 206" stroke="#241938" strokeWidth={2.4} fill="none" opacity={0.55} strokeLinecap="round" />
      {/* 안쪽 가장자리 그늘 — 몸 위에 얹힌 두께 */}
      <Path d="M78 112 C92 132 94 172 91 210" stroke="#1E1531" strokeWidth={3.4} fill="none" opacity={0.5} />
      {/* 바깥 가장자리 밝은 선 — 선은 «면적»이 아니라 «길이»로 보이므로 1px 에서도 먹는다 */}
      <Path
        d="M61 100 C52 104 42 112 38 128 C31 144 27 160 26 176 C24 190 22 199 20 208"
        stroke="#7A5FA8" strokeWidth={2.6} fill="none" strokeLinecap="round"
      />
      <Path
        d="M26 176 C24 190 22 199 20 208 Q36 191 50 214 Q66 190 80 216 Q88 199 93 212"
        stroke="#E8873A" strokeWidth={4.4} fill="none" strokeLinejoin="round"
      />
    </>
  );
}

function AutumnLeaf() {
  // 단풍잎 한 장이 머리 위에 내려앉았다. 모자처럼 머리를 덮지 않고 살짝 얹혀
  // 기울어 있어야 "떨어진 잎"으로 읽힌다 — 반듯하면 장식으로 보인다.
  return (
    <G transform={[{ translateX: 118 }, { translateY: 24 }, { rotate: '-16' }]}>
      {/* 잎자루 */}
      <Path d="M2 30 C0 42, -2 50, -5 56" stroke="#7E4A2A" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* 잎몸 — 다섯 갈래 단풍 */}
      <Path
        d="M2 30 L-10 22 L-4 20 L-22 8 L-12 8 L-20 -6 L-6 -2 L-4 -16 L2 -6 L8 -16 L10 -2 L24 -6 L16 8 L26 8 L8 20 L14 22 Z"
        fill="#B14A2C"
      />
      {/* 잎맥 — 잎이 평평해 보이지 않게 */}
      <Path d="M2 28 L2 -4 M2 14 L-12 6 M2 14 L16 6 M2 4 L-6 -6 M2 4 L10 -6"
        stroke="#8A3820" strokeWidth={1.4} fill="none" opacity={0.55} strokeLinecap="round" />
    </G>
  );
}

/**
 * 갓의 치수 — 유물 실측에서 왔다.
 *
 * | 유물 | 높이 | 최대지름 | 높이/지름 |
 * |---|---|---|---|
 * | 서울역사박물관 흑립 | 11.0cm | 29.7cm | 0.370 |
 * | 국립익산박물관 흑립 | 13.0cm | 29.0cm | 0.448 |
 * | 국립대구박물관 흑립 | 14.0cm | 30.0cm | 0.467 |
 * | 국악사전 수록 흑립  | 15.6cm | 32.8cm | 0.476 |
 *
 * 🔴 **하나의 정답이 아니라 범위다.** 「조선조 선비들의 취향에 따라 대우가 높아지기도
 *    낮아지기도 했다」— 넷 사이가 29% 벌어져 있다. 한때 이 중 «0.476» 하나를 집어
 *    「고증은 1:2.1」이라고 적었는데, 그건 넷 중 극단값이었다.
 *
 * 🔑 **갓의 모양을 정하는 것은 독립된 비율 «둘»이다.**
 *
 *      A = 대우 높이 / 대우 지름   원기둥이 얼마나 높은가   실제 갓 ≈ 1.00
 *      B = 양태 지름 / 대우 지름   챙이 얼마나 넓은가       실제 갓 ≈ 2.27
 *
 *    유물에서 잴 수 있는 것은 **A/B(둘의 몫)뿐**이다. 그 몫만 맞추려 들면 B 를 깎아서도
 *    맞출 수 있는데, **B 가 갓의 정체다** — B 를 2.33 → 1.87 로 깎았더니 서양
 *    실크해트가 됐다. 두 번 그렇게 만들고 두 번 다 은정님이 「중절모 같다」고 잡아냈다.
 *    ⚠️ **A/B 하나만 보고 치수를 바꾸지 말 것.** A 와 B 를 따로 적어 두는 이유다.
 *
 * 지금 값: A 0.90 · B 2.52 · A/B 0.355.
 * A/B 가 유물 범위(0.370~0.476)를 4% 밑돌지만, 범위 자체가 29% 벌어져 있어 그 끝자락이다.
 * **틀리는 방향이 안전한 쪽**을 골랐다 — 챙이 실제보다 넓은 쪽으로 틀린다. 넓은 챙은
 * 갓을 더 갓처럼 보이게 하지 덜 그렇게 만들지 않는다.
 *
 * 🔴 **A 가 1.00 에 못 닿는 것은 캐릭터 형태의 한계다.** 아보카도 머리가 목 없이 아래로
 *    벌어지는 원뿔이라, 대우가 그 폭을 덮으려면 늘 높이보다 넓어진다. 챙을 y110 까지
 *    내려도 1.00 에 못 닿는데 그건 이미 입 높이다. 고를 수 있는 값이 아니다.
 *
 * 🔑 **대우 밑은 «챙 윗머리에서의 몸통 폭»과 같아야 한다.** 챙이 y44 에 있던 판은 거기
 *    몸통이 50 뿐인데 대우가 56 이라, 머리보다 넓은 상자가 좁아지는 끝에 얹힌 꼴이었다 —
 *    «쓴 것»이 아니라 «올려놓은 것»으로 보였다.
 *    (몸통 폭 실측, 1 unit 간격: y44=50 · y52=72 · y56=80 · y60=88 · y68=98 · y76=108)
 */
const GAT = {
  brimY: 68,    // 양태가 놓이는 줄. 아래끝 y83.3 — 눈(y93.7)까지 10.4 여유
  topY: 2,      // 대우 꼭대기 — 잎(y9~37, 중심에서 최대 33.6)을 덮으려면 여기까지
  baseHW: 37,   // 대우 밑 반폭 = 챙 윗머리(y52.7)의 몸통 반폭
  topHW: 39.5,  // 대우 위 반폭 — 18세기 후반부터 «대우 밑 둘레가 줄어» 위가 넓다
  brimR: 93,    // 양태 반지름
  per: 0.165,   // 원근 — 타원의 ry/rx
};
const GAT_BRIM_RY = GAT.brimR * GAT.per;                 // 15.3
const GAT_BASE_RY = GAT.baseHW * GAT.per;                // 6.6
const GAT_TOP_RY = GAT.topHW * GAT.per * 1.3;            // 9.2 — 내려다보므로 조금 더 열린다
const GAT_TOP_Y = GAT.topY + GAT_TOP_RY;                 // 11.2
const K = 1.33;                                          // 반타원을 3차 곡선으로 근사

const f1 = (n: number) => n.toFixed(1);

/**
 * 대우(총모자). 🔴 밑을 직선으로 끊으면 원기둥이 아니라 사다리꼴 판이 된다 —
 * 원기둥의 밑면은 화면에서 **아래로 볼록한 타원 호**다.
 */
const GAT_CROWN =
  `M${125 - GAT.baseHW} ${GAT.brimY}` +
  `L${125 - GAT.topHW} ${f1(GAT_TOP_Y)}` +
  `C${125 - GAT.topHW} ${f1(GAT_TOP_Y - GAT_TOP_RY * K)},` +
  ` ${125 + GAT.topHW} ${f1(GAT_TOP_Y - GAT_TOP_RY * K)},` +
  ` ${125 + GAT.topHW} ${f1(GAT_TOP_Y)}` +
  `L${125 + GAT.baseHW} ${GAT.brimY}` +
  `C${125 + GAT.baseHW} ${f1(GAT.brimY + GAT_BASE_RY * K)},` +
  ` ${125 - GAT.baseHW} ${f1(GAT.brimY + GAT_BASE_RY * K)},` +
  ` ${125 - GAT.baseHW} ${GAT.brimY}Z`;

/** 양태의 죽사 짜임 — 방사형 살. 타원 위의 점을 각도로 구하므로 clip 이 필요 없다. */
const GAT_SPOKES = Array.from({ length: 44 }, (_, i) => {
  const a = (Math.PI * 2 * i) / 44;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return `M${f1(125 + GAT.baseHW * c)} ${f1(GAT.brimY + GAT_BASE_RY * s)}` +
         `L${f1(125 + GAT.brimR * c)} ${f1(GAT.brimY + GAT_BRIM_RY * s)}`;
}).join('');

/** 대우의 말총 결 — 세로. 위가 벌어지므로 살도 벌어진다. */
const GAT_MANE = Array.from({ length: 13 }, (_, i) => {
  const t = (i / 12) * 2 - 1;
  const yb = GAT.brimY + GAT_BASE_RY * Math.sqrt(Math.max(0, 1 - t * t)) * 0.9;
  return `M${f1(125 + t * GAT.topHW * 0.97)} ${f1(GAT_TOP_Y)}` +
         `L${f1(125 + t * GAT.baseHW * 0.97)} ${f1(yb)}`;
}).join('');

/** 양태의 동심원 — 죽사를 둘러 짠 자국 */
const GAT_RINGS = [1, 2, 3].map(k => GAT.baseHW + ((GAT.brimR - GAT.baseHW) * k) / 4);

/**
 * 갓끈 — 견영(絹纓, 비단). 한 줄이 양쪽 양태에 매여 턱 밑으로 처진다.
 * 🔑 좌우에서 따로 늘어지는 두 가닥이 아니다. 두 가닥으로 그렸을 때 «더듬이»로 읽혔던
 *    진짜 이유가 길이가 아니라 이 구조였다.
 * 붙는 자리는 양태 폭을 따라간다 — 챙이 바뀌면 시작점도 따라와야 한다.
 * 가장 낮은 점 y162 — 씨앗(y129~201)의 윗부분을 스친다. 한가운데(165)를 지나면
 * 둥근 씨앗이 선으로 반 잘려 보인다.
 */
const GAT_CORD = (() => {
  const x = 125 - GAT.brimR * 0.72;
  const X = 125 + GAT.brimR * 0.72;
  const t = GAT.brimY + 2;
  return `M${f1(x)} ${t} C${f1(x - 4)} ${t + 50}, 74 148, 125 162` +
         ` C176 148, ${f1(X + 4)} ${t + 50}, ${f1(X)} ${t}`;
})();

const GAT_LACQUER = '#23232B';   // 옻칠 흑
const GAT_CROWN_TOP = '#30303A'; // 모정 — 빛을 받는 면
const GAT_WEAVE = '#5A5A66';     // 짜임 결

function HangulGat() {
  // 갓(흑립) — 조선 시대 성인 남자의 평상 관모. 대우는 말총, 양태는 죽사, 옻칠해 검다.
  //
  // 🔴 **그리는 순서가 곧 앞뒤 관계다.** 대우가 양태 «위에» 서 있으므로
  //    양태를 먼저 깔고 그 위에 대우를 얹어야 챙의 먼 쪽이 대우 뒤로 들어간다.
  //    반대로 그렸더니 챙의 먼 쪽 테두리가 대우를 가로질러, 원반에 상자를 꽂은 꼴이었다.
  return (
    <>
      {/* 그림자 */}
      <Ellipse cx={125} cy={GAT.brimY + 4} rx={GAT.brimR} ry={GAT_BRIM_RY} fill="#1A1A1E" opacity={0.22} />

      {/* ① 양태(챙) — 먼저 깐다 */}
      <Ellipse cx={125} cy={GAT.brimY} rx={GAT.brimR} ry={GAT_BRIM_RY} fill={GAT_LACQUER} />
      <Path d={GAT_SPOKES} stroke={GAT_WEAVE} strokeWidth={0.8} opacity={0.26} fill="none" />
      {GAT_RINGS.map(r => (
        <Ellipse key={r} cx={125} cy={GAT.brimY} rx={r} ry={r * GAT.per}
          fill="none" stroke={GAT_WEAVE} strokeWidth={0.9} opacity={0.3} />
      ))}
      <Ellipse cx={125} cy={GAT.brimY} rx={GAT.brimR} ry={GAT_BRIM_RY}
        fill="none" stroke="#43434E" strokeWidth={1.5} />

      {/* ② 대우(총모자) — 그 위에 선다 */}
      <Path d={GAT_CROWN} fill={GAT_LACQUER} />
      <Path d={GAT_MANE} stroke={GAT_WEAVE} strokeWidth={0.9} opacity={0.34} fill="none" />
      <Ellipse cx={125} cy={GAT_TOP_Y} rx={GAT.topHW} ry={GAT_TOP_RY} fill={GAT_CROWN_TOP} />
      <Ellipse cx={125} cy={GAT_TOP_Y} rx={GAT.topHW} ry={GAT_TOP_RY}
        fill="none" stroke="#43434E" strokeWidth={1} />

      {/* ③ 갓끈 — 견영(絹纓, 비단). 조선 후기부터 신분 막론 전 계층이 쓴 것이다.
          🔑 **한 줄이 양쪽 양태에 매여 턱 밑으로 처지는 것**이지, 좌우에서 따로
             늘어지는 두 가닥이 아니다. 두 가닥으로 그렸을 때 «더듬이»로 읽혔던
             진짜 이유가 길이가 아니라 이 구조였다.
          가장 낮은 점 y158 — 씨앗(y129~201)의 윗부분을 스친다. 한가운데(165)를
          지나면 둥근 씨앗이 선으로 반 잘려 보인다. */}
      <Path d={GAT_CORD}
        stroke={GAT_LACQUER} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.9} />
    </>
  );
}

function Y2kRibbon() {
  return (
    <>
      {/* Y2K 리본 — 머리 위쪽 (y≈0~35 영역) */}

      {/* 리본 왼쪽 루프 */}
      <Path
        d="M98 22 C80 8, 60 10, 68 26 C74 38, 95 36, 98 22 Z"
        fill="#E878CE"
      />
      {/* 리본 오른쪽 루프 */}
      <Path
        d="M152 22 C170 8, 190 10, 182 26 C176 38, 155 36, 152 22 Z"
        fill="#E878CE"
      />
      {/* 그림자 왼쪽 루프 */}
      <Path
        d="M98 22 C82 12, 64 14, 70 27 C75 35, 94 34, 98 22 Z"
        fill="#C050A8"
        opacity={0.5}
      />
      {/* 그림자 오른쪽 루프 */}
      <Path
        d="M152 22 C168 12, 186 14, 180 27 C175 35, 156 34, 152 22 Z"
        fill="#C050A8"
        opacity={0.5}
      />
      {/* 리본 중앙 매듭 */}
      <Ellipse cx={125} cy={24} rx={10} ry={8} fill="#E878CE" />
      <Ellipse cx={125} cy={24} rx={6} ry={5} fill="#F0A0E0" />
    </>
  );
}

function OceanHat() {
  // 밀짚모자 — 머리 위에 얹힌다(y≈6~50). 오버레이라 캐릭터를 가리지 않게
  // 챙(brim)을 얇은 타원으로 둬 이마 위쪽에만 걸친다.
  return (
    <>
      {/* 챙 아래 그림자 */}
      <Ellipse cx={125} cy={49} rx={80} ry={15} fill="#B98A3C" opacity={0.35} />
      {/* 챙(brim) */}
      <Ellipse cx={125} cy={46} rx={80} ry={16} fill="#E8C878" />
      <Ellipse cx={125} cy={46} rx={80} ry={16} fill="none" stroke="#CBA457" strokeWidth={2} />
      {/* 크라운(crown) — 위로 볼록한 돔 */}
      <Path
        d="M83 44 C86 16, 108 6, 125 6 C142 6, 164 16, 167 44 C150 38, 100 38, 83 44 Z"
        fill="#E8C878"
      />
      <Path
        d="M83 44 C86 16, 108 6, 125 6 C142 6, 164 16, 167 44 C150 38, 100 38, 83 44 Z"
        fill="#D9B45E"
        opacity={0.45}
      />
      {/* 리본 밴드 — 바다 청록 */}
      <Path
        d="M85 41 C100 35, 150 35, 165 41 C150 46, 100 46, 85 41 Z"
        fill="#0C9AA2"
      />
      {/* 밴드 하이라이트 */}
      <Path
        d="M85 41 C100 36, 150 36, 165 41 C150 43, 100 43, 85 41 Z"
        fill="#3FBEC5"
        opacity={0.6}
      />
    </>
  );
}

function LabGoggles() {
  // 보안경을 **이마 위로 올린** 모습. 눈에 씌우면 얼굴이 통째로 가려져 캐릭터가 죽는다 —
  // 쓰고 있다가 잠깐 올린 자세라야 실험실 사람으로 읽히면서 표정도 산다.
  //
  // 🔴 **머리보다 넓어야 한다.** 첫 판은 밴드가 102 단위였는데 그 높이의 머리가 107 이라,
  //    끈이 머리 윤곽 안에서 끝나 «쓴 물건»이 아니라 «얹힌 장식»으로 보였다(실기 캡처에서
  //    재서 갈랐다: 화면 60px 대 72px). 지금은 118 로 머리를 넘어간다.
  //
  // 🔑 끈은 렌즈와 **같은 높이**에 둔다. 위로 올리면 머리띠가 되고, 렌즈 중심에서 뒤로
  //    빠져야 고글 끈으로 읽힌다 — 그래서 가운데는 렌즈에 가려지고 좌우 끝만 보인다.
  return (
    <>
      {/* 머리를 감싸는 끈 — 렌즈 뒤로 지나가야 하므로 먼저 그린다 */}
      <Path
        d="M66 71 C78 60, 172 60, 184 71 C172 65, 78 65, 66 71 Z"
        fill="#334155"
      />
      <Path
        d="M66 71 C78 62, 172 62, 184 71 C172 67, 78 67, 66 71 Z"
        fill="#5A6B80"
        opacity={0.55}
      />
      {/* 코 다리(bridge) */}
      <Path d="M121 68 L129 68" stroke="#0E7490" strokeWidth={5} strokeLinecap="round" />

      {/* 렌즈 — 유리는 연한 시안, 테는 스킨 secondary */}
      <Ellipse cx={100} cy={68} rx={21} ry={17} fill="#A5E4F0" />
      <Ellipse cx={150} cy={68} rx={21} ry={17} fill="#A5E4F0" />
      <Ellipse cx={100} cy={68} rx={21} ry={17} fill="none" stroke="#0E7490" strokeWidth={3.5} />
      <Ellipse cx={150} cy={68} rx={21} ry={17} fill="none" stroke="#0E7490" strokeWidth={3.5} />

      {/* 유리 반사 — 이게 없으면 렌즈가 구멍처럼 보인다 */}
      <Ellipse cx={92} cy={61} rx={7.5} ry={4.5} fill="#FFFFFF" opacity={0.75} transform="rotate(-20 92 61)" />
      <Ellipse cx={142} cy={61} rx={7.5} ry={4.5} fill="#FFFFFF" opacity={0.75} transform="rotate(-20 142 61)" />
    </>
  );
}
