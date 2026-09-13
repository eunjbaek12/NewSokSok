// POST /functions/v1/notify-support
// Supabase Database Webhook(support_messages의 insert·update, curation_reports의
// insert)이 호출한다.
//
// 왜 앱이 아니라 DB가 메일을 보내나:
//   앱은 support_messages에 행 하나를 넣는 것으로 끝나야 한다. 메일 발송까지
//   앱이 책임지면, 전송은 됐는데 알림만 실패한 상태를 사용자에게 "실패"로 보여주게
//   된다. insert만 성공하면 알림은 반드시 나가는 구조로 분리한다.
//
// 세 방향:
//   support_messages INSERT  → 운영자에게 "새 문의". 제목 앞에 카테고리를 붙여
//             메일함에서 결제 건만 바로 골라낼 수 있게 한다. 회신 주소가 없으면
//             [회신불가]를 덧붙여 답장을 쓰다 마는 일이 없게 한다.
//   support_messages UPDATE  → reply_body가 새로 채워졌을 때만, 사용자에게 답장 메일.
//             운영자는 대시보드 한 곳에만 쓰고 앱·메일 양쪽에 닿는다.
//   curation_reports INSERT  → 운영자에게 "새 신고". 신고자에게 가는 메일은 없다.
//
// 신고를 왜 여기에 합쳤나:
//   다른 것은 메일 본문 한 덩어리뿐이다. 함수를 하나 더 내면 배포·시크릿 헤더·
//   README가 한 벌씩 늘고 Resend 키는 어차피 공유한다. 갈림길은 payload.table 하나다
//   (webhook 페이로드에 늘 실려 온다. 없으면 옛 호출로 보고 support로 간다).
//
// ⚠️ Apple "이메일 가리기"(@privaterelay.appleid.com) 주소는 Apple에 등록된
//    발신자만 통과시킨다. 도메인 없이 보내는 동안에는 반송될 수 있고, 그래서 앱
//    내 답장이 정본이다(메일은 덤). 반송을 실패로 취급하지 않는다.
//
// 응답:
//   200 { ok: true, sent: boolean }   sent=false는 보낼 대상이 없었다는 뜻(실패 아님)
//   204 (보낼 필요 없는 이벤트 — 답장 없는 update 등)
//   401 { ok: false, error: 'unauthorized' }  웹훅 시크릿 불일치
//   500 { ok: false, error: 'send_failed', detail }  detail = Resend가 준 거절 사유
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

// 앱의 신고 사유(curation_reports.reason)와 같은 다섯 가지. 읽는 사람이 운영자라
// 한국어로 둔다(i18n 번들은 Deno에서 못 읽는다 — REPLY_COPY와 같은 이유).
// 문구는 ko.json `curation.report.reason` 을 줄인 것이다 — 신고자가 고른 말과 어긋나면
// 운영자가 «무엇으로 신고됐는지»를 다르게 읽는다. 앱 문구를 바꾸면 여기도 볼 것.
const REASON_LABEL: Record<string, string> = {
  inappropriate: '부적절한 콘텐츠(욕설·혐오·음란물)',
  copyright: '저작권 침해',
  spam: '스팸 또는 광고',
  misinformation: '잘못된 정보',
  other: '기타',
};

