// 친구에게 보낸 단어장 랜딩(docs/d/index.html)의 설정.
//
// 이 파일을 같은 폴더에 config.js 로 복사하고 publishableKey 에 값을 넣는다. config.js 는
// 커밋한다 — GitHub Pages 가 서빙해야 하므로. 없으면 랜딩은 미리보기 없이 버튼만 보여 준다.
//
// 🔑 넣는 값은 Supabase 의 **publishable 키**(sb_publishable_…)다.
//    대시보드 → Project Settings → API Keys → Publishable key.
//    공개용으로 만든 키라 커밋해도 된다(읽을 수 있는 건 RLS 가 정한다 — 목록에 안 뜨는 단어장은
//    get_shared_deck 으로 id 를 알 때만 열린다). 옛 anon 키와 달리 **앱 번들과 따로 교체**되므로,
//    여기서 새어도 배포된 앱은 깨지지 않는다.
// 🔴 옛 anon 키(eyJ…)는 넣지 말 것 — pre-commit 훅이 JWT 를 막고, 교체하면 배포된 앱이 전부 깨진다.
// 🔴 secret 키(sb_secret_…)는 절대 넣지 말 것 — RLS 를 통째로 우회한다(랜딩은 받아도 쓰지 않는다).
window.AVOCADO_SHARE_CONFIG = {
  publishableKey: '',
};
