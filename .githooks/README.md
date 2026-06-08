# Git hooks

커밋에 시크릿이 섞여 올라가는 것을 막는 로컬 훅 모음.

## 활성화 (클론마다 1회)

`core.hooksPath`는 git 로컬 설정이라 클론에 자동 적용되지 않는다. 새로 클론하면 한 번 실행:

```bash
git config core.hooksPath .githooks
```

확인:

```bash
git config core.hooksPath   # .githooks 가 떠야 함
```

## 훅 목록

### `pre-commit` — 시크릿 스캔

스테이징된 **추가 라인만** 검사해, 아래 고신뢰 패턴이 보이면 커밋을 막는다.

- PEM/DER 개인키 본문 (`MII…`), Google API key (`AIza…`), AWS (`AKIA…`),
  GitHub PAT (`ghp_…` / `github_pat_…`), Slack (`xox…`), OpenAI (`sk-…`),
  Apple ASC 자격 (eas.json에 박히는 `ascApiKey…` 계열 식별자/경로), JWT (`eyJ….eyJ….`)

**왜 필요한가**: `.gitignore`는 *파일 단위*만 막는다. `eas.json`처럼 반드시 추적해야 하는
파일 *안에 박힌* 시크릿은 못 막는다. 이 훅이 그 구멍을 메운다.

**우회**: `git commit --no-verify` (드물게만). 라인 단위 예외는 해당 라인에 `secret-ok` 주석.

## 파일 단위 방어는 `.gitignore`가 담당

`.p8 .p12 .key .pem .env google-services.json *.keystore` 등은 이미 `.gitignore`로 제외됨.
새 시크릿 파일 종류가 생기면 `.gitignore`에 먼저 추가하고, 본문 임베드 위험이 있으면 위 PATTERN에도 추가.
