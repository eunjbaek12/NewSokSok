# notify-support

앱 내 문의(`support_messages`)를 운영자 메일로 알리고, 운영자가 쓴 답장을 사용자
메일로 보낸다. 호출자는 사용자가 아니라 **Supabase Database Webhook**이다.

## 왜 이 구조인가

앱은 `support_messages`에 행 하나를 넣는 것으로 끝난다. 메일 발송까지 앱이 지면
"전송은 됐는데 알림만 실패한" 상태를 사용자에게 실패로 보여주게 된다. insert만
성공하면 알림은 반드시 나가도록 DB에 책임을 넘긴다.

답장도 같은 이유로 **운영자는 한 곳에만 쓴다** — 대시보드에서 `reply_body`를 채우면
update 웹훅이 이 함수를 다시 태워 메일로도 나간다. 앱에는 배지가 뜬다.

## 설정 순서

### 1. Resend

도메인 없이 시작할 수 있다. 계정을 만들면 `onboarding@resend.dev`로 **가입 계정
이메일에만** 보낼 수 있는데, 수신자가 운영자 한 명이라 그 제약이 그대로 맞는다.
무료 한도는 월 3,000통.

⚠️ 그래서 **`SUPPORT_NOTIFY_TO`는 Resend 가입 이메일과 같아야 한다.** 다르면 전부
403으로 거절당한다(현재 계정은 `mtgirltreeguy@gmail.com`). 앱에 박힌 `SUPPORT_EMAIL`
(전송 실패 시 mailto 폴백)은 스토어 공개 주소라 이것과 별개다.

사용자 답장까지 보내려면 도메인 인증이 필요하다. **도메인이 없는 동안 사용자에게
가는 답장 메일은 한 통도 못 나간다** — 반송이 아니라 Resend가 발송 자체를 거절한다:

```
403 validation_error — You can only send testing emails to your own email address
```

그래도 **앱 내 답장이 정본이라 사용자는 답을 받는다.** 함수는 이 실패를 500과
`detail`로 돌려주므로, 웹훅 호출 기록만 봐도 원인을 알 수 있다.

### 2. Secrets

```bash
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set SUPPORT_NOTIFY_TO=<운영자 메일>
supabase secrets set SUPPORT_FROM=onboarding@resend.dev   # 도메인 인증 후 교체
supabase secrets set SUPPORT_WEBHOOK_SECRET=<임의의 긴 문자열>
```

`docs/secrets-management.md`의 서버 전용 티어에 등록한다. 앱 번들에 절대 넣지 않는다.

### 3. 배포

```bash
supabase functions deploy notify-support --no-verify-jwt
```

`--no-verify-jwt`가 필요한 이유: 웹훅은 사용자 JWT를 들고 오지 않는다. 대신
`x-support-secret` 헤더를 위 시크릿과 대조해 검증한다.

### 4. Database Webhook 두 개

Supabase Dashboard → Database → Webhooks에서 만든다. 둘 다 같은 함수를 가리킨다.

| | 새 문의 | 답장 |
|---|---|---|
| Table | `public.support_messages` | `public.support_messages` |
| Events | `INSERT` | `UPDATE` |
| Type | HTTP Request → POST | HTTP Request → POST |
| URL | `https://<project>.supabase.co/functions/v1/notify-support` | 같음 |
| Headers | `x-support-secret: <시크릿>` | 같음 |

UPDATE 웹훅은 매 수정마다 호출되지만, 함수가 `reply_body`가 **새로** 채워졌을
때만 메일을 보내고 나머지는 204로 흘린다(상태만 바꿔도 메일이 또 나가면 안 된다).

## 확인

```bash
curl -X POST https://<project>.supabase.co/functions/v1/notify-support \
  -H 'Content-Type: application/json' \
  -H 'x-support-secret: <시크릿>' \
  -d '{"type":"INSERT","record":{"id":"test","parent_id":null,"user_id":null,
       "category":"bug","body":"테스트 문의입니다","reply_email":null,
       "diagnostics":null,"reply_body":null,"created_at":"2026-07-28T00:00:00Z"}}'
```

`{"ok":true,"sent":true}`가 오고 운영자 메일함에 `[쏙쏙보카·버그·회신불가]`로 시작하는
메일이 도착하면 정상이다. 실패는 Edge Logs에 `[notify-support]`로 남는다.

## 운영

- 답장은 **대시보드 `reply_body`에** 쓴다. 알림 메일에 그대로 답장하면 앱에는 안 뜨고,
  이메일을 안 적은 사용자에게는 아예 가지 않는다.
- `reply_body`를 채우면 트리거가 `replied_at`·`status`를 함께 옮기고 `read_at`을
  비운다(= 앱 배지가 다시 켜진다). 상태를 손으로 만질 필요가 없다.
- 남용 방어는 DB 트리거의 하루 5건 하나뿐이다. 앱에는 쿨다운이 없다 — 봇은 앱 화면을
  거치지 않으므로 클라이언트 제한은 막고 싶은 것을 못 막는다.
