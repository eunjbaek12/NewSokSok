# 큐레이션 덱 서버 이전 — 최종 스펙

작성 2026-08-17. 상태: **설계 확정 · 미착수.**

공식 큐레이션 덱 64개를 앱 번들에서 빼고 서버에서 받는다. 커뮤니티 덱이 쓰는
`curated_themes`를 재사용하지 않고 **전용 테이블 2개를 신설**한다.

---

## 1. 왜 별도 테이블인가 (2026-08-17 검토 결론)

재사용안은 네 가지에서 막힌다. 첫째가 단독으로 결정적이다.

| # | 사실 | 근거 |
|---|---|---|
| 1 | **구버전 앱을 되돌릴 수 없다** | 스토어 라이브(1.4.0, `fdcfc9d`)의 `fetchCloudCurations`가 `curated_themes`를 **필터 없이 전량** 조회한다. RLS SELECT 정책은 `qual = true`. `lib/supabase/client.ts`에 커스텀 헤더가 없어 **서버는 요청자의 앱 버전을 알 수 없다** → 서버 쪽 필터로 신·구버전을 가를 길이 없다. 공식 64덱을 넣는 순간 현재 커뮤니티 덱 **2개**(단어 125개)가 63:2로 덮인다(`created_at desc` 정렬이라 맨 위 전부). |
| 2 | 용량 트리거가 시딩을 거부한다 | `trg_curated_themes_count_limit`(50/사용자) · `trg_curated_words_count_limit`(500/덱). 64덱 > 50이고 500단어 초과 덱이 6개다. 예외를 파면 그게 UGC 방어의 구멍이 된다. |
| 3 | 스키마가 안 맞는다 | `curated_themes`에 `category`·`level`·공식 플래그 없음. `curated_words`에 **`position`(순서)**·`senses` 없음. 순서 부재는 NGSL·빈도순 덱에 치명적이다. 컬럼을 추가하면 커뮤니티 행엔 전부 NULL, 공식 행엔 `creator_id`/`creator_name`이 무의미. |
| 4 | 정책이 갈린다 | `curation_reports.theme_id` FK · `themes_delete_owner`(creator/admin 삭제) · 작성자 표시 · 용량 제한은 전부 UGC용이다. 공식 덱에 신고 버튼이 붙고, 소유 계정에서 실수 삭제가 가능해진다. |

반대편도 따졌고 전부 실패한다:

- **`is_official` 컬럼 + 앱 필터** → 신버전만 필터, 구버전은 여전히 전량 조회. #1 미해결.
- **RLS로 차단** → 앱 버전 식별 불가라 신버전도 같이 막힌다. 미해결.
- **테이블 rename + 동명 뷰로 바꿔치기** → 노출은 막히나 INSERT/DELETE를 뷰 경유로 재구성해야 하고, 행 2개를 위해 배포된 앱의 쓰기 경로를 건드린다. 게다가 결론이 "공식 덱은 `curated_themes`에 안 들어간다"로 같은 곳에 도착한다.

**재사용해서 아끼는 것은 `create table` 2개와 RLS 정책 2개뿐이다.** 비대칭이 명백하다.

> ⚠️ 지난 세션 기록의 "구버전 앱은 이 테이블의 존재를 모르므로 서버를 먼저 채워도 무해하다"는
> **틀렸다.** 구버전도 커뮤니티 탭에서 `curated_themes`를 전량 읽는다. 별도 테이블에서는
> 이 전제가 비로소 참이 된다 — 구버전은 새 테이블 이름을 모른다.

---

## 2. 실측 (2026-08-17, `constants/curationData.ts` 파싱)

```
덱 64개 · 단어 13,874개
목록 메타만(words 제외)      27.3 KB   ← 카탈로그 페이로드
전체 JSON                     5.90 MB   (소스 파일 8.32MB — 차이 2.4MB가 공백)
덱 크기  평균 94KB / 중앙값 20KB / 최대 529KB(BSL 1,000단어)
500단어 초과 덱 6개 · 최대 1,001단어
```

평균과 중앙값이 5배 차이 난다 — **덱 대부분은 20KB이고 큰 것 6개가 평균을 끌어올린다.**
"덱 하나 94KB"로 설계하면 과대평가다.

