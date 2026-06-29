# Trove 하이라이트 + 주석 시스템 — 설계 스펙

- 날짜: 2026-06-29
- 대상 저장소: `gdoc/` (viewer · cli · supabase)
- 후속: 이 스펙 → 구현 플랜(writing-plans) → 구현

## 1. 목적

Trove 뷰어에서 문서 본문 텍스트를 **드래그로 하이라이트**하고, **왜 표시했는지 짧은 설명(키워드 칩 + 자유 메모)** 을 달 수 있게 한다. 하이라이트는 헤더와 사이드바에서 한눈에 보고 **클릭하면 본문 위치로 스크롤**된다. 이 하이라이트들은 추후 `--instruction` 기반 LLM 편집의 입력(지시)으로 쓰인다.

이번 스펙의 범위는 **하이라이트/주석 시스템 + full-replace 정리 훅**까지다. `--instruction` 편집 자체는 별도 스펙으로 분리하며, 여기서는 그쪽이 호출할 계약(`consumeHighlights`)의 시그니처만 정의한다.

## 2. 제약 / 전제

- **로그인(소유자 인증) 시에만** 하이라이트 UI와 데이터가 보인다. 비로그인은 행 자체가 전달되지 않는다(RLS).
- 하이라이트는 **유저 ID(`owner_uid`) 기반으로 누적**된다. 기존 owner 모델(`auth.uid() = owner_uid`)을 그대로 따른다.
- 문서 본문은 **sandbox `<iframe>`(blob URL)** 안에서 렌더된다(`viewer/src/App.tsx`). 뷰어는 이미 `injectThemeBridge`(`viewer/src/useDocHtml.ts`)로 문서 HTML에 스크립트를 주입하고 `postMessage`로 통신한다 — 하이라이트도 같은 패턴을 따른다.
- 문서마다 HTML 구조가 다르다(이질적 템플릿). 앵커는 구조가 아니라 텍스트 기반이어야 한다.

## 3. 핵심 결정

1. **주입형 highlight-bridge 스크립트** — `injectThemeBridge` 옆에 `injectHighlightBridge` 추가. iframe 안에서 선택 감지·`<mark>` 렌더·클릭 감지를 담당하고 부모와 `postMessage`로 통신. 부모(React)는 저장·UI·권한을 담당. (대안: 부모가 iframe DOM 직접 접근 — same-origin 의존이라 취약, 기각.)
2. **텍스트-인용 앵커(W3C/Hypothesis 방식)** — `exact + prefix + suffix(+ 폴백 위치)` 저장 후 렌더 시 본문 텍스트 검색으로 재배치. 이질적 HTML·소소한 편집에 강함. (대안: 문자 오프셋 / DOM XPath — 둘 다 구조·편집에 취약, 기각.)

## 4. 수명(lifecycle) 규칙

- 하이라이트는 **기본 영속**(유저 ID 기반 누적, 문서에 계속 남음).
- 키워드 분류:
  - **액션 태그** `편집`, `삭제` — "처리 대기" 의미.
  - **정보 태그** `궁금`, `중요`, `확인` — 문서 변경과 무관하게 영속.
- **(B) 타깃 편집 소비**: 미래 `--instruction` 편집에 *실제 사용된* 액션 하이라이트만 삭제. 안 쓴 건 유지. → 이번 스펙은 계약만 정의.
- **Full replace = 전부 삭제**: 문서 전체 HTML 교체(`edit --file`, 재업로드) 시 그 문서의 하이라이트 전부 삭제(앵커가 통째로 무효화). `editDoc`가 이동을 겸하는 경우(meta path 변경)에도 **내용 교체이므로 삭제**한다.
- **메타 전용 이동 = 유지**: `mv`/`move-file`/`folder rename`(= `manage.ts`의 `updateRemoteDoc`, **내용 불변**)은 하이라이트를 삭제하지 않는다. `doc_id` FK `on update cascade`로 문서를 따라간다.

## 5. 키워드 세트 (코드 상수, 변경 용이)

| 키워드 | 분류 | 의미 |
|---|---|---|
| `편집` | 액션 | 이 부분을 다시 써달라/고쳐달라 |
| `삭제` | 액션 | 이 부분을 지워달라 |
| `궁금` | 정보 | 왜 이런지 질문/의문 |
| `중요` | 정보 | 강조/기억 |
| `확인` | 정보 | 나중에 검토/팩트체크 |

- 모든 하이라이트에 **자유 텍스트 메모**를 추가로 달 수 있다.
- 추가된 키워드는 **칩**으로 표시(✕로 제거). 본문 마크 색: 액션=앰버, 정보=블루 계열.

## 6. 아키텍처 / 컴포넌트

```
┌─ Trove 뷰어 (부모 React) ──────────────────────────────┐
│  헤더 하이라이트 스트립 · 사이드바 네비 · 선택 팝오버 · 주석 에디터 │
│  ↕ Supabase (highlights 테이블, RLS)                    │
│  ↕ postMessage                                          │
│  ┌─ iframe (문서 본문, blob) ───────────────┐            │
│  │  highlight-bridge.js (주입)              │            │
│  │   - 드래그/선택 감지 → 앵커 계산           │            │
│  │   - <mark data-hl-id> 렌더 / 클릭 감지     │            │
│  └──────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────┘
```

