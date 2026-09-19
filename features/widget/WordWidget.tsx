'use no memo';

/**
 * 휴대폰 홈 화면 위젯 2×2 — `docs/widget-design.md` §-2 와 목업 v13 이 정본이다.
 *
 * 굵기·자간은 목업에서 그대로 옮겼다(`dev/mockups/widget-notification-mockup-2026-09-17-v13.html`):
 * 단어 22/700 자간 -0.3 · 뜻 14/500 · 판정 버튼 48/600 · 칩 11/600.
 * 🔴 굵기를 빼면 치수가 다 맞아도 **다른 화면으로 보인다** — 1차 구현이 그랬다(9/19 실기).
 *
 * ## 높이 예산 (2×2 = 170dp, 안쪽 여백을 빼면 146dp)
 *
 * `20`(칩) + `26`(단어) + `30`(뜻·개수 한 줄) + `48`(버튼) + 간격 `6×3` = **142dp**.
 * 🔴 9/19 에 «개수를 뜻 아래 오른쪽»으로 정할 때 이 예산을 보지 않았다 — 줄을 하나 더 쓰면
 * 뜻에 남는 높이가 26dp 에서 3dp 로 줄어 **2×2 에서는 뜻이 사라진다**. 그래서 개수를 뜻과
 * 같은 줄 오른쪽에 둔다(의도였던 «매 순간 볼 값이 아니다»는 그대로 지켜진다).
 *
 * 🔴 **런처는 선언한 크기를 주지 않는다.** 160×160dp 를 요청했는데 삼성 런처는 143×253dp 를
 * 줬다(9/19 실기). 사용자가 늘릴 수도 있다. 그래서 남는 높이는 어느 한 요소가 먹지 않고
 * `justifyContent: 'center'` 로 **위아래에 나눠 준다** — 뜻 자리에 `flex: 1` 을 줬더니 큰
 * 위젯에서 회색 박스가 화면 절반을 차지했다.
 *
 * 🔑 뜻은 **가렸다가 탭으로 공개**한다(W5). 가린 동안에는 판정 버튼을 그리지 않는다 —
 * 뜻을 안 보고 누르는 «외웠어요»는 판정이 아니라 오조작이다.
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import Colors from '@/constants/colors';
import i18n from '@/i18n';
import type { WidgetMode } from './next-word';

/** 위젯 스타일의 색 타입이 `#${string}` 템플릿이라, 팔레트 값(string)을 좁혀 준다. */
const hex = (v: string) => v as `#${string}`;

/**
 * 폰 라이트 색(클래식 팔레트 고정) — 위젯은 앱 스킨을 따르지 않는다(§-2 범위).
 * 완주 상장이 `Colors.light` 를 고정으로 쓰는 것과 같은 이유: 보는 자리가 앱 밖이라 테마 훅이
 * 닿지 않고, 스킨을 하나 더할 때마다 위젯 열여섯 벌을 다시 볼 수는 없다.
 */
const C = {
  surface: hex(Colors.light.surface),
  text: hex(Colors.light.text),
  sub: hex(Colors.light.textSecondary),
  faint: hex(Colors.light.textTertiary),
  soft: hex(Colors.light.surfaceSecondary),
  primary: hex(Colors.light.primary),
  onPrimary: hex(Colors.light.onPrimary),
} as const;

/**
 * 칩 색. 복습은 앱 복습 배너의 브랜드 그린, 새 단어는 맞춤 학습의 티일 —
 * 두 색 모두 앱에서 그 뜻으로 이미 쓰이고 있어 사용자가 옮겨 읽을 필요가 없다.
 */
const CHIP_COLOR: Record<WidgetMode, `#${string}`> = {
  review: hex(Colors.light.reviewGradient[0]),
  new: hex(Colors.light.primary),
};

/** 액션 이름 — `clickAction` 과 핸들러가 같은 문자열을 본다. */
export const WIDGET_ACTION = {
  reveal: 'REVEAL',
  gotIt: 'GOT_IT',
  again: 'AGAIN',
  openApp: 'OPEN_APP',
} as const;

export interface WordWidgetProps {
  mode: WidgetMode;
  term: string;
  meaning: string;
  listTitle: string;
  revealed: boolean;
  done: number;
  cap: number;
  /** 판정 탭에 실어 보내는 단어 id. 늦게 도착한 탭이 **다음 단어를 판정하는 것**을 막는다. */
  wordId: string;
}

/**
 * 칩·버튼 문구는 **앱이 이미 쓰는 키를 그대로** 쓴다. 새 키를 만들면 한쪽만 고쳐져 두 화면이
 * 갈라진다 — 칩은 설정의 조건 칩과 같은 글자여야 하고(9/19 ①), 버튼은 앱 카드 학습과 같은
 * 글자여야 한다(W6: 사용자는 앱에서 먼저 배운다).
 */
function chipLabel(mode: WidgetMode): string {
  return mode === 'review' ? i18n.t('flashcards.review') : i18n.t('search.filterLearning');
}