단어 필드 충족률: `term`·`meaningKr`·`exampleEn`·`exampleKr`·`tags` 100% / `pos` 99.9% /
`definition` 96.3%(**빈칸 507개**) / `phonetic` 95.4% / **`senses` 0개**(덱에 아예 없다).

덱 메타: 64덱 전부 `category`·`level`·`description`·`sourceLanguage`·`targetLanguage` 보유.
`isCurated`·`isVisible`은 64덱 전부 같은 값 → **서버 컬럼 불필요**.
`category` 10종 · `level` 3종 · 언어쌍 10종(en>ko 35, ko>en 14, zh>ko 4, ja>ko 3, ko>vi 2, ko>ko 2, 나머지 1씩).

---

## 3. 서버 스키마 [선택 불필요]

```sql
create table public.official_themes (
  id              text primary key,          -- 번들 slug 그대로 (curated-ngsl-1)
  title           text not null,
  icon            text,
  description     text,
  category        text,
  level           text,                      -- beginner | intermediate | advanced
  source_language text not null,
  target_language text not null,
  word_count      int  not null,             -- 카드가 쓴다. 목록에 단어를 안 보내려면 필수
  top_tags        jsonb not null default '[]'::jsonb,  -- 상동 (아래 ⚠️)
  position        int  not null default 0,   -- 목록 정렬(운영자 지정)
  is_published    boolean not null default false,
  content_version int  not null default 1,   -- 덱 내용이 바뀌면 +1 → 앱 캐시 무효화
  created_at      bigint not null,
  updated_at      bigint not null
);

create table public.official_words (
  id            text primary key,
  theme_id      text not null references public.official_themes(id) on delete cascade,
  position      int  not null,               -- 덱 안 순서 (빈도순 보존)
  term          text not null,
  definition    text,
  meaning_kr    text,
  example_en    text,
  example_kr    text,
  pronunciation text,
  pos           text,
  tags          jsonb not null default '[]'::jsonb,
  senses        jsonb                        -- 신규. 덱엔 없고 시딩이 캐시에서 채운다
);

create index official_words_theme_pos on public.official_words (theme_id, position);

alter table public.official_themes enable row level security;
alter table public.official_words  enable row level security;

-- 게스트(anon)도 읽어야 한다. 공개된 덱만.
create policy official_themes_select on public.official_themes
  for select to anon, authenticated using (is_published);
create policy official_words_select on public.official_words
  for select to anon, authenticated using (
    exists (select 1 from public.official_themes t
             where t.id = official_words.theme_id and t.is_published));

-- 쓰기 정책은 만들지 않는다 → service_role(RLS 우회)만 쓸 수 있다.
-- 사용자 계정으로는 수정·삭제가 원천 불가하고, 용량 트리거도 필요 없다.
```

정한 이유:

- **id를 slug로 유지** — 시딩 멱등성(재실행해도 같은 행), 로그 추적, 커뮤니티 uuid와 눈으로 구분.
  `curated_themes.id`도 `text`라 타입 관행도 같다.
- **`word_count`·`top_tags` 비정규화** — ⚠️ 목록 카드가 `getTopTags(theme)`로 **단어 tags를 집계**하고
  (`screen.tsx:1372`) 단어 수를 표시한다(`:1435`). 이걸 비정규화하지 않으면 목록을 그리는 데
  단어 전량이 필요해져 "목록 27KB" 설계가 무너진다.
- **`position` 두 곳** — 덱 목록 순서와 덱 안 단어 순서. 후자가 없으면 PostgREST 반환 순서가
  보장되지 않아 빈도순 덱이 뒤섞인다.
- **용량 트리거 없음** — 운영자만 쓰므로 방어 대상이 아니다.
- **`content_version`** — 덱을 고쳤을 때 앱이 캐시를 버릴 근거. 카탈로그에 실려 오므로 무료.

---

## 4. 앱 변경 [선택 불필요] — 반드시 한 릴리스에

```
features/curation/catalog.ts   (신설)  카탈로그 fetch + AsyncStorage 캐시
features/curation/presets.ts   (교체)  번들 동적 import → 서버 카탈로그
features/curation/screen.tsx   (수정)  덱 상세 진입 시 단어를 받아 온다 + 로딩/실패 UI
constants/curationData.ts      (앱에서 import 제거)  파일은 시딩 입력으로 저장소 잔류
```

