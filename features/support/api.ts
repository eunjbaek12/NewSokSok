// 문의하기 — 전송·조회 경계.
//
// 설계 SoT: 목업 아티팩트(문의 · 답장 · 업데이트 소식).
//
// 전송은 support_messages에 행 하나를 넣는 것으로 끝난다. 알림 메일은 DB 웹훅이
// 책임지므로 앱이 메일 발송 실패를 떠안지 않는다. insert 자체가 실패할 때(오프라인·
// 서버 장애)만 화면이 mailto 폴백을 연다.
//
// 조회는 RPC로만 한다. 게스트는 user_id가 없어 RLS로 자기 행을 특정할 수 없고,
// 그렇다고 select를 열어 클라이언트 필터에 맡기면 필터를 뺀 요청이 전체를 긁어간다.

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase/client';
import { getSecureString, setSecureString } from '@/lib/storage/secure-string';

const TICKET_KEY_STORE = 'soksok_support_ticket';
const DEVICE_ID_STORE = 'soksok_support_device';

export type SupportCategory =
  | 'bug' | 'idea' | 'billing' | 'content' | 'account' | 'other';

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  'bug', 'idea', 'billing', 'content', 'account', 'other',
];

export const SUPPORT_BODY_MIN = 5;
export const SUPPORT_BODY_MAX = 2000;

export interface SupportDiagnostics {
  appVersion: string;
  platform: string;
  osVersion: string;
  locale: string;
  tier: string;
  listCount: number;
  wordCount: number;
}

export interface SupportMessage {
  id: string;
  parent_id: string | null;
  category: SupportCategory;
  body: string;
  reply_email: string | null;
  reply_body: string | null;
  replied_at: string | null;
  read_at: string | null;
  created_at: string;
}

/** 하루 5건을 넘겼을 때. 화면이 "오늘은 여기까지 보낼 수 있어요"를 띄운다. */
export class SupportRateLimitError extends Error {
  constructor() {
    super('SUPPORT_RATE_LIMIT');
    this.name = 'SupportRateLimitError';
  }
}

/**
 * 게스트가 자기 답장을 찾는 열쇠. 기기를 초기화하면 잃어버리며, 그건 정상 동작이다
 * (그런 경우를 위해 회신 이메일 칸이 있다).
 *
 * 로그인 사용자에게도 똑같이 발급한다 — 게스트로 보낸 뒤 로그인해도 이어서 볼 수 있게.
 */
export async function getTicketKey(): Promise<string> {
  const existing = await getSecureString(TICKET_KEY_STORE);
  if (existing) return existing;
  const created = Crypto.randomUUID().replace(/-/g, '');
  await setSecureString(TICKET_KEY_STORE, created);
  return created;
}

/** 하루 5건을 세는 키(게스트용). 로그인 사용자는 서버가 user_id로 센다. */
async function getDeviceId(): Promise<string> {
  const existing = await getSecureString(DEVICE_ID_STORE);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await setSecureString(DEVICE_ID_STORE, created);
  return created;
}

/**
 * 진단 정보. 기기 모델명은 expo-device가 필요해 넣지 않았다 — OS 버전까지로도
 * 대부분의 제보는 좁혀지고, OneDrive 환경에서 패키지를 늘리는 비용이 그보다 크다.
 *
 * 사용자에게 이 값을 그대로 보여주고 끌 수 있게 하는 것이 화면 쪽 계약이다.
 * 숨기고 보내면 데이터 세이프티에 신고하지 않은 수집이 된다.
 */
export function collectDiagnostics(input: {
  locale: string;
  tier: string;
  listCount: number;
  wordCount: number;
}): SupportDiagnostics {
  return {
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    platform: Platform.OS,
    osVersion: String(Platform.Version ?? ''),
    locale: input.locale,
    tier: input.tier,
    listCount: input.listCount,
    wordCount: input.wordCount,
  };
}

export interface SendSupportInput {
  category: SupportCategory;
  body: string;
  replyEmail?: string | null;
  diagnostics?: SupportDiagnostics | null;
  parentId?: string | null;
  /**
   * 재시도 시 같은 값을 넘긴다. 전송 타임아웃 뒤 사용자가 다시 눌러도 같은 id로
   * 들어가 23505로 튕기므로 중복 문의가 생기지 않는다.
   */
  id?: string;
}

/**
 * 문의 전송. 성공하면 방금 넣은 행의 id를 돌려준다(재시도용으로 화면이 보관).
 *
 * 중복 키(23505)는 성공으로 취급한다 — 같은 id로 다시 왔다는 건 앞선 전송이
 * 실제로는 저장됐다는 뜻이고, 사용자에게는 그게 성공이다.
 */
export async function sendSupportMessage(input: SendSupportInput): Promise<string> {
  const id = input.id ?? Crypto.randomUUID();
  const { data: { user } } = await supabase.auth.getUser();
  const [ticketKey, deviceId] = await Promise.all([getTicketKey(), getDeviceId()]);

  const email = input.replyEmail?.trim();
  const { error } = await supabase.from('support_messages').insert({
    id,
    parent_id: input.parentId ?? null,
    user_id: user?.id ?? null,
    ticket_key: ticketKey,
    device_id: deviceId,
    category: input.category,
    body: input.body.trim().slice(0, SUPPORT_BODY_MAX),
    reply_email: email ? email.slice(0, 254) : null,
    diagnostics: input.diagnostics ?? null,
  });

  if (error) {
    if (error.code === '23505') return id;
    if (error.message?.includes('SUPPORT_RATE_LIMIT')) throw new SupportRateLimitError();
    throw error;
  }
  return id;
}

/**
 * 내 문의와 답장. 로그인 사용자는 user_id로, 게스트는 ticket_key로 찾는다
 * (RPC 안에서 둘을 합집합으로 본다).
 */
export async function fetchSupportMessages(): Promise<SupportMessage[]> {
  const ticketKey = await getTicketKey();
  const { data, error } = await supabase.rpc('get_support_messages', {
    p_ticket_key: ticketKey,
  });
  if (error) throw error;
  return (data ?? []) as SupportMessage[];
}

/** 답장 화면을 연 순간 호출 — 설정 행의 배지가 꺼진다. */
export async function markSupportRead(): Promise<void> {
  const ticketKey = await getTicketKey();
  const { error } = await supabase.rpc('mark_support_read', { p_ticket_key: ticketKey });
  if (error) throw error;
}

/**
 * 전송이 실패했을 때 여는 메일 링크. 다 쓴 글이 날아가는 게 이 화면의 최악이라,
 * 본문·진단 정보를 모두 채워서 넘긴다.
 */
export function buildSupportMailto(input: {
  supportEmail: string;
  subject: string;
  body: string;
  diagnostics?: SupportDiagnostics | null;
}): string {
  const lines = [input.body, ''];
  if (input.diagnostics) {
    const d = input.diagnostics;
    lines.push(
      '---',
      `app ${d.appVersion} · ${d.platform} ${d.osVersion} · ${d.locale}`,
      `${d.tier} · 단어장 ${d.listCount} · 단어 ${d.wordCount}`,
    );
  }
  const q = (s: string) => encodeURIComponent(s);
  return `mailto:${input.supportEmail}?subject=${q(input.subject)}&body=${q(lines.join('\n'))}`;
}