const VISIBILITY_LABEL: Record<string, string> = {
  public: '공유 탭에 공개',
  link: '주소로만(친구 공유)',
  removed: '이미 가려짐',
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

/** 공유 단어장 신고 한 건(`curation_reports`). 덱 제목·작성자는 여기 없다 — 따로 읽는다. */
interface ReportRow {
  id: string;
  theme_id: string;
  reporter_id: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  /** 웹훅이 늘 실려 보낸다. 옛 호출(README의 curl)에는 없어 support로 본다. */
  table?: string;
  record: SupportRow | ReportRow;
  old_record: SupportRow | ReportRow | null;
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

// 'skip' = 보낼 대상이 없어 안 보낸 것(정상). 실패와 구분해야 웹훅이 재시도하지 않는다.
type SendResult =
  | { status: 'sent' }
  | { status: 'skip' }
  | { status: 'failed'; detail: string };

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
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
    // Resend가 거절한 이유(키 무효·미인증 발신자·수신자 제한)는 여기서만 알 수 있다.
    // 로그와 응답 양쪽에 남긴다 — 웹훅 호출 기록만 보고도 원인을 알 수 있어야 한다.
    const detail = `${res.status} ${(await res.text()).slice(0, 400)}`;
    console.error('[notify-support] resend failed', detail);
    return { status: 'failed', detail };
  }
  return { status: 'sent' };
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

async function handleNewMessage(row: SupportRow): Promise<SendResult> {
  const label = CATEGORY_LABEL[row.category] ?? '기타';
  const parts = [`아보카도·${label}`];
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

/**
 * 사용자에게 가는 답장 메일의 껍데기 문구.
 *
 * 운영자에게 가는 알림 메일(위 handleNew)은 한국어로 둔다 — 읽는 사람이 운영자다.
 * 반면 이 메일은 사용자가 읽으므로 사용자의 앱 언어를 따라야 한다. 앱의 i18n 번들은
 * Edge(Deno)에서 못 읽으니 여기 최소한만 둔다.
 */
const REPLY_COPY = {
  ko: {
    subject: '아보카도 — 문의하신 내용에 답장드려요',
    intro: '보내주신 메시지에 답장을 드립니다.',
    yourMessage: '[보내주신 내용]',
    outro: [
      '앱의 설정 › 문의하기에서도 같은 답장을 보실 수 있고,',
      '이어서 하실 말씀이 있으면 거기서 바로 보내주시면 됩니다.',
    ],
    signature: '아보카도',
  },
  en: {
    subject: 'Avocado — a reply to your message',
    intro: "Here's our reply to the message you sent.",
    yourMessage: '[Your message]',
    outro: [
      'You can also read this reply in the app under Settings › Contact us,',
      'and reply back from there if you have anything to add.',
    ],
    signature: 'Avocado',
  },
  es: {
    subject: 'Avocado — respuesta a tu mensaje',
    intro: 'Esta es nuestra respuesta al mensaje que nos enviaste.',
    yourMessage: '[Tu mensaje]',
    outro: [
      'También puedes leer esta respuesta en la app, en Ajustes › Contáctanos,',
      'y escribirnos de nuevo desde ahí si quieres añadir algo.',
    ],
    signature: 'Avocado',
  },
} as const;

/**
 * 답장 언어 — 진단 정보에 담겨 온 앱 언어를 따른다.
 *
 * 모를 때 한국어인 이유: 답장 본문(reply_body)은 운영자가 직접 쓴 글이고 지금은 한국어다.
 * 껍데기만 영어로 감싸면 오히려 어긋나므로, 아는 경우에만 갈라 준다.
 * (앱 쪽 FALLBACK_LOCALE이 en인 것과 방향이 다른데, 그건 "읽을 수라도 있게" 하려는
 *  것이고 여기는 "본문과 맞추려는" 것이라 기준이 다르다.)
 *
 * UI 언어를 늘리면 여기도 함께 늘려야 한다 — 안 늘리면 그 언어 사용자는 조용히 한국어
 * 껍데기를 받는다. 1.4.0이 스페인어를 내보내면서 es가 그 상태였다.
 */
function replyLocale(d: Record<string, unknown> | null): keyof typeof REPLY_COPY {
  const raw = typeof d?.locale === 'string' ? d.locale : '';
  const base = raw.toLowerCase().split(/[-_]/)[0];
  if (base === 'en' || base === 'es') return base;
  return 'ko';
}

async function handleReply(row: SupportRow): Promise<SendResult> {
  // 이메일을 안 적은 사용자에게는 앱이 유일한 경로다 — 메일은 건너뛴다.
  // 실패가 아니라 정상 경로이므로 skip이다(failed로 두면 웹훅이 재시도한다).
  if (!row.reply_email) return { status: 'skip' };

  const c = REPLY_COPY[replyLocale(row.diagnostics)];
  const lines = [
    c.intro,
    '',
    row.reply_body ?? '',
    '',
    '─────────────',
    '',
    c.yourMessage,
    row.body,
    '',
    ...c.outro,
    '',
    c.signature,
  ];

  return await sendEmail({
    to: row.reply_email,
    subject: c.subject,
    text: lines.join('\n'),
    replyTo: NOTIFY_TO,
  });
}

/**
 * 신고 한 건의 맥락. 신고 행에는 theme_id 밖에 없어 «무엇을 신고했는지»를 모른다 —
 * 메일만 보고 조치까지 갈 수 있어야 하므로 덱과 누적 신고 수를 함께 읽는다.
 *
 * RLS 밖(service role)에서 읽는다. 웹훅은 사용자 세션을 들고 오지 않는다.
 */
async function loadReportContext(row: ReportRow) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const [theme, words, total, pending] = await Promise.all([
    admin
      .from('curated_themes')
      .select('id, title, creator_id, creator_name, source_language, target_language, visibility')
      .eq('id', row.theme_id)
      .maybeSingle(),
    admin
      .from('curated_words')
      .select('id', { count: 'exact', head: true })
      .eq('theme_id', row.theme_id),
    admin
      .from('curation_reports')
      .select('id', { count: 'exact', head: true })
      .eq('theme_id', row.theme_id),
    admin
      .from('curation_reports')
      .select('id', { count: 'exact', head: true })
      .eq('theme_id', row.theme_id)
      .eq('status', 'pending'),
  ]);

  return {
    theme: (theme.data ?? null) as {
      id: string;
      title: string | null;
      creator_id: string | null;
      creator_name: string | null;
      source_language: string | null;
      target_language: string | null;
      visibility: string | null;
    } | null,
    // 조회 실패와 «덱이 없음»을 가른다. 둘을 합치면 일시적인 DB 오류가 메일에
    // «이미 지워짐»으로 적혀, 운영자가 조치할 것이 없다고 믿고 넘어간다.
    themeLookupFailed: !!theme.error,
    wordCount: words.count ?? 0,
    totalReports: total.count ?? 0,
    pendingReports: pending.count ?? 0,
  };
}

/**
 * 새 신고 → 운영자 메일. 신고자에게 가는 메일은 없다(답장할 성질의 일이 아니다).
 *
 * 신고자는 user_id 까지만 적는다. 반복 신고를 알아보는 데는 id로 충분하고,
 * 이메일은 조치에 쓰이지 않으면서 열람 흔적만 남는다.
 *
 * 자동 조치(N건이면 자동 가리기)는 일부러 없다 — 오작동하면 남의 콘텐츠가 소리 없이
 * 내려간다. 이 메일이 하는 일은 «사람이 보게 하는 것» 하나다.
 */
async function handleNewReport(row: ReportRow): Promise<SendResult> {
  const { theme, themeLookupFailed, wordCount, totalReports, pendingReports } = await loadReportContext(row);
  const stateLabel = themeLookupFailed
    ? '(조회 실패 — 대시보드에서 확인)'
    : VISIBILITY_LABEL[theme?.visibility ?? ''] ?? theme?.visibility ?? '(덱이 이미 지워짐)';
  const reason = REASON_LABEL[row.reason] ?? row.reason;
  const title = theme?.title?.trim() || row.theme_id;

  const subject = `[아보카도·신고] ${reason} — 「${summarize(title, 30)}」`;

  const langPair = theme?.source_language && theme?.target_language
    ? ` · ${theme.source_language}→${theme.target_language}`
    : '';

  const lines = [
    `사유    ${reason}`,
    `상세    ${row.detail?.trim() || '(없음)'}`,
    '',
    '─────────────',
    '',
    `단어장  ${title} (단어 ${wordCount}개${langPair})`,
    `올린이  ${theme?.creator_name ?? '(이름 없음)'} · ${theme?.creator_id ?? '(알 수 없음)'}`,
    `상태    ${stateLabel}`,
    `누적    이 단어장 신고 ${totalReports}건째 (처리 대기 ${pendingReports}건)`,
    `신고자  ${row.reporter_id}`,
    `접수    ${row.created_at}`,
    '',
    '─────────────',
    '',
    '조치: 앱(관리자 계정) → 공유 단어장 탭 → 덱 상세의 눈가림',
    `      또는  select moderate_curation('${row.theme_id}');`,
    `      되돌리기  select moderate_curation('${row.theme_id}', false);`,
    '',
    '가리면 목록·주소에서 빠지고 이 덱의 대기 신고가 처리로 바뀝니다.',
    '지우지 마세요 — 덱을 지우면 신고 기록이 cascade로 함께 사라집니다.',
    '',
    `${SUPABASE_URL.replace('.supabase.co', '')}  ·  report ${row.id}`,
  ];

  return await sendEmail({ to: NOTIFY_TO, subject, text: lines.join('\n') });
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
    let result: SendResult;

    // 신고 테이블은 insert 만 웹훅에 걸려 있다. 상태를 처리로 바꾸는 update(가리기)는
    // 운영자 자신이 한 일이라 알릴 것이 없다.
    if (payload.table === 'curation_reports') {
      if (payload.type !== 'INSERT') return new Response(null, { status: 204 });
      result = await handleNewReport(payload.record as ReportRow);
    } else if (payload.type === 'INSERT') {
      result = await handleNewMessage(payload.record as SupportRow);
    } else if (payload.type === 'UPDATE') {
      // 답장이 "새로" 채워졌을 때만. 상태만 바꾸는 update로 메일이 또 나가면 안 된다.
      const before = (payload.old_record as SupportRow | null)?.reply_body ?? '';
      const after = (payload.record as SupportRow).reply_body ?? '';
      if (after && after !== before) {
        result = await handleReply(payload.record as SupportRow);
      } else {
        return new Response(null, { status: 204 });
      }
    } else {
      return new Response(null, { status: 204 });
    }

    if (result.status === 'failed') {
      // 메일이 안 나가도 문의 자체는 저장됐다. 웹훅에 실패를 알려 로그에 남긴다.
      return new Response(
        JSON.stringify({ ok: false, error: 'send_failed', detail: result.detail }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ok: true, sent: result.status === 'sent' }), {
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