번들에서 빠지는 조건은 **앱 코드 어디서도 import하지 않는 것**이다. 현재 유일한 진입점은
`presets.ts:33`의 동적 import 하나뿐임을 확인했다(`scripts/`·`__tests__/`는 번들에 안 들어간다).

```ts
// 두 단계 조회
fetchOfficialCatalog(): Promise<OfficialThemeMeta[]>      // 27KB, 단어 없음
fetchOfficialDeck(themeId): Promise<OfficialWord[]>       // 중앙값 20KB, 최대 529KB
```

⚠️ **타입 작업이 이 변경의 실제 난이도다.** `screen.tsx:562`가 공식·커뮤니티 두 소스를 같은
배열로 합쳐 쓰는데(`sourceThemes`), 지금은 양쪽 다 `VocaList`(= `words` 필수)다. 공식 목록에
단어가 없어지므로 카드가 쓰는 필드만 모은 공통 타입을 만들고 **커뮤니티 덱도 거기에 매핑**해야
한다 — 한쪽만 바꾸면 카드 렌더가 두 갈래로 갈라진다.

카드가 실제로 쓰는 필드: `id` `title` `icon` `level` `category` `description`
`sourceLanguage` `targetLanguage` `wordCount` `topTags` / 커뮤니티 전용 `creatorId` `creatorName`.
(`downloadCount`는 `curated_themes`에 **컬럼 자체가 없어** 지금껏 한 번도 표시된 적이 없다 —
이번에 지우거나 그대로 두거나, 이 스펙 밖의 별건.)

**카탈로그 캐시**: AsyncStorage 키 하나(`@soksok_curation_catalog`)에
`{ schemaVersion, fetchedAt, themes }`. 27KB면 충분하고 SQLite를 쓸 이유가 없다.
큐레이션 탭 진입 시 **캐시를 즉시 그리고 병렬로 갱신**한다(stale-while-revalidate).
앱 시작 경로에는 절대 넣지 않는다 — `presets.ts`가 지연 로딩으로 지켜 온 콜드 스타트 0을 유지.

**덱 내용**: 세션 메모리 Map 캐시만 둔다(같은 덱을 열었다 닫았다 할 때). 디스크 캐시는 두지
않는다 — 아래 트래픽 계산상 필요가 없다.

---

## 5. 시딩 [선택 불필요]

`scripts/seed-official-decks.ts` — 입력은 `constants/curationData.ts` + Supabase `enrich_cache`.

- `definition`이 비었거나(507) `term` 복사본이면(4,400) **캐시 것으로 교체**
- `senses` 추가(캐시 보유 6,383)
- **예문·발음·품사는 덱 것 그대로**(2026-08-17 결정)
- `word_count`·`top_tags`·`position`을 계산해 저장
- 캐시 커버리지 93%(12,968/13,874), ko>en은 100%
- service_role 키로 실행(`.env.local`, 커밋 금지 — `docs/secrets-management.md`)
- **멱등**: 덱 단위로 upsert + 단어는 트랜잭션 안에서 전량 교체(delete → insert)
- `is_published = false`로 넣고 검증이 끝난 뒤 true

---

## 6. 릴리스 순서 [선택 불필요]

```
① 서버 마이그레이션 + 시딩 (is_published=false)
② 검증 쿼리 통과 → is_published=true
③ 앱 릴리스 (§4의 변경 전부를 한 번에)
```

②까지는 구버전 앱에 **영향 0**이다 — 새 테이블 이름을 모르고, 커뮤니티 조회는 여전히
`curated_themes`만 본다. §1에서 재사용안이 깨졌던 바로 그 지점이 여기서는 성립한다.

앱 쪽 변경을 쪼개면 안 된다: 번들 제거만 나가면 덱이 사라진 앱이 되고, 다운로드 경로만 나가면
받을 데이터가 없다.

**롤백**: 앱은 스토어라 되돌릴 수 없다. 서버는 `is_published=false`로 즉시 숨길 수 있지만
그러면 신버전의 큐레이션 탭이 빈다 → 실질 롤백 수단이 없으므로 ②의 검증이 유일한 안전장치다.

---

## 7. 얻는 것 / 잃는 것

**얻는 것**

