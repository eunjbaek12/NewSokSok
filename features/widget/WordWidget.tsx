'use no memo';

/**
 * 휴대폰 홈 화면 위젯 2×2 — `docs/widget-design.md` §-2 가 정본.
 *
 * 크기는 170dp 하나뿐이고 안쪽 여백을 빼면 146dp 가 남는다. 그 안에 칩·단어장 이름·단어·뜻·
 * 판정 버튼(높이 48)이 들어가므로 **줄 하나를 더 넣을 자리는 없다** — 9/19 에 개수(«4 / 10»)를
 * 뜻 아래로 내리고 윗줄을 단어장 이름에 내준 것이 그래서다.
 *
 * 🔑 뜻은 **가렸다가 탭으로 공개**한다(W5). 가린 상태에서는 판정 버튼을 그리지 않는다 —
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
      }}
      accessibilityLabel={`${chipLabel(mode)} ${term}`}
    >
      {/* 윗줄 — 칩과 단어장 이름. 이름이 없으면 위젯 둘을 나란히 놓았을 때 구분이 안 된다. */}
      <FlexWidget
        style={{ width: 'match_parent', height: 20, flexDirection: 'row', alignItems: 'center' }}
      >
        <FlexWidget
          style={{
            height: 20,
            backgroundColor: CHIP_COLOR[mode],
            borderRadius: 10,
            paddingHorizontal: 8,
            justifyContent: 'center',
            marginRight: 6,
          }}
        >
          <TextWidget
            text={chipLabel(mode)}
            style={{ fontSize: 11, color: C.onPrimary }}
            maxLines={1}
          />
        </FlexWidget>
        <TextWidget
          text={listTitle}
          style={{ fontSize: 11, color: C.faint }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>

      <TextWidget
        text={term}
        style={{ fontSize: 22, color: C.text, marginTop: 6 }}
        maxLines={1}
        truncate="END"
      />

      {revealed ? (
        <TextWidget
          text={meaning}
          style={{ fontSize: 14, color: C.text, marginTop: 4 }}
          maxLines={1}
          truncate="END"
        />
      ) : (
        // 가림 — 뜻 자리를 그대로 차지해, 공개해도 아래 버튼이 움직이지 않는다.
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 26,
            backgroundColor: C.soft,
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: 4,
          }}
          clickAction={WIDGET_ACTION.reveal}
          clickActionData={{ wordId }}
        >
          <TextWidget text={i18n.t('widget.reveal')} style={{ fontSize: 12, color: C.sub }} maxLines={1} />
        </FlexWidget>
      )}

      <TextWidget
        text={`${done} / ${cap}`}
        style={{ fontSize: 11, color: C.faint, marginTop: 4 }}
        maxLines={1}
      />

      {revealed ? (
        <FlexWidget
          style={{ width: 'match_parent', flexDirection: 'row', marginTop: 4 }}
        >
          <FlexWidget
            style={{
              flex: 1,
              height: 48,
              backgroundColor: C.soft,
              borderRadius: 12,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 6,
            }}
            clickAction={WIDGET_ACTION.again}
            clickActionData={{ wordId }}
          >
            <TextWidget
              text={i18n.t('flashcards.reviewBtn')}
              style={{ fontSize: 14, color: C.text }}
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
              style={{ fontSize: 14, color: C.onPrimary }}
              maxLines={1}
            />
          </FlexWidget>
        </FlexWidget>
      ) : (
        <FlexWidget style={{ width: 'match_parent', height: 48, marginTop: 4 }} />
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
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      accessibilityLabel={title}
      clickAction={action ? WIDGET_ACTION.openApp : undefined}
    >
      <TextWidget text={title} style={{ fontSize: 17, color: C.text }} maxLines={2} />
      <TextWidget
        text={sub}
        style={{ fontSize: 12, color: C.sub, marginTop: 4 }}
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
            marginTop: 10,
          }}
          clickAction={WIDGET_ACTION.openApp}
        >
          <TextWidget text={action} style={{ fontSize: 13, color: C.primary }} maxLines={1} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
