# 문서 삭제 기능 설계 (gdoc / Trove)

작성일 2026-08-07 · 상태: 승인됨

## 목표

문서를 삭제할 수 있게 한다. CLI와 뷰어 양쪽에서 가능해야 하고, 폴더를 통째로(재귀) 삭제하는 경로도 제공한다.

현재 상태: 삭제 기능이 없다. CLI에는 `folder rmdir`(빈 폴더 전용)만 있고, 뷰어 파일 컨텍스트 메뉴에는 `이름 변경`·`메타정보 편집`뿐이다.

## 전제 — 마이그레이션 불필요

`document_share_links`(0007)와 `highlights`(0008) 모두 `documents(id)`에 `on delete cascade`가 걸려 있다.
문서 행을 지우면 하이라이트·메모·공유 링크는 DB가 알아서 정리한다.

따라서 새로 만들 것은 **Storage 객체 삭제**와 **폴더 재귀 대상 계산** 두 가지뿐이며, 스키마 변경은 없다.

## 아키텍처 — 기존 이중 경로를 그대로 따른다

이 저장소는 이미 두 개의 쓰기 경로를 갖고 있다.

```
CLI    → service_role key로 Postgres/Storage 직접 접근 (cli/ports.ts)
뷰어   → admin-docs Edge Function (bearer 토큰으로 OWNER_UID 검증)
```

삭제도 같은 구조로 대칭 구현한다.

**기각한 대안**: CLI가 Edge Function을 호출해 삭제 로직을 한 벌로 통일하는 방안.
Edge Function은 사용자 bearer 토큰으로 소유자를 검증하는데 CLI에는 그 토큰이 없다.
삭제 기능 하나를 위해 CLI 인증 방식을 새로 만드는 것은 변경 규모가 과하다.

중복을 줄이기 위해 **"무엇을 지울지 계산하는 규칙"만** `shared/deletePlan.ts`로 분리해 양쪽이 공유한다.
`shared/folderRules.ts`가 이미 같은 역할을 하고 있어 패턴이 일치한다.

## 삭제 순서 — DB 먼저, Storage 나중

```
① documents 행 삭제   → (cascade) highlights · document_share_links 자동 삭제
② Storage 객체 remove → 실패해도 중단하지 않고 warning으로 보고
```

역순이면 Storage는 지워졌는데 DB 행이 남아 **문서를 열면 깨지는** 상태가 된다.
이 순서면 최악의 경우 고아 Storage 객체(용량만 차지, 화면에 안 보임)만 남는다.
기존 `updateRemoteDoc`도 DB 갱신 후 old 객체를 제거하는 순서라 일관된다.

## shared/deletePlan.ts (신규)

순수 함수. I/O 없음.

```ts
planFolderDelete(folderPath, docs, folders) → {
  docs:    string[]  // path가 `${folderPath}/`로 시작하는 문서 id
  folders: string[]  // 하위 폴더 경로, 깊은 것부터 정렬 + 마지막에 자기 자신
  counts:  { docs: number; folders: number }
}
```

규칙:

- 접두사 비교는 반드시 `` `${folderPath}/` ``로 한다. `a/b`가 `a/bc`를 잡으면 안 된다.
- 폴더는 세그먼트 깊이 내림차순으로 정렬해 자식이 먼저 지워지게 한다.
- 자기 자신(`folderPath`)은 항상 목록의 마지막.

## CLI

| 명령 | 동작 |
|---|---|
| `gdoc rm <ref> --confirm` | 문서 1건 삭제 |
| `gdoc rm <ref> --dry-run` | 지울 대상만 출력, 아무것도 안 지움 |
| `gdoc folder rmdir <path>` | **현행 유지** — 비어 있지 않으면 에러 |
| `gdoc folder rmdir <path> --recursive --confirm` | 재귀 삭제. 대상 개수를 먼저 출력 |

`--confirm` 없이 실행하면 에러로 막는다. 기존 `edit`의 위험 전환 규칙과 같은 패턴이다.

`DbPort`에 추가할 메서드:

```ts
deleteDoc?(id: string): Promise<void>;
listFolders?(): Promise<{ path: string }[]>;
```

폴더 재귀 삭제 시 각 문서의 `bucket`/`storageKey`가 필요하므로 `getByIdOrPath(id)`를 문서마다 호출한다.
N+1 쿼리지만 1인용 CLI이고 문서 수가 크지 않아 허용한다. 새 포트를 만드는 것보다 기존 계약 재사용이 낫다.

## Edge Function (admin-docs)

| 라우트 | 비고 |
|---|---|
| `DELETE docs/{id}` | 신규. 기존 `docs/{id}/meta`, `docs/{id}/move`와 같은 결 |
| `DELETE folders` body `{ path, recursive?: boolean }` | 기존 라우트 확장. `recursive`가 없으면 현행대로 비어 있어야만 삭제 |

부분 실패는 중단하지 않고 `warnings` 배열로 반환한다(기존 Edge Function 패턴).

## 뷰어

- **컨텍스트 메뉴** (`TreeContextMenu.tsx`)
  - 파일: `삭제` 추가
  - 폴더: 기존 `빈 폴더 삭제` 옆에 `폴더 통째로 삭제` 추가
- **확인 다이얼로그** (`DeleteConfirmDialog.tsx` 신규)
  - 지울 대상과 "하이라이트·메모·공유 링크도 함께 삭제됩니다" 경고 표시
  - **대상 이름을 정확히 입력해야** 삭제 버튼 활성화
  - 폴더 재귀는 `문서 N개 · 폴더 M개가 삭제됩니다`를 함께 표시
- 삭제된 문서가 현재 선택 중이면 선택 해제 후 목록 refetch, 결과는 토스트로 피드백

## 테스트

기존 vitest + fake ports 패턴을 따른다.

- `shared/deletePlan.test.ts` — 재귀 대상 계산, 깊이 정렬, 접두사 오탐(`a/b` vs `a/bc`)
- `cli/delete.test.ts` — `--confirm` 누락 시 에러, dry-run은 아무것도 안 지움, DB→Storage 순서, Storage 실패 시 warning

Edge Function은 기존에도 테스트가 없어 동일하게 유지한다.

## 배포

1. `npx supabase functions deploy admin-docs` — 마이그레이션 없음
2. Vercel 뷰어 배포

## 알려진 한계 (의도적 제외)

지식 그래프 `private/graph/graph.json`은 `analyze`가 만든 스냅샷이라 삭제 후 유령 노드가 남는다.
자동 재생성은 임베딩 비용이 있어 넣지 않고, 삭제 완료 메시지에 `gdoc analyze --rebuild` 안내를 출력한다.

휴지통(soft delete)은 채택하지 않았다. `deleted_at` 컬럼 + RLS 수정 + 모든 조회 경로 필터 + 복원/영구삭제 UI가 필요해
범위가 3~4배로 커지는 데 비해, 1인용 도구에서 얻는 이득이 크지 않다고 판단했다.
