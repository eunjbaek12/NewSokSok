import React from 'react';
import { G, Path, Ellipse } from 'react-native-svg';
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
    </G>
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