export function WordWidget(props: WordWidgetProps) {
  const { mode, term, meaning, listTitle, revealed, done, cap, wordId } = props;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.surface,
        borderRadius: 22,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'center',
        flexGap: 6,
      }}
      accessibilityLabel={`${chipLabel(mode)} ${term}`}
    >
      {/* 윗줄 — 칩과 단어장 이름. 이름이 없으면 위젯 둘을 나란히 놓았을 때 구분이 안 된다(9/19 ③). */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 20,
          flexDirection: 'row',
          alignItems: 'center',
          flexGap: 6,
        }}
      >
        <FlexWidget
          style={{
            height: 20,
            backgroundColor: CHIP_COLOR[mode],
            borderRadius: 10,
            paddingHorizontal: 8,
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text={chipLabel(mode)}
            style={{ fontSize: 11, fontWeight: '600', color: C.onPrimary }}
            maxLines={1}
          />
        </FlexWidget>
        <TextWidget
          text={listTitle}
          style={{ fontSize: 11, fontWeight: '500', color: C.faint }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>

      <TextWidget
        text={term}
        style={{
          fontSize: 22,
          fontWeight: '700',
          letterSpacing: -0.3,
          lineHeight: 26,
          color: C.text,
        }}
        maxLines={1}
        truncate="END"
      />

      {/*
        뜻과 오늘 몫을 **한 줄에** 둔다.
        🔴 9/19 에 개수를 «뜻 아래 오른쪽»으로 정할 때 높이 예산을 안 봤다 — 줄을 하나 더
        쓰면 2×2(안쪽 146dp)에서 뜻에 남는 높이가 26dp → 3dp 가 된다. 같은 줄 오른쪽에
        두면 «뜻 아래»라는 의도(매 순간 볼 값이 아니다)는 지키면서 줄은 아끼게 된다.
      */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 30,
          flexDirection: 'row',
          alignItems: 'center',
          flexGap: 6,
        }}
      >
        {revealed ? (
          <FlexWidget style={{ flex: 1, height: 30, justifyContent: 'center' }}>
            <TextWidget
              text={meaning}
              style={{ fontSize: 14, fontWeight: '500', lineHeight: 18, color: C.text }}
              maxLines={1}
              truncate="END"
            />
          </FlexWidget>
        ) : (
          <FlexWidget
            style={{
              flex: 1,
              height: 30,
              backgroundColor: C.soft,
              borderRadius: 10,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            clickAction={WIDGET_ACTION.reveal}
            clickActionData={{ wordId }}
          >
            <TextWidget
              text={i18n.t('widget.reveal')}
              style={{ fontSize: 12, fontWeight: '500', color: C.sub }}
              maxLines={1}
            />
          </FlexWidget>
        )}
        <TextWidget
          text={`${done} / ${cap}`}
          style={{ fontSize: 11, fontWeight: '600', color: C.faint }}
          maxLines={1}
        />
      </FlexWidget>

      {revealed ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 6 }}>
          <FlexWidget
            style={{
              flex: 1,
              height: 48,
              backgroundColor: C.soft,
              borderRadius: 12,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            clickAction={WIDGET_ACTION.again}
            clickActionData={{ wordId }}
          >
            <TextWidget
              text={i18n.t('flashcards.reviewBtn')}
              style={{ fontSize: 14, fontWeight: '600', color: C.text }}
              maxLines={1}
            />
          </FlexWidget>
          <FlexWidget
            style={{
              flex: 1,
              height: 48,
              backgroundColor: CHIP_COLOR[mode],
              borderRadius: 12,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            clickAction={WIDGET_ACTION.gotIt}
            clickActionData={{ wordId }}
          >
            <TextWidget
              text={i18n.t('flashcards.memorized')}
              style={{ fontSize: 14, fontWeight: '600', color: C.onPrimary }}
              maxLines={1}
            />
          </FlexWidget>
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/**
 * 단어가 없을 때. 넷을 한 화면으로 묶되 **문구로 가른다** — «오늘 끝!»과 «단어장이 비었어요»가
 * 같아 보이면 사용자가 «다 했다»와 «넣을 게 없다»를 구별하지 못한다.
 */
export function MessageWidget(props: { title: string; sub: string; action?: string }) {
  const { title, sub, action } = props;
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.surface,
        borderRadius: 22,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flexGap: 4,
      }}
      accessibilityLabel={title}
      clickAction={action ? WIDGET_ACTION.openApp : undefined}
    >
      <TextWidget
        text={title}
        style={{ fontSize: 17, fontWeight: '700', lineHeight: 22, color: C.text, textAlign: 'center' }}
        maxLines={2}
      />
      <TextWidget
        text={sub}
        style={{ fontSize: 12, fontWeight: '500', lineHeight: 17, color: C.sub, textAlign: 'center' }}
        maxLines={2}
      />
      {action ? (
        <FlexWidget
          style={{
            height: 40,
            backgroundColor: C.soft,
            borderRadius: 12,
            paddingHorizontal: 18,
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: 6,
          }}
          clickAction={WIDGET_ACTION.openApp}
        >
          <TextWidget
            text={action}
            style={{ fontSize: 13, fontWeight: '600', color: C.primary }}
            maxLines={1}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
