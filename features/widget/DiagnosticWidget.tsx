'use no memo';

/**
 * 진단 위젯 — 만들 위젯의 모습이 아니라, **만들 수 있는지를 재는** 화면이다.
 *
 * 위젯을 짜기 전에 답해야 할 게 둘 있었다(`docs/widget-design.md` §-2 «만들 때 확인할 것»):
 * 앱이 꺼진 상태에서 위젯 코드가 `expo-sqlite` 를 여는가, 그리고 첫 탭이 몇 초인가.
 * 둘 다 화면을 다 짜고 나서 알면 늦는다 — 첫 탭이 느리면 «뜻을 가렸다 탭으로 공개»(W5)가
 * 통째로 무너지고, DB 를 못 열면 데이터 계층부터 다시 짜야 한다.
 *
 * 그래서 첫 판은 그 두 값을 **위젯 얼굴에 그대로 찍는다**. 성공/실패가 아니라 수치를
 * 보여 주는 이유는, 실패해도 어디서 막혔는지가 같은 화면에 남아야 하기 때문이다.
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import Colors from '@/constants/colors';

/** 위젯 스타일의 색 타입이 `#${string}` 템플릿이라, 팔레트 값(string)을 좁혀 준다. */
const hex = (v: string) => v as `#${string}`;

/**
 * 폰 라이트 색(클래식 팔레트 고정) — 위젯은 앱 스킨을 따르지 않는다(§-2 범위).
 * 완주 상장이 `Colors.light` 를 고정으로 쓰는 것과 같은 이유다: 보는 자리가 앱 밖이라
 * 테마 훅이 닿지 않고, 스킨을 하나 더할 때마다 위젯 열여섯 벌을 다시 볼 수는 없다.
 */
const C = {
  surface: hex(Colors.light.surface),
  text: hex(Colors.light.text),
  sub: hex(Colors.light.textSecondary),
  faint: hex(Colors.light.textTertiary),
  soft: hex(Colors.light.surfaceSecondary),
  primary: hex(Colors.light.primary),
  error: hex(Colors.light.error),
} as const;

export interface DiagnosticData {
  /** DB 를 열고 한 줄 읽는 데 성공했나. */
  ok: boolean;
  /** 읽어 온 단어 — 실패면 에러 메시지. */
  headline: string;
  /** 읽어 온 뜻(있으면). */
  meaning: string;
  /** `PRAGMA user_version` — 앱이 쓰는 스키마 번호와 같아야 한다. */
  schema: number;
  /** DB 를 열고 한 줄 읽는 데 걸린 시간. */
  dbMs: number;
  /** 앱 번들(`expo-router/entry`)을 불러오는 데 걸린 시간 — **첫 탭 지연의 본체**. */
  bundleMs: number;
  /** 이 JS 컨텍스트가 뜬 지 얼마나 됐나. 작으면 이번 탭에 새로 떴다는 뜻. */
  ageMs: number;
  /** 지금까지 누른 횟수 — 위젯이 스스로 세어 `clickActionData` 로 돌려받는다. */
  taps: number;
}

function ms(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}초` : `${v}ms`;
}

export function DiagnosticWidget({ data }: { data: DiagnosticData }) {
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
      accessibilityLabel="아보카도 위젯 진단"
    >
      <TextWidget
        text={`진단 · DB v${data.schema}`}
        style={{ fontSize: 11, color: C.faint }}
        maxLines={1}
      />

      <TextWidget
        text={data.headline}
        style={{
          fontSize: data.ok ? 20 : 11,
          color: data.ok ? C.text : C.error,
          marginTop: 4,
        }}
        maxLines={data.ok ? 1 : 4}
        truncate="END"
      />

      {data.ok ? (
        <TextWidget
          text={data.meaning}
          style={{ fontSize: 12, color: C.sub, marginTop: 2 }}
          maxLines={1}
          truncate="END"
        />
      ) : (
        <TextWidget text="" style={{ fontSize: 1, color: C.surface }} />
      )}

      <TextWidget
        text={`읽기 ${ms(data.dbMs)} · 번들 ${ms(data.bundleMs)}`}
        style={{ fontSize: 11, color: C.faint, marginTop: 6 }}
        maxLines={1}
      />
      <TextWidget
        text={`깨어난 지 ${ms(data.ageMs)} · 탭 ${data.taps}`}
        style={{ fontSize: 11, color: C.faint }}
        maxLines={1}
      />

      <FlexWidget
        style={{
          height: 40,
          width: 'match_parent',
          backgroundColor: C.soft,
          borderRadius: 12,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 6,
        }}
        clickAction="DIAG_TAP"
        clickActionData={{ taps: data.taps }}
      >
        <TextWidget text="눌러 보기" style={{ fontSize: 13, color: C.primary }} maxLines={1} />
      </FlexWidget>
    </FlexWidget>
  );
}
