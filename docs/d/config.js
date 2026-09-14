// 친구에게 보낸 단어장 랜딩(docs/d/index.html)의 설정.
// 자세한 배경은 같은 폴더의 config.example.js 를 볼 것.
//
// 🔑 넣을 값: Supabase **publishable** 키 — `sb_publishable_…`
//    대시보드 → Project Settings → API Keys → Publishable key 를 복사해 아래 따옴표 안에.
//    공개용 키라 커밋해야 한다(GitHub Pages 가 서빙해야 하므로). 읽을 수 있는 범위는 RLS 가
//    정하고, 친구 공유본은 주소(id)를 아는 사람만 get_shared_deck 으로 열린다.
//
// 🔴 옛 anon 키(eyJ… JWT)를 넣지 말 것 — pre-commit 훅이 막고, 교체하면 service_role 까지
//    같이 바뀌어 배포된 앱이 전부 인증 실패한다.
// 🔴 secret 키(sb_secret_…)를 넣지 말 것 — RLS 를 통째로 우회한다. 랜딩은 받아도 쓰지 않는다.
//
// 비워 두면 랜딩은 죽지 않고 «미리보기 없이 버튼만» 보여 준다.
window.AVOCADO_SHARE_CONFIG = {
  publishableKey: 'sb_publishable_pCmArYh92zc6M2Zp1PoMHQ_oGk7Nfyp',
};
