// 단어 알림 설정 줄의 문구 조립. 화면 둘(설정 탭 · «알림에 나올 단어»)이 같은 말을 해야 해서 한 곳에 모은다.

import type { VocaList } from '@/lib/types';
import type { WordNotificationSettings } from '@shared/contracts';
import { wordFilterLabel } from '../pick/labels';
import { formatReviewTime } from '../review/notify-time';
import { resolveSourceList } from './plan';

type T = (key: string, opts?: any) => string;

/** 자정 기준 분 → «오전 9:00». 복습 알림 시각과 같은 표기. */
export function formatMinuteOfDay(minute: number, locale: string): string {
  return formatReviewTime(Math.floor(minute / 60), minute % 60, locale);
}

/**
 * 조건 부분 — «미암기», «많이 틀린 50 · 별표». 칩 이름은 «골라서 학습»과 같은 함수로 만든다.
 */
export function wordNotifConditionLabel(settings: Pick<WordNotificationSettings, 'wordFilter' | 'starredOnly'>, t: T): string {
  const parts = [wordFilterLabel(settings.wordFilter, t)];
  if (settings.starredOnly) parts.push(t('search.starredChip'));
  return parts.join(' · ');
}

/**
 * «나올 단어» 줄 — «토익 필수 800 (자동) · 미암기». 단어장(고른 방식 포함) · 조건은 설정 화면의 두 묶음과
 * 같은 급이라 한 줄에 둔다(목업 ⑦). 학습 계획의 Day 는 적지 않는다 — 알림은 Day 로 자르지 않는다(N9).
 */
export function wordNotifSourceLabel(lists: VocaList[], settings: WordNotificationSettings, t: T): string {
  const { list, auto } = resolveSourceList(lists, settings.listId);
  if (!list) return t('wordNotif.noList');
  const name = auto ? t('wordNotif.autoName', { name: list.title }) : list.title;
  return `${name} · ${wordNotifConditionLabel(settings, t)}`;
}

/** «보내는 시간» 줄 — «오전 9:00~오후 9:00 · 하루 5번». */
export function wordNotifTimeLabel(settings: WordNotificationSettings, locale: string, t: T): string {
  return t('wordNotif.timeSub', {
    start: formatMinuteOfDay(settings.startMinute, locale),
    end: formatMinuteOfDay(settings.endMinute, locale),
    count: settings.perDay,
  });
}

/** 상세 설정 아래 설명 한 줄. */
export function wordNotifConditionDesc(settings: Pick<WordNotificationSettings, 'wordFilter' | 'starredOnly'>, t: T): string {
  const base = {
    learning: t('wordNotif.descLearning'),
    memorized: t('wordNotif.descMemorized'),
    wrongCount: t('wordNotif.descWrong'),
    recent: t('wordNotif.descRecent'),
  }[settings.wordFilter];
  return settings.starredOnly ? `${base} ${t('wordNotif.descStarred')}` : base;
}