- **iframe 스크립트**: 선택·렌더·좌표만. 상태 없음(부모가 진실의 원천).
- **부모**: 저장(Supabase), 헤더 스트립, 사이드바 목록, 팝오버/에디터, 권한 게이트.

## 7. 데이터 모델 — 마이그레이션 `0008_highlights.sql`

```sql
create table highlights (
  id          uuid primary key default gen_random_uuid(),
  doc_id      text not null references documents(id) on delete cascade on update cascade,
  owner_uid   uuid not null,
  -- 텍스트-인용 앵커
  exact       text not null,        -- 선택된 텍스트
  prefix      text,                 -- 앞 맥락(~32자)
  suffix      text,                 -- 뒤 맥락(~32자)
  text_pos    int,                  -- 폴백 위치 힌트
  -- 주석
  note        text,                 -- 자유 메모
  keywords    text[] not null default '{}',  -- 편집·삭제·궁금·중요·확인 중
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table highlights enable row level security;
-- 소유자 전용: 조회/생성/수정/삭제 모두 owner_uid = auth.uid()
create policy highlights_owner_all on highlights
  for all using (auth.uid() = owner_uid) with check (auth.uid() = owner_uid);

create index highlights_doc_owner_idx on highlights (doc_id, owner_uid);
```

- `on delete cascade`: 문서 삭제 시 정리. `on update cascade`: 문서 이동(id 변경) 시 따라감.

## 8. postMessage 프로토콜

**부모 → iframe**
- `hl:set-enabled` `{ on: boolean }` — 로그인 여부에 따라 선택/팝오버 활성화
- `hl:render` `{ highlights: [{ id, exact, prefix, suffix, keywords }] }` — 저장된 것 그리기(재앵커)
- `hl:scroll-to` `{ id }` — 해당 마크로 스크롤 + 깜빡임
- `hl:remove` `{ id }` — 마크 제거

**iframe → 부모**
- `hl:selected` `{ anchor: { exact, prefix, suffix, textPos }, rect }` — 드래그 끝 → 부모가 rect 위에 팝오버 표시
- `hl:clicked` `{ id, rect }` — 기존 마크 클릭 → 부모가 해당 주석 에디터 열기 + 사이드바 강조
- `hl:anchored` `{ id, ok: boolean }` — 렌더 시 재배치 성공/실패(실패=고아) 보고

`rect`는 iframe 내부 좌표 → 부모가 iframe의 bounding offset을 더해 오버레이 위치 계산.

## 9. 앵커링 알고리즘 (텍스트-인용)

- **선택 시**: `Range`에서 `exact`(선택 문자열), `prefix`/`suffix`(앞뒤 ~32자), `text_pos`(문서 평문 내 문자 오프셋, 폴백) 추출.
- **렌더 시**: 문서 평문에서 `prefix + exact + suffix`로 검색 →
  - 유일 매치 → 그 Range를 `<mark data-hl-id>`로 래핑.
  - 다중 매치 → prefix/suffix/`text_pos`로 판별.
  - 매치 없음 → `hl:anchored {ok:false}` → 부모가 **고아(orphaned)** 로 표시.
- 순수 함수(`extractAnchor(range)`, `locateAnchor(text, anchor)`)로 분리 → 단위 테스트 가능.

## 10. UI (로그인 시에만 노출)

### 10.1 선택 팝오버 (드래그 직후, 부모 오버레이)
```
        ┌──────────────────────────────────┐
 …텍스트│ 🔆하이라이트  [편집][삭제][궁금][중요][확인] │텍스트…
        └──────────────────────────────────┘
```
- `🔆하이라이트`: 키워드 없이 생성 + 주석 에디터 열기.
- 키워드 버튼 직접 클릭: 그 키워드가 달린 하이라이트 즉시 생성(2클릭 완료).

### 10.2 주석 에디터 (생성 직후 / 기존 마크·목록 클릭 시 — 생성·수정 공용)
```
┌─ 하이라이트 ───────────────────────────┐
│ "…선택된 텍스트 미리보기…"               │
│ 키워드  [편집][삭제][궁금][중요][확인]    │ ← 토글 버튼
│ 달림    (삭제 ✕) (궁금 ✕)               │ ← 칩, ✕로 제거
│ 메모    [_________________________]     │ ← 자유 텍스트
│                      [저장]   [삭제]    │
└─────────────────────────────────────────┘
```
- **저장 후에도 수정 가능**: 마크/목록 항목 클릭 → 기존 값 프리필 → 저장 시 행 갱신(`updated_at`).

### 10.3 헤더 하이라이트 스트립 (문서 헤더, 컴팩트)
```
[tech-note][공개]  ✎편집   🔆 3   (삭제)"이 단락…"  (궁금)"왜…"  (중요)"핵심…"
                            └ 클릭 → 본문 위치로 스크롤 + 마크 깜빡임
```
- 많으면 `🔆 N`만 보이고 클릭 시 목록 팝오버.

