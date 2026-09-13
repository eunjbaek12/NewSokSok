// 문의 본문 맨 앞에 붙는 «대상» 한 줄.
//
// 다른 화면에서 «이것에 대해 문의»로 들어왔을 때(공식 단어장 상세의 «오류 알리기»)
// 운영자가 무엇에 대한 말인지 알 수 있어야 한다. 그렇다고 본문 입력칸을 미리
// 채우지는 않는다 — 사용자가 지워야 하고, 최소 5자를 미리 채워 버려 **한 글자도
// 안 쓴 문의가 통과한다**. 화면에는 지울 수 있는 «대상» 줄로 보여 주고, 본문에
// 붙이는 건 보낼 때 한 번이다.
//
// 한국어로 고정한 이유: 읽는 사람이 운영자다. 앱 언어를 따르면 같은 종류의 문의가
// 메일함에서 언어마다 다른 말로 서 있게 된다(notify-support 의 운영자 메일과 같은 기준).

export interface SupportTarget {
  /** 사용자에게 보이는 이름(단어장 제목). */
  label: string;
  /** 운영자가 덱을 찾는 id. 없으면 괄호째 빠진다. */
  id?: string;
}

export function composeSupportBody(target: SupportTarget | null, body: string): string {
  const label = target?.label.trim();
  if (!label) return body;
  const id = target?.id?.trim();
  return `[단어장] ${label}${id ? ` (${id})` : ''}\n${body}`;
}
