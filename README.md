# Trove (`gdoc`)

개인용 개발 산출물 **HTML 문서 관리 도구**. 로컬에서 생성한 HTML 문서를 업로드하면, 웹 뷰어에서 폴더 트리·카드·**지식 그래프**로 탐색하고 읽을 수 있습니다. 한국어 UI, 1인 사용자.

> 생성(HTML 만들기)은 이 저장소의 범위 밖입니다(별도 스킬이 담당). 여기 있는 것은 **업로드 CLI**와 **열람 뷰어**입니다.

## 구성

```
gdoc/
  shared/      # CLI·뷰어 공유 순수 로직 (zod 스키마, 트리, 정렬, 그래프) — 단위 테스트
  cli/         # gdoc CLI: 업로드 / analyze (Supabase에 발행)
  viewer/      # Trove 뷰어 — Vite + React (다크 테마)
  supabase/    # Postgres 마이그레이션 (documents 테이블, RLS, 버킷)
```

- **백엔드**: Supabase — Postgres(`documents`), Auth, Storage. 인증 없는 방문자는 공개 문서만, 로그인한 소유자는 전부.
- **호스팅**: 뷰어는 Vercel 정적 배포(`DEPLOY.md` 참고). 문서 본문/자산은 Supabase Storage(public/private 버킷).

## 사전 준비

1. Supabase 프로젝트 생성 → Hosting 불필요, **Postgres·Auth·Storage** 사용.
2. `cp .env.example .env` 후 채우기:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — CLI 전용(서버 키, **절대 커밋·노출 금지**)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — 뷰어용(공개 안전, RLS 보호)
3. 마이그레이션 적용: `supabase/migrations/*.sql`을 순서대로 Supabase SQL Editor에 실행(또는 `supabase db push`).
4. Auth → 공개 가입 끄기 + 본인 계정 1개 생성(소유자). 단일 사용자 모델("로그인 = 소유자").

## 문서 메타 형식

각 HTML `<head>`에 메타 블록을 넣으면 CLI가 읽습니다:

```html
<script type="application/json" id="gdoc-meta">
{
  "type": "tech-note",
  "title": "React Query 캐싱",
  "tags": ["react", "data-fetching"],
  "category": "frontend",
  "createdAt": "2026-06-22T12:00:00Z",
  "visibility": "private",
  "path": "playground/tech-notes/react-query"
}
</script>
```

- `type`: `tech-note | overview | change-log | feature-spec | deploy-test | index`
- `visibility`: `public | private` (기본 private)
- `path`: 트리 폴더 경로(슬래시 구분). 문서 식별자 = `slug(path)`
- `uid`(선택): 지식 그래프 노드의 안정적 식별자

## CLI

bun으로 실행(`.env` 자동 로드):

```bash
bun install
bun run gdoc upload docs   # docs/ 의 *.html 을 스캔·검증·업로드 (Storage + Postgres)
bun run gdoc analyze       # 태그 기반 지식 그래프 생성 → private/graph/graph.json
```

- `analyze`는 결정론적 태그 그래프를 기본 생성하고, `codex` 또는 `claude` CLI가 설치돼 있으면 의미 엣지·클러스터 라벨을 보강합니다(없으면 폴백).

## 뷰어

```bash
cd viewer
bun install
bun run dev        # http://localhost:5173
bun run build      # dist/
```

- 트리 / 카드 / **그래프** 뷰 전환, 이름 검색 + 메타 필터(AND), 정렬, 데스크톱·모바일 반응형
- 그래프 뷰는 소유자 전용(로그인 시), zoom/pan 지원
- 배포: `DEPLOY.md` 참고(Vercel)

## 테스트

```bash
bun run test   # vitest — shared 순수 로직(스키마·트리·정렬·그래프)
```
