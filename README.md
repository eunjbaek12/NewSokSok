# 쏙쏙 보카 (NewSokSok)

단어 학습을 도와주는 모바일 애플리케이션 프로젝트입니다. (React Native / Expo + Express Backend)

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: React Native, Expo, React Navigation (expo-router)
- **Backend / API**: Express.js, Node.js, TypeScript
- **Database**: PostgreSQL (`pg`), Drizzle ORM
- **AI / 기타**: Google Gemini API, React Query (`@tanstack/react-query`)
- **Package Manager**: pnpm

## 📋 사전 요구 사항 (Prerequisites)

- Node.js (버전 20 이상 권장)
- pnpm (`npm install -g pnpm`으로 전역 설치 가능)

## 🚀 설치 및 초기 설정 (Setup)

1. **의존성 설치**

   > **💡 중요**: Metro 번들러가 pnpm의 심링크 구조를 완벽하게 인식하지 못하는 문제를 해결하기 위해, 프로젝트 루트의 `.npmrc`에 기본적으로 호이스팅(`node-linker=hoisted`) 구성이 적용되어 있습니다. 다른 패키지 매니저(npm, yarn)를 사용하지 마시고 항상 **pnpm**을 사용해 주세요.

   ```bash
   pnpm install
   ```
   * 설치 과정 중 `patch-package`에 의해 일부 패키지 패치가 자동으로 적용됩니다.

2. **개발 서버 실행**

   프론트엔드(Expo Metro 번들러: 8081 포트)와 백엔드(Express 서버: 5000 포트) 개발 서버를 백그라운드에서 동시에 구동합니다.

   ```bash
   pnpm dev
   ```

   > ⚠️ **실행 오류(에러)가 발생하는 경우**:
   > 터미널에서 `Error: listen EADDRINUSE: address already in use 0.0.0.0:5000` 또는 `Port 8081 is being used` 경고가 발생한다면, **기존에 실행해둔 동일한 서버 프로세스(터미널)가 뒷단에 켜져 있는 것**입니다. 백그라운드 프로세스나 기존 터미널을 완전히 종료한 후(Ctrl + C) 재실행해야 합니다.

3. **데이터베이스 마이그레이션 적용 (필요할 경우)**

   Drizzle ORM을 통해 정의된 테이블 스키마를 연결된 DB에 반영하려면 아래 명령어를 사용합니다. (사전에 환경 변수에 적절한 DB 연결 정보가 구성되어 있어야 합니다.)

   ```bash
   pnpm run db:push
   ```

## 📜 주요 명령어 일람 (Available Scripts)

상황에 맞게 명령어들을 부분적으로도 실행할 수 있습니다.

- `pnpm dev`: 프론트엔드와 백엔드를 동시에 실행합니다 (`concurrently` 사용)
- `pnpm start`: 프론트엔드 (Expo Metro) 전용 서버만 구동합니다
- `pnpm run server:dev`: 백엔드 (Express `server/index.ts`) 전용 서버만 구동합니다
- `pnpm run server:build`: 백엔드 코드를 `esbuild`로 컴파일합니다
- `pnpm run lint`: 프로젝트 전체에 걸쳐 코드 스타일 및 ESLint 검사를 실행합니다
- `pnpm run lint:fix`: 발견된 린트 에러를 자동으로 수정합니다
