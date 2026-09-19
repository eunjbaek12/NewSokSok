'use no memo';

/**
 * 휴대폰 홈 화면 위젯 — `docs/widget-design.md` §-2 와 목업이 정본이다.
 *
 * 굵기·자간은 목업 v13 에서 그대로 옮겼다: 단어 22/700 자간 -0.3 · 뜻 14/500 · 판정 버튼 48/600 · 칩 11/600.
 * 🔴 굵기를 빼면 치수가 다 맞아도 **다른 화면으로 보인다** — 1차 구현이 그랬다(9/19 실기).
 *
 * ## 모양 (9/19 «뜻 두 줄» 확정 — https://claude.ai/artifact/SEFfZyY6qYVQLbYRk6s7aZ)
 *
 * - **칩·단어는 위에 고정, 판정 버튼은 아래에 고정.** 가운데 정렬로 두었더니 뜻을 열 때 단어가 27dp 튀었다.
 * - **뜻은 남는 높이를 다 쓴다.** 2×2 에서 두 줄, 크게 놓으면 들어가는 만큼(줄 수는 `./layout`).
 * - **«1 / 10»은 뜻을 가린 동안만 보인다.** 뜻 줄 오른쪽에 두면 폭 40dp 를 가져가 한 줄에 여섯 글자만
 *   남았다. 위젯은 거의 늘 가린 채로 놓여 있고 개수는 그때 보는 값이라, 판정하는 몇 초 동안 빠져도 잃는 게 없다.
 *   판정하면 다음 단어가 가린 채로 새 개수와 함께 돌아온다.
 * - 가린 동안에는 판정 버튼을 그리지 않는다 — 뜻을 안 보고 누르는 «외웠어요»는 판정이 아니라 오조작이다.
 *   «눌러서 뜻 보기»가 그 자리까지 차지한다(누를 곳이 클수록 좋다).
 */
import React from 'react';
import { PixelRatio } from 'react-native';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import Colors from '@/constants/colors';
import i18n from '@/i18n';
import type { WidgetMode } from './next-word';
import {
  BUTTON_H,
  CHIP_ROW_H,
  COUNT_ROW_H,
  GAP,
  GAP_WORD_MEANING,
  MEANING_LINE_H,
  WIDGET_PAD_H,
  WIDGET_PAD_V,
  WORD_H,
  meaningLines,
} from './layout';

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
  /** 위젯의 실제 높이(dp). 뜻을 몇 줄 보여 줄지 센다. */
  height: number;
}

/**
 * 칩·버튼 문구는 **앱이 이미 쓰는 키를 그대로** 쓴다. 새 키를 만들면 한쪽만 고쳐져 두 화면이
 * 갈라진다 — 칩은 설정의 조건 칩과 같은 글자여야 하고(9/19 ①), 버튼은 앱 카드 학습과 같은
 * 글자여야 한다(W6: 사용자는 앱에서 먼저 배운다).
 */
function chipLabel(mode: WidgetMode): string {
  return mode === 'review' ? i18n.t('flashcards.review') : i18n.t('search.filterLearning');
}

/** 폰의 글자 크기 설정. 헤드리스에서 못 읽으면 기본값으로 본다. */
function fontScale(): number {
  try {
    return PixelRatio.getFontScale();
  } catch {
    return 1;
  }
}

export function WordWidget(props: WordWidgetProps) {
  const { mode, term, meaning, listTitle, revealed, done, cap, wordId, height } = props;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.surface,
        borderRadius: 22,
        paddingVertical: WIDGET_PAD_V,
        paddingHorizontal: WIDGET_PAD_H,
        flexDirection: 'column',
      }}
      accessibilityLabel={`${chipLabel(mode)} ${term}`}
    >
      {/* 윗줄 — 칩과 단어장 이름. 이름이 없으면 위젯 둘을 나란히 놓았을 때 구분이 안 된다(9/19 ③). */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: CHIP_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          flexGap: 6,
        }}
      >
        <FlexWidget
          style={{
            height: CHIP_ROW_H,
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
          lineHeight: WORD_H,
          color: C.text,
          marginTop: GAP,
        }}
        maxLines={1}
        truncate="END"
      />

      {revealed ? (
        // 뜻 — 남는 높이를 다 쓰고, 넘칠 때만 마지막 줄에서 «…».
        <FlexWidget
          style={{
            flex: 1,
            width: 'match_parent',
            marginTop: GAP_WORD_MEANING,
            flexDirection: 'column',
            justifyContent: 'flex-start',
          }}
        >
          <TextWidget
            text={meaning}
            style={{ fontSize: 14, fontWeight: '500', lineHeight: MEANING_LINE_H, color: C.text }}
            maxLines={meaningLines(height, fontScale())}
            truncate="END"
          />
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            flex: 1,
            width: 'match_parent',
            marginTop: GAP,
            backgroundColor: C.soft,
            borderRadius: 12,
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

      {revealed ? (
        <FlexWidget
          style={{ width: 'match_parent', flexDirection: 'row', flexGap: 6, marginTop: GAP }}
        >
          <FlexWidget
            style={{
              flex: 1,
              height: BUTTON_H,
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
              height: BUTTON_H,
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
      ) : (
        // 오늘 몫 — 가린 동안만. 뜻을 열면 이 자리를 판정 버튼이 쓴다.
        <FlexWidget
          style={{
            width: 'match_parent',
            height: COUNT_ROW_H,
            marginTop: GAP,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text={`${done} / ${cap}`}
            style={{ fontSize: 11, fontWeight: '600', color: C.faint }}
            maxLines={1}
          />
        </FlexWidget>
      )}
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
        paddingVertical: WIDGET_PAD_V,
        paddingHorizontal: WIDGET_PAD_H,
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
