# Trove (`gdoc`)

개인용 개발 산출물 **HTML 문서 관리 도구**. 로컬에서 만든 HTML을 발행하면 웹 뷰어에서 트리·카드·지식 그래프로 탐색·열람하고, 본문을 하이라이트·메모하거나 CLI로 편집(파일 교체·AI 지시)할 수 있습니다. 한국어 UI, 1인 사용자.

> 새 문서를 **처음부터 작성**하는 것은 범위 밖(별도 도구). 여기서는 **발행 · 열람 · 편집 · 하이라이트**를 다룹니다.

![Trove 첫 화면](assets/screenshot.png)

## 기능

- **발행** — 로컬 HTML을 Supabase에 업로드. 내용 해시로 `new/updated/unchanged/duplicate` 자동 분류.
- **열람** — 폴더 트리 · 카드 · 지식 그래프, 검색 + 메타 필터, 정렬, 다크/라이트, 모바일 반응형.
- **관리** — 이동 · 이름 변경 · 메타 수정 · 폴더 · 공유 링크 (CLI + 뷰어).
- **편집(CLI)** — `get` / `edit --file` / `revert`. 낙관적 동시성 · 확인 게이트 · 편집 전 스냅샷.
- **AI 편집(CLI)** — 로컬 codex/claude로 자유 지시 또는 하이라이트 기반 편집.
- **하이라이트(뷰어)** — 본문 드래그 → 하이라이트 + 키워드 칩 + 메모, 유저별 저장(RLS).
- **지식 그래프** — 로컬 임베딩(무료) 기반 유사 문서 연결.

## 구조

```
gdoc/
  cli/        gdoc CLI (발행·편집·관리·AI 편집·analyze)
  viewer/     Vite + React 뷰어 (트리·카드·그래프·편집·하이라이트)
  shared/     CLI·뷰어 공유 순수 로직 (스키마·트리·정렬·그래프·앵커)
  supabase/   Postgres 마이그레이션 + Edge Function(admin-docs)
```

- **백엔드**: Supabase — Postgres · Auth · Storage. 권한은 **RLS + Storage 정책 + Edge Function owner check**로 강제(클라이언트 아님).
- **호스팅**: 뷰어는 Vercel 정적 배포(`DEPLOY.md`), 문서 본문·자산은 Supabase Storage(public/private 버킷).

## 빠른 시작

1. Supabase 프로젝트 생성 (Postgres · Auth · Storage).
2. `cp .env.example .env` 후 채우기:

   | 키 | 용도 |
   |---|---|
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | CLI 전용 서버 키 — **커밋·노출 금지** |
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | 뷰어용 (공개 안전, RLS 보호) |
   | `OWNER_UID`, `VITE_OWNER_UID` | 소유자 Auth 사용자 UID |

3. 마이그레이션 + Edge Function 배포: `bun run deploy:supabase` (또는 `supabase/migrations/*.sql`을 순서대로 SQL Editor에 실행하고 `supabase functions deploy admin-docs`).
4. 설치 후 첫 사용:

```bash
bun install
bun run gdoc upload docs      # HTML 발행
cd viewer && bun run dev      # 뷰어 → http://localhost:5173
```

## 문서 메타 (`gdoc-meta`)

각 HTML `<head>`에 넣으면 CLI가 읽습니다:

```html
<script type="application/json" id="gdoc-meta">
{ "type": "tech-note", "title": "React Query 캐싱", "tags": ["react"],
  "category": "frontend", "createdAt": "2026-06-22T12:00:00Z",
  "visibility": "private", "path": "playground/tech-notes/react-query" }
</script>
```

| 필드 | 설명 |
|---|---|
| `type` | `tech-note \| overview \| change-log \| feature-spec \| deploy-test \| index` |
| `visibility` | `public \| private` (기본 `private`) |
| `path` | 트리 경로(슬래시 구분). 문서 id = `slug(path)`. 생략 시 `--auto-path` 또는 `<project\|category>/<title>` 폴백 |
| `tags` · `category` · `createdAt`(ISO-8601) · `uid` | 선택 |

## CLI

bun으로 실행(`.env` 자동 로드). `<ref>` = 문서 id 또는 path.

| 명령 | 설명 |
|---|---|
| `upload <파일\|폴더> [--auto-path]` | HTML 발행 |
| `get <ref>` | 현재 본문 HTML을 stdout으로 |
| `edit <ref> --file <경로>` | 본문을 새 HTML로 교체 |
| `edit <ref> --instruction "..."` | AI(codex/claude) 자유 지시 편집 |
| `edit <ref> --from-highlights` | 편집/삭제 하이라이트를 지시로 AI 편집 |
| `revert <ref>` | 직전 편집 본문으로 되돌리기(1단계) |
| `mv <ref> <새 path>` · `move-file <ref> <폴더>` · `rename <ref> <새 이름>` | 이동 · 이름 변경 |
| `meta <ref> [--title ...] [--tags a,b] [--category ...] [--type ...] [--visibility ...]` | 메타 수정 |
| `folder mkdir\|rename\|rmdir <path>` | 폴더 관리 |
| `analyze [--rebuild]` | 지식 그래프 생성 |
| `doctor` | 환경(.env·DB·버킷·node) 점검 |

공통 플래그: `--dry-run`(적용 없이 미리보기) · `--if-match <hash>`(낙관적 동시성) · `--confirm`(이동·공개범위 등 위험 전환 승인).

### 발행 분류

