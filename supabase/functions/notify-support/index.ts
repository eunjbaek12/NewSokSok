// POST /functions/v1/notify-support
// Supabase Database Webhook(support_messages의 insert·update)이 호출한다.
//
// 왜 앱이 아니라 DB가 메일을 보내나:
//   앱은 support_messages에 행 하나를 넣는 것으로 끝나야 한다. 메일 발송까지
//   앱이 책임지면, 전송은 됐는데 알림만 실패한 상태를 사용자에게 "실패"로 보여주게
//   된다. insert만 성공하면 알림은 반드시 나가는 구조로 분리한다.
//
// 두 방향:
//   INSERT  → 운영자에게 "새 문의". 제목 앞에 카테고리를 붙여 메일함에서 결제 건만
//             바로 골라낼 수 있게 한다. 회신 주소가 없으면 [회신불가]를 덧붙여
//             답장을 쓰다 마는 일이 없게 한다.
//   UPDATE  → reply_body가 새로 채워졌을 때만, 사용자에게 답장 메일. 운영자는
//             대시보드 한 곳에만 쓰고 앱·메일 양쪽에 닿는다.
//
// ⚠️ Apple "이메일 가리기"(@privaterelay.appleid.com) 주소는 Apple에 등록된
//    발신자만 통과시킨다. 도메인 없이 보내는 동안에는 반송될 수 있고, 그래서 앱
//    내 답장이 정본이다(메일은 덤). 반송을 실패로 취급하지 않는다.
//
// 응답:
//   200 { ok: true, sent: boolean }
//   204 (보낼 필요 없는 이벤트 — 답장 없는 update 등)
//   401 { ok: false, error: 'unauthorized' }  웹훅 시크릿 불일치
//   500 { ok: false, error: 'send_failed' }
//
// 필요한 Secret:
//   RESEND_API_KEY           Resend API 키
//   SUPPORT_NOTIFY_TO        운영자 수신 주소
//   SUPPORT_FROM             발신 주소(도메인 미인증이면 onboarding@resend.dev)
//   SUPPORT_WEBHOOK_SECRET   Database Webhook에 넣을 커스텀 헤더 값
//
// 배포:
//   supabase functions deploy notify-support --no-verify-jwt
//   (웹훅은 사용자 JWT를 들고 오지 않는다. 대신 아래 시크릿 헤더로 검증한다.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const NOTIFY_TO = Deno.env.get('SUPPORT_NOTIFY_TO')!;
const FROM = Deno.env.get('SUPPORT_FROM') ?? 'onboarding@resend.dev';
const WEBHOOK_SECRET = Deno.env.get('SUPPORT_WEBHOOK_SECRET') ?? '';

const CATEGORY_LABEL: Record<string, string> = {
  bug: '버그',
  idea: '제안',
  billing: '결제',
  content: '단어',
  account: '계정',
  other: '기타',
};

interface SupportRow {
  id: string;
  parent_id: string | null;
  user_id: string | null;
  category: string;
  body: string;
  reply_email: string | null;
  diagnostics: Record<string, unknown> | null;
  reply_body: string | null;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: SupportRow;
  old_record: SupportRow | null;
}

function summarize(body: string, max = 46): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function formatDiagnostics(d: Record<string, unknown> | null): string {
  if (!d) return '진단 정보 없음(사용자가 끔)';
  return [
    `앱      ${d.appVersion} · ${d.platform} ${d.osVersion} · ${d.locale}`,
    `계정    ${d.tier}`,
    `보유    단어장 ${d.listCount}개 · 단어 ${d.wordCount}개`,
  ].join('\n');
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    console.error('[notify-support] resend failed', res.status, await res.text());
    return false;
  }
  return true;
}

/** 이어서 보낸 메시지면 이전 문답을 함께 인용한다. */
async function loadParent(parentId: string): Promise<SupportRow | null> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data } = await admin
    .from('support_messages')
    .select('id, parent_id, user_id, category, body, reply_email, diagnostics, reply_body, created_at')
    .eq('id', parentId)
    .maybeSingle();
  return (data as SupportRow) ?? null;
}

async function handleNewMessage(row: SupportRow): Promise<boolean> {
  const label = CATEGORY_LABEL[row.category] ?? '기타';
  const parts = [`쏙쏙보카·${label}`];
  if (row.parent_id) parts.push('이어서');
  if (!row.reply_email) parts.push('회신불가');
  const subject = `[${parts.join('·')}] ${summarize(row.body)}`;

  const lines = [row.body, '', '─────────────'];

  if (row.parent_id) {
    const parent = await loadParent(row.parent_id);
    if (parent) {
      lines.push(
        '',
        '[이전 문의]',
        parent.body,
        '',
        '[보낸 답장]',
        parent.reply_body ?? '(없음)',
        '',
        '─────────────',
      );
    }
  }

  lines.push(
    '',
    formatDiagnostics(row.diagnostics),
    `계정ID  ${row.user_id ?? '게스트'}`,
    `회신    ${row.reply_email ?? '없음 — 앱에서만 답장 가능'}`,
    `접수    ${row.created_at}`,
    '',
    '답장은 이 메일에 쓰지 말고 대시보드의 reply_body에 쓰세요.',
    '그래야 앱과 메일 양쪽에 닿습니다. 이메일을 안 적은 사용자는 앱이 유일한 경로입니다.',
    '',
    `${SUPABASE_URL.replace('.supabase.co', '')}  ·  id ${row.id}`,
  );

  return await sendEmail({
    to: NOTIFY_TO,
    subject,
    text: lines.join('\n'),
    replyTo: row.reply_email ?? undefined,
  });
}

async function handleReply(row: SupportRow): Promise<boolean> {
  // 이메일을 안 적은 사용자에게는 앱이 유일한 경로다 — 메일은 건너뛴다.
  if (!row.reply_email) return false;

  const lines = [
    '보내주신 메시지에 답장을 드립니다.',
    '',
    row.reply_body ?? '',
    '',
    '─────────────',
    '',
    '[보내주신 내용]',
    row.body,
    '',
    '앱의 설정 › 개발자에게 메시지에서도 같은 답장을 보실 수 있고,',
    '이어서 하실 말씀이 있으면 거기서 바로 보내주시면 됩니다.',
    '',
    '쏙쏙 보카',
  ];

  return await sendEmail({
    to: row.reply_email,
    subject: '쏙쏙 보카 — 문의하신 내용에 답장드려요',
    text: lines.join('\n'),
    replyTo: NOTIFY_TO,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  // 웹훅은 사용자 JWT를 들고 오지 않으므로(--no-verify-jwt로 배포) 공유 시크릿으로
  // 검증한다. 이게 없으면 누구나 이 엔드포인트로 메일을 쏠 수 있다.
  if (WEBHOOK_SECRET && req.headers.get('x-support-secret') !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let sent = false;

    if (payload.type === 'INSERT') {
      sent = await handleNewMessage(payload.record);
    } else if (payload.type === 'UPDATE') {
      // 답장이 "새로" 채워졌을 때만. 상태만 바꾸는 update로 메일이 또 나가면 안 된다.
      const before = payload.old_record?.reply_body ?? '';
      const after = payload.record.reply_body ?? '';
      if (after && after !== before) {
        sent = await handleReply(payload.record);
      } else {
        return new Response(null, { status: 204 });
      }
    } else {
      return new Response(null, { status: 204 });
    }

    if (!sent) {
      // 메일이 안 나가도 문의 자체는 저장됐다. 웹훅에 실패를 알려 로그에 남긴다.
      return new Response(JSON.stringify({ ok: false, error: 'send_failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[notify-support] unhandled', e);
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