### 10.4 사이드바 하이라이트 목록 (문서 열림 + 로그인)
```
사이드바
 [트리][카드][그래프]
 ── 🔆 하이라이트 (3) ──────────
  (삭제) 이 단락은 불필요…           ← 클릭 → 스크롤 + 플래시
  (궁금) 왜 이렇게 동작하나…
  (편집) 표현 어색함  ⚠고아           ← 앵커 재배치 실패 시 회색 + ⚠
```
- 헤더 스트립과 동일 데이터·동일 클릭→스크롤. 헤더=한눈/빠른 점프, 사이드바=메모까지 보이는 풀 목록.

## 11. 저장 & 권한

- 뷰어가 **supabase-js로 `highlights`를 직접 CRUD**(Edge Function 불필요). 브라우저엔 anon 키 + 사용자 JWT만, **RLS가 강제**. 서비스 키 노출 없음.
- **로그인 게이트**: 세션 없으면 → 하이라이트 fetch 안 함, 브리지 `hl:set-enabled{off}`, 팝오버·헤더 스트립·사이드바 섹션 숨김.
- CRUD: 문서 열림 + 로그인 시 로드 → 생성(insert) → 수정(update) → 삭제(delete). 전부 RLS로 owner 스코프.

## 12. 정리 훅 (수명 규칙 구현)

- **Full replace = 전부 삭제**: CLI `editDoc`/`uploadDoc`의 전체-HTML 교체가 성공하면 그 `doc_id`의 하이라이트 전부 삭제(서비스 키). `cli/ports.ts`의 `DbPort`에 `deleteHighlights(docId)` 추가. `editDoc`가 이동을 겸해도(`moved`) 내용 교체이므로 **삭제 대상의 기준 id는 편집 전 `row.id`** 다(이동 전에/후 옛 id 기준으로 삭제).
  - 트레이드오프: `edit --file`은 작은 수정도 기계적으로 전체 교체라 모든 하이라이트가 사라진다. 작은 편집에서 주석을 보존하려면 미래 `--instruction` 타깃 편집((B))을 쓴다.
- **메타 전용 이동(`mv`/`move-file`/`folder rename`) = 유지**: `manage.ts`의 `updateRemoteDoc`는 내용을 안 바꾸므로 `deleteHighlights`를 호출하지 않는다. `doc_id` FK `on update cascade`로 보존.
- **고아**: 그 외 앵커 재배치 실패는 삭제하지 않고 목록에 회색 `⚠`로 남겨 수동 정리.

## 13. (B) 미래 계약 — 이번엔 인터페이스만

```ts
// 미래 --instruction 타깃 편집이 호출:
// 편집에 사용된 액션(편집/삭제) 하이라이트만 삭제, 나머지는 재앵커로 생존.
consumeHighlights(docId: string, usedHighlightIds: string[]): Promise<void>
```
- 이번 스펙은 시그니처/문서만. 실제 소비 연결은 `--instruction` 편집 스펙에서.

## 14. 테스트

- **shared 순수 로직(vitest)**: `extractAnchor` / `locateAnchor` — exact/prefix/suffix 추출, 재배치(유일·다중·실패=고아). fake 평문으로 결정론적.
- **정리 훅(cli)**: full-replace 후 `deleteHighlights(docId)` 호출됨 / 이동은 호출 안 됨 — fake ports(기존 `cli/edit.test.ts` 패턴).
- **마이그레이션/RLS**: 정책 포함, `bun run verify:remote`로 테이블 도달 확인.
- **브리지(브라우저 통합)**: 수동 스모크 — 드래그→팝오버→마크→스크롤, 로그인/비로그인 노출 차이, 고아 표시.

## 15. 범위 밖 (후속)

- `--instruction` LLM 편집 자체(별도 스펙) — 이번엔 `consumeHighlights` 계약만.
- 다중 사용자 공유/협업 주석(현재는 단일 owner 모델).
- 하이라이트 색 커스터마이즈, 태그 추가/편집 UI(키워드는 코드 상수로 시작).

## 16. 영향받는 파일(예상)

- `supabase/migrations/0008_highlights.sql` (신규)
- `shared/anchor.ts` (+ 테스트) — 앵커 추출/재배치 순수 로직
- `viewer/src/useDocHtml.ts` — `injectHighlightBridge` 추가
- `viewer/src/highlightBridge.ts` (신규) — iframe 주입 스크립트
- `viewer/src/useHighlights.ts` (신규) — Supabase CRUD 훅
- `viewer/src/App.tsx` — 헤더 스트립, 사이드바 섹션, 팝오버/에디터, postMessage 배선
- `viewer/src/HighlightEditor.tsx` (신규) — 주석 에디터(칩 + 메모)
- `cli/ports.ts` · `cli/edit.ts` · `cli/upload.ts` — `deleteHighlights` 훅 + (B) 계약 시그니처
- `viewer/src/theme.css` — 마크/칩/스트립 스타일