- 번들에서 소스 8.32MB(JSON 실데이터 5.90MB) 제거.
  ⚠️ **설치 크기 감소분은 미측정이다** — Hermes 바이트코드로 컴파일·압축되므로 8.3MB가 그대로
  줄지 않는다. 빌드 전후로 실측할 것.
- **덱 수정이 앱 릴리스와 무관해진다** — definition·senses·단어 재선정·오타까지.
- 새 덱을 심사 없이 추가.
- `presets.ts`가 경고한 "덱을 늘리면 앱이 느려지는 구조"가 사라진다(3월 149KB → 8월 8,130KB, 56배).

**잃는 것**

- 오프라인에서 **덱 내용 훑어보기** 불가. 목록은 캐시로 보인다.
- 서버 장애 시 큐레이션 탭이 빈다(그 상황이면 로그인·동기화·AI가 이미 전부 죽어 있다).
- 앱 설치 후 첫 진입에 네트워크가 필요하다.
- 이미 가져간 단어장은 무관 — 로컬 SQLite에 복사본으로 있고 서버 이전이 건드리지 않는다.

**트래픽**: 임포트 실적 최근 30일 51건 × 중앙값 20KB ≈ **1MB/월**(큰 덱만 받는 최악의 경우도
51 × 529KB = 27MB). 카탈로그는 DAU 10 × 30일 × 27KB ≈ 8MB/월. 무료 티어 5GB/월 대비
100배 성장해도 여유다 → **캐싱 최적화는 불필요**.

---

## 8. 남은 결정 — **2026-08-17 전부 확정**

| # | 결정 | 결론 |
|---|---|---|
| 1 | 단어 **컬럼명** | **`meaning_kr`/`example_en` 유지.** 중립화(`meaning`/`example_source`)를 권고했다가 철회 — `meaningKr`이 앱 코드 459곳에 박혀 있어, 서버 컬럼만 바꾸면 `curated_words`와 매핑 코드가 두 벌로 갈린다. 이름이 다국어 덱에서 거짓인 것은 **알면서 감수한다** |
| 2 | 카탈로그 **갱신 주기** | 화면 진입 시 캐시 즉시 표시 + 병렬 갱신(SWR). 27KB라 TTL 불필요 |
| 3 | 덱 내용 **디스크 캐시** | 두지 않는다. §7 트래픽상 실익이 없고 `content_version` 비교 코드만 는다 |
| 4 | 이미 가져간 단어장 **소급** | 하지 않는다. 출처 필드가 없어 기존분은 소급 불가이고, 누적 임포트 78건/30명에 장치를 만들 일이 아니다 |
| 5 | 오프라인용 **번들 폴백 덱** | 남기지 않는다(0MB 유지) |

---

## 9. 검증 체크리스트

**시딩 직후(서버)**
- [ ] `official_themes` 64행 · `official_words` 13,874행
- [ ] 언어쌍 분포가 §2와 일치 (en>ko 35 · ko>en 14 · zh>ko 4 …)
- [ ] `word_count`가 실제 단어 수와 일치하는 덱이 64/64
- [ ] `definition` 빈칸 0 (507개가 캐시로 채워졌는지)
- [ ] `senses` 보유 6,383행
- [ ] `position`이 덱마다 0..n-1 연속 (중복·구멍 없음)
- [ ] anon 키로 SELECT 성공 / `is_published=false` 덱은 안 보임
- [ ] anon·authenticated 키로 INSERT·DELETE 시도 → 전부 거부

**앱(실기)**
- [ ] 큐레이션 탭 첫 진입에 목록이 뜬다 / 두 번째부터 즉시(캐시)
- [ ] 비행기 모드 — 목록은 보이고, 덱을 열면 실패 안내 + 재시도
- [ ] 캐시 없이 비행기 모드 첫 진입 — 빈 화면이 아니라 안내가 뜬다
- [ ] 1,000단어 덱(BSL) 열기 → 로딩 표시 후 정상, 순서가 빈도순
- [ ] 게스트(비로그인)로 목록·덱·가져오기 전부 동작
- [ ] 가져오기 후 단어장 내용이 이전과 동일(definition·senses 포함)
- [ ] 커뮤니티 탭에 공식 덱이 **안 보인다**
- [ ] 콜드 스타트가 느려지지 않았다(큐레이션 탭 미진입 기준)
- [ ] 빌드 산출물 크기 전후 비교(§7의 미측정 항목)