업로드 시 각 문서를 기존 DB와 대조해 분류하고 끝에 `new=… updated=… unchanged=… duplicate=…`를 출력합니다.

| 판정 | 기준 |
|---|---|
| `new` | 처음 보는 `docId(=slug(path))` |
| `updated` | 같은 docId, 내용 해시 다름 → 덮어쓰기 |
| `unchanged` | 같은 docId, 같은 해시 → skip |
| `duplicate` | 같은 해시가 다른 docId에 존재 → skip(경고) |

판별은 `content_hash`(HTML sha256)로 결정론적입니다.

### 편집 · 되돌리기

- `edit --file`은 본문 전체 교체. 파일의 `gdoc-meta`가 식별자의 기준이라 path/visibility를 바꾸는 변경(이동·공개범위)은 `--confirm`이 필요합니다.
- 모든 edit는 **편집 전 스냅샷**을 떠두므로 `revert <ref>`로 직전 본문 복구.
- 전체 교체(`edit --file`/재업로드)는 그 문서 하이라이트를 정리하고, **메타 전용 이동(`mv`/`move-file`/folder rename)은 하이라이트를 유지**합니다.

### AI 편집

로컬 **codex/claude**가 필요합니다(아래 요건). 뷰어가 아니라 CLI에서 실행합니다.

```bash
gdoc edit <ref> --instruction "오타 고치고 어색한 문장 다듬어"
gdoc edit <ref> --from-highlights      # [--dry-run] [--engine codex|claude] [--confirm]
```

- `--from-highlights`: 그 문서의 `편집`/`삭제` 하이라이트 + 메모를 지시로 변환(정보 태그 `궁금`/`중요`/`확인`은 무시). 적용 후 **사용된 하이라이트만 소비**, 나머지는 유지.
- LLM 출력은 검증(완결된 HTML · `gdoc-meta` 유효 · 식별자 불변) 통과 시에만 적용. 비결정적이므로 `--dry-run`으로 먼저 확인하고, 결과가 나쁘면 `revert`.
- 문서 편집은 LLM이 전체 HTML을 다시 출력하므로 **수십 초~수 분** 걸립니다(타임아웃 300s).
- ⚠️ AI 편집은 문서 **본문 전체**를 codex/claude 제공자로 전송합니다.

### codex / claude 요건

`--auto-path`와 AI 편집에 쓰입니다. 둘 중 하나만 설치·로그인하면 됩니다(CLI가 codex→claude 순 자동 감지).

```bash
npm i -g @openai/codex && codex login            # 옵션 A (비대화형, 빠름)
npm i -g @anthropic-ai/claude-code && claude     # 옵션 B
```

프라이버시: `--auto-path`는 **메타만**, AI 편집은 **본문 전체**를 제공자로 전송합니다. `analyze`는 로컬 임베딩이라 아무것도 전송하지 않습니다.

### `analyze` — 지식 그래프

각 문서 본문을 로컬 임베딩 모델(`Xenova/all-MiniLM-L6-v2`)로 벡터화해 코사인 유사도로 관련 문서를 연결하고 클러스터를 만듭니다. 결과는 `private/graph/graph.json`(소유자 전용).

- **로컬·무료**: API 키·외부 호출 없음(모델 1회 ~90MB 다운로드). 임베딩은 `node` 서브프로세스에서 실행(PATH 필요).
- **증분**: 해시가 바뀐 문서만 다시 임베딩, 변경 없으면 즉시 종료.

## 공개 / 비공개

문서 메타의 `visibility`로 지정합니다(기본 `private`).

| | `public` | `private` |
|---|---|---|
| 열람 | 누구나(비로그인 포함) | **소유자만**(로그인 시) |
| 저장 | public 버킷(공개 URL) | private 버킷(서명 URL) |

로그인 사용자의 UID가 `OWNER_UID`와 같으면 비공개 문서와 편집 기능이 열립니다. 비로그인 상태에선 비공개 문서 메타가 전달되지 않고 private 객체의 서명 URL도 만들 수 없습니다(Postgres RLS + Storage 정책으로 강제).

## 뷰어

```bash
cd viewer && bun run dev      # 개발 서버
cd viewer && bun run build    # dist/
```

- 트리 / 카드 / 그래프 전환, 이름 검색 + 메타 필터(AND), 정렬, 다크/라이트, 데스크톱·모바일 반응형.
- **로그인 시**: 폴더 생성/이름변경/삭제, 파일 드래그 이동, 파일 이름변경, 메타·공개범위 편집, 공유 링크.
- **하이라이트(로그인 시)**: 본문 드래그 → 팝오버에서 하이라이트/키워드 즉시 지정, 키워드 칩(편집·삭제·궁금·중요·확인) + 메모, 헤더 🔆 메뉴와 사이드바 "하이라이트" 모드에서 목록·점프, 고아(orphaned) 표시. 마크는 iframe 안에서 문서 테마에 맞게 렌더되고 유저별(RLS)로 저장됩니다.
- 문서 헤더의 **ID 복사** 버튼으로 CLI(`edit`/`get` 등)에 쓸 ref를 복사. 저장·삭제는 토스트로 피드백.

## 배포 · 테스트

```bash
bun run test              # vitest — shared 순수 로직 + cli(업로드·편집·정리 훅·AI 편집)
bun run deploy:supabase   # 마이그레이션 + admin-docs Edge Function 배포
```

뷰어 프로덕션 배포는 `DEPLOY.md` 참고(Vercel, root = `gdoc/`).
