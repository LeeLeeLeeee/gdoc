# Viewer Document Management Spec

## Context

Trove(gdoc)는 HTML 문서를 Supabase Storage에 저장하고, `documents` 테이블의 `path` 메타데이터로 viewer 트리 위치를 만든다. 현재 문서 위치나 제목을 바꾸려면 HTML의 `gdoc-meta`를 수정한 뒤 다시 업로드해야 한다.

사용자는 viewer에서 문서를 보다가 바로 `path`, 파일명에 해당하는 path 마지막 segment, 제목, 태그, 카테고리, 공개 범위를 고칠 수 있어야 한다. 이 작업은 단순 DB update가 아니다. 현재 구조에서는 `path`가 `id = slug(path)`의 원천이고, Storage key도 id에서 파생된다.

## Current State

| Area | Current behavior | Evidence |
| --- | --- | --- |
| Document identity | upload 시 `path`를 `slugFromPath(path)`로 바꿔 `id`를 만든다. | `cli/upload.ts:36-44`, `shared/schema.ts:47-60` |
| Storage key | `storageKey(id)`로 ASCII-safe key를 만든다. | `cli/classify.ts:35-44` |
| Upload write path | Storage에 HTML을 먼저 업로드하고 그 다음 DB row를 upsert한다. | `cli/upload.ts:54-69` |
| DB schema | `documents.id`가 primary key이고 `path`, `bucket`, `storage_key`, `content_hash`가 별도 컬럼이다. | `supabase/migrations/0001_init.sql:4-18` |
| RLS/write policy | client write policy가 없고 CLI는 service role로 쓴다. | `supabase/migrations/0001_init.sql:27-34` |
| Viewer read | viewer는 anon key로 `documents`를 select하고 Storage URL을 만든다. | `viewer/src/useDocs.ts:24-44`, `viewer/src/supabase.ts:1-23` |
| Viewer UI | 문서 헤더에는 refresh/type/visibility만 있고 편집 액션은 없다. | `viewer/src/App.tsx:263-283` |
| HTML loading | viewer는 Storage HTML을 fetch한 뒤 theme bridge를 주입해서 iframe에 표시한다. | `viewer/src/useDocHtml.ts:51-93` |
| Backend ports | CLI port는 upload/listExisting/upsert만 있어서 move/delete/download가 없다. | `cli/ports.ts:5-39` |
| Tree model | viewer tree는 `documents.path`를 split해서 만든 가상 폴더다. 빈 폴더를 저장하는 테이블이 없다. | `shared/buildTree.ts:25-64`, `viewer/src/FileTree.tsx:19-21`, `viewer/src/TreeView.tsx:22-64` |

## Problem

viewer에서 path나 메타정보를 수정하려면 다음 상태가 항상 함께 맞아야 한다.

- DB `documents.id`
- DB `documents.path`
- DB `documents.title/tags/category/type/visibility`
- DB `documents.bucket`
- DB `documents.storage_key`
- DB `documents.content_hash`
- Storage object 위치
- Storage HTML 내부 `<script id="gdoc-meta">`
- 폴더를 별도 생성/이름 변경하려면 문서 path prefix와 폴더 메타도 함께 맞아야 한다.

이 중 하나만 바뀌면 다음 업로드나 viewer refresh 때 문서가 중복 생성되거나, 오래된 Storage object를 보거나, private/public 접근 정책이 꼬일 수 있다.

## Proposed Change

viewer에 owner-only 문서 및 폴더 관리 기능을 추가한다. 브라우저는 Supabase service role을 갖지 않는다. 모든 쓰기 작업은 Supabase Edge Function이 인증된 owner JWT를 검증한 뒤 service role로 처리한다.

좌측 트리는 IDE file explorer처럼 동작해야 한다.

- 빈 공간 context menu: root folder 생성
- folder context menu: 하위 폴더 생성, 이름 변경, 삭제
- file context menu: 이름 변경, 메타정보 편집, 삭제는 MVP 범위 밖
- file drag-and-drop: 기존 파일을 folder 위로 드롭하면 해당 folder로 이동
- folder rename: 해당 folder 아래 모든 문서 path prefix를 함께 변경

로컬 HTML 파일 동기화와 문서 본문 편집은 범위 밖이다.

## User Experience

### Document detail editing

1. 로그인한 사용자만 문서 헤더에서 edit 버튼을 본다.
2. edit 버튼을 누르면 modal/drawer가 열린다.
3. 사용자는 다음 필드를 수정할 수 있다.
   - `title`
   - `path`
   - `tags`
   - `category`
   - `type`
   - `visibility`
4. modal은 변경 요약을 보여준다.
   - old path -> new path
   - old id -> new id
   - old bucket -> new bucket
   - Storage 이동 여부
5. 저장 성공 후 문서 목록을 refetch하고, 변경된 문서를 새 `id/path` 기준으로 다시 선택한다.
6. 저장 실패 시 기존 선택 문서와 iframe 내용은 유지한다.

### IDE-style tree interactions

1. 사용자는 좌측 tree의 빈 공간을 우클릭해 root folder를 생성할 수 있다.
2. 사용자는 folder row를 우클릭해 하위 folder 생성, folder 이름 변경, folder 삭제를 할 수 있다.
3. 사용자는 file row를 우클릭해 파일 이름 변경, 메타정보 편집을 할 수 있다.
4. 사용자는 file row를 folder row 위로 drag-and-drop해서 해당 folder로 이동할 수 있다.
5. drag 중에는 drop 가능한 folder가 highlight되고, 자기 자신이 이미 속한 folder에는 drop해도 no-op이다.
6. folder 이름 변경은 그 folder 아래 모든 문서의 path prefix를 변경한다.
7. folder 삭제는 비어 있는 folder만 허용한다. 문서나 하위 folder가 있으면 삭제 대신 “먼저 이동 또는 삭제 필요” 오류를 보여준다.
8. context menu는 keyboard focus 상태에서도 열 수 있어야 한다. 최소 요구는 `Shift+F10` 또는 context menu key 지원이다.

## API Shape

Supabase Edge Function:

```http
PATCH /functions/v1/admin-docs/docs/:id/meta
Authorization: Bearer <supabase access token>
Content-Type: application/json
```

Request body:

```ts
type UpdateDocMetaRequest = {
  title?: string
  path?: string
  tags?: string[]
  category?: string
  type?: "tech-note" | "overview" | "change-log" | "feature-spec" | "deploy-test" | "index"
  visibility?: "public" | "private"
}
```

Response body:

```ts
type UpdateDocMetaResponse = {
  document: {
    id: string
    title: string
    type: string
    path: string
    visibility: "public" | "private"
    bucket: "public" | "private"
    storage_key: string
    tags: string[]
    category: string
    created_at: string
    updated_at: string
    content_hash: string
  }
  warnings: string[]
}
```

Error response:

```ts
type UpdateDocMetaError = {
  error:
    | "unauthorized"
    | "not_found"
    | "invalid_payload"
    | "path_conflict"
    | "missing_meta_block"
    | "invalid_meta_json"
    | "storage_download_failed"
    | "storage_upload_failed"
    | "db_update_failed"
  message: string
}
```

Folder APIs:

```http
POST /functions/v1/admin-docs/folders
PATCH /functions/v1/admin-docs/folders/rename
DELETE /functions/v1/admin-docs/folders
```

Folder request/response shapes:

```ts
type CreateFolderRequest = {
  parentPath?: string
  name: string
}

type RenameFolderRequest = {
  oldPath: string
  newName: string
}

type DeleteFolderRequest = {
  path: string
}

type FolderResponse = {
  folder: {
    path: string
    name: string
    parent_path: string | null
    created_at: string
    updated_at: string
  }
  movedDocuments?: UpdateDocMetaResponse["document"][]
  warnings: string[]
}
```

File move API:

```http
PATCH /functions/v1/admin-docs/docs/:id/move
```

```ts
type MoveDocRequest = {
  targetFolderPath: string
}
```

The server preserves the file name from the current path and moves only the folder prefix:

```ts
old path: playground/tech-notes/effect/20-effect-ai-micro-comparisons
targetFolderPath: playground/archive/effect
new path: playground/archive/effect/20-effect-ai-micro-comparisons
```

## Implementation Details

### 1. Folder metadata table

Add migration `supabase/migrations/0005_document_folders.sql`.

Schema:

```sql
create table if not exists public.document_folders (
  path        text primary key,
  name        text not null,
  parent_path text,
  owner_uid   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (length(trim(path)) > 0),
  check (position('//' in path) = 0)
);

create index if not exists document_folders_parent_idx on public.document_folders (parent_path);

alter table public.document_folders enable row level security;

create policy document_folders_read on public.document_folders
  for select using (auth.role() = 'authenticated');
```

Rules:

- Folder paths use the same slash-delimited path grammar as document folders.
- Folder path does not include a file leaf. Example: `playground/tech-notes/effect`.
- Empty folders are represented only in `document_folders`.
- Non-empty folders can be represented by both `document_folders` and document path prefixes.
- Creating a folder that already exists is a no-op success if the normalized path matches exactly, otherwise conflict.
- Folder delete is allowed only when no `documents.path` has `folderPath + '/'` prefix and no child `document_folders.path` has that prefix.

### 2. Shared tree model

Update `shared/buildTree.ts` to merge explicit folders with document-derived folders.

New type:

```ts
export interface FolderSummary {
  path: string
  name: string
  parentPath: string | null
  createdAt: string
  updatedAt: string
}
```

New function signature:

```ts
export function buildTree(
  docs: DocSummary[],
  opts: { sort?: boolean; folders?: FolderSummary[] } = {},
): TreeNode[]
```

Rules:

- Explicit folders appear even when empty.
- Document-derived folders still appear even if no explicit folder row exists, preserving existing documents.
- `flattenTree` must not collapse explicit empty folders in a way that makes context menu target paths ambiguous.
- Each `TreeNode` folder should carry `explicit: boolean` or equivalent metadata so the UI can distinguish an empty persisted folder from a derived prefix.

### 3. Shared HTML meta patcher

Add `shared/metaPatch.ts`.

Required exports:

```ts
export type EditableGdocMeta = Pick<
  GdocMeta,
  "title" | "tags" | "category" | "type" | "visibility" | "path"
>

export type GdocMetaPatch = Partial<EditableGdocMeta>

export function patchGdocMetaHtml(html: string, patch: GdocMetaPatch): {
  html: string
  meta: GdocMeta
}
```

Rules:

- Reuse the same meta block detection behavior as `cli/parseMeta.ts`.
- Validate the patched meta with `gdocMetaSchema`.
- Preserve existing fields not included in patch, including `uid`, `createdAt`, `project`, and `assets`.
- Preserve surrounding HTML.
- Throw typed errors for no meta block, invalid JSON, and invalid patched meta.

### 4. Shared document mutation plan

Add `shared/docMutation.ts`.

Required exports:

```ts
export type DocMutationPlan = {
  oldId: string
  newId: string
  oldPath: string
  newPath: string
  oldBucket: "public" | "private"
  newBucket: "public" | "private"
  oldStorageKey: string
  newStorageKey: string
  idChanged: boolean
  bucketChanged: boolean
  storageChanged: boolean
}

export function planDocMetaMutation(
  current: {
    id: string
    path: string
    bucket: "public" | "private"
    storageKey: string
    visibility: "public" | "private"
  },
  patchedMeta: GdocMeta,
): DocMutationPlan
```

Rules:

- `newPath = patchedMeta.path ?? default fallback` is not allowed for viewer edits. Viewer must send an explicit path or preserve existing path.
- `newId = slugFromPath(newPath)`.
- Empty `newId` is invalid.
- `newBucket = patchedMeta.visibility`.
- `newStorageKey = storageKey(newId)`.

### 5. Edge Function

Add `supabase/functions/admin-docs/index.ts`.

Environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Runtime flow:

1. Read bearer token from request.
2. Use anon/client auth or service client auth API to verify the user token.
3. Reject if no authenticated user.
4. Load current row from `documents` by `id`.
5. Download current Storage HTML from `row.bucket / row.storage_key`.
6. Patch HTML meta using `patchGdocMetaHtml`.
7. Build mutation plan using `planDocMetaMutation`.
8. If `newId !== oldId`, query `documents` for `newId`. If found, return `path_conflict`.
9. Compute new `content_hash` from patched HTML.
10. Upload patched HTML to `newBucket / newStorageKey`.
11. Update DB row.
12. Remove old Storage object if bucket/key changed.
13. Return updated document row and warnings.

Folder create flow:

1. Validate `parentPath` and `name`.
2. Compute `path = parentPath ? parentPath + "/" + name : name`.
3. Reject empty segments and path conflicts with an existing document file path.
4. Insert into `document_folders`.
5. Return folder row.

File drag/drop move flow:

1. Load document by id.
2. Validate target folder exists in explicit folders or as a document-derived folder.
3. Preserve current file leaf from `doc.path.split("/").at(-1)`.
4. Patch document path to `targetFolderPath + "/" + fileLeaf`.
5. Run the same document meta mutation path as `PATCH docs/:id/meta`.

Folder rename flow:

1. Validate `oldPath` exists as explicit folder or document-derived folder.
2. Compute `newPath = parent(oldPath) + "/" + newName`.
3. Reject if `newPath` conflicts with an existing folder or document file path.
4. Load all documents where `path = oldPath + "/" + leaf` or `path` starts with `oldPath + "/"`.
5. For each document, patch path prefix from `oldPath` to `newPath`, upload new HTML, update row, and remove old object.
6. Update explicit folder rows under the prefix:
   - `oldPath` row becomes `newPath`.
   - child folder paths replace prefix.
7. Return moved document rows and warnings.

Folder rename failure policy:

- Folder rename is a multi-document operation and cannot be perfectly atomic with Storage.
- Execute a preflight first: compute all new ids, storage keys, and conflicts before writing anything.
- If any conflict exists, write nothing.
- During execution, process documents sequentially and keep a compensation log.
- If a DB update fails after a new object upload, delete the new object best-effort and stop.
- If a later document fails after earlier documents were moved, return `500` with partial failure details and warnings. The UI should refetch and show a “부분 이동 실패” message.
- Keep folder rename behind a confirmation dialog when more than 1 document will move.

Folder delete flow:

1. Validate folder exists in `document_folders`.
2. Check no child folder exists.
3. Check no document path has the folder prefix.
4. Delete the folder row.
5. Return success.

DB update details:

- If `newId === oldId`: update row in place.
- If `newId !== oldId`: because `id` is primary key, update the primary key in the row rather than insert/delete, if Supabase/Postgres accepts it cleanly.
- Preserve `uid`.
- Update `updated_at`.
- Keep `created_at`.

Failure handling:

| Failure point | Behavior |
| --- | --- |
| Auth failed | return 401, no mutation |
| Row not found | return 404, no mutation |
| Meta patch invalid | return 400, no mutation |
| New id conflict | return 409, no mutation |
| Upload failed | return 500, DB unchanged |
| DB update failed after upload | best-effort delete newly uploaded object, return 500 |
| Old object delete failed after DB update | return 200 with warning |

### 6. Viewer API client

Add `viewer/src/useUpdateDocMeta.ts`.

Hook shape:

```ts
export function useUpdateDocMeta(session: Session | null): {
  updateDocMeta: (id: string, patch: UpdateDocMetaRequest) => Promise<DocSummary>
  saving: boolean
  error: string | null
}
```

Rules:

- If no session, throw a user-facing unauthorized error.
- Call `supabase.functions.invoke("admin-docs/..."` or direct function URL depending on Supabase client support.
- Normalize response into `DocSummary`.

Add `viewer/src/useFolderActions.ts`.

Hook shape:

```ts
export function useFolderActions(session: Session | null): {
  createFolder: (parentPath: string | null, name: string) => Promise<FolderSummary>
  renameFolder: (oldPath: string, newName: string) => Promise<FolderResponse>
  deleteFolder: (path: string) => Promise<void>
  moveDocToFolder: (docId: string, targetFolderPath: string) => Promise<DocSummary>
  saving: boolean
  error: string | null
}
```

### 7. Viewer edit modal

Add `viewer/src/DocEditModal.tsx`.

Fields:

- title input
- path input
- tags comma input or token editor
- category input
- type select using `DOC_TYPES`
- visibility segmented control

Validation:

- title non-empty
- category non-empty
- path non-empty
- path cannot contain empty segments
- tags trim whitespace and remove empty tags
- warn when path changes because id/storage key will change
- warn when visibility changes because bucket will move

Integration in `App.tsx`:

- Add edit button in document header around `App.tsx:270-282`.
- Only show when `session` exists.
- On success:
  - call `refetchDocs()`
  - set selected doc from response
  - retry/reload iframe
- Disable save while mutation is in flight.

### 8. IDE-style tree UI

Update `viewer/src/FileTree.tsx` and `viewer/src/TreeView.tsx`.

Required UI capabilities:

- Render folders from merged `documents` + `document_folders`.
- Show a context menu for folder rows.
- Show a context menu for file rows.
- Show a context menu for tree empty area.
- Enable drag on file rows.
- Enable drop on folder rows.
- Highlight valid drop targets.
- Prevent dropping a file into its current parent folder from issuing a request.
- Keep folder open state stable by folder path.
- After folder rename or file move, refetch docs and folders.

New files:

- `viewer/src/TreeContextMenu.tsx`
- `viewer/src/TreeRenameDialog.tsx`
- `viewer/src/CreateFolderDialog.tsx`

Context menu actions:

| Target | Actions |
| --- | --- |
| Empty tree area | New folder |
| Folder | New folder, Rename, Delete empty folder |
| File | Rename, Edit metadata |

Rename semantics:

- File rename changes only the last path segment.
- Folder rename changes the folder's own path segment and all descendant document/folder prefixes.
- Rename UI should show the new full path before saving.

### 9. CLI management commands

Add command handlers after viewer MVP.

Commands:

```bash
bun run gdoc mv <id-or-path> <new-path> [--dry-run]
bun run gdoc rename <id-or-path> <new-name> [--dry-run]
bun run gdoc meta <id-or-path> [--title ...] [--tags a,b] [--category ...] [--type ...] [--visibility public|private] [--dry-run]
bun run gdoc folder mkdir <path> [--dry-run]
bun run gdoc folder rename <old-path> <new-name> [--dry-run]
bun run gdoc folder rmdir <path> [--dry-run]
```

CLI implementation can call shared mutation logic directly with service role. It does not need to call the Edge Function.

Required port expansion in `cli/ports.ts`:

```ts
export interface StoragePort {
  upload(...): Promise<{ publicUrl?: string }>
  download(bucket: Bucket, key: string): Promise<string>
  remove(bucket: Bucket, key: string): Promise<void>
}

export interface DbPort {
  upsert(row: DocumentRow): Promise<void>
  listExisting(): Promise<ExistingDoc[]>
  getByIdOrPath(ref: string): Promise<DocumentRow | null>
  exists(id: string): Promise<boolean>
  updateIdentity(oldId: string, row: DocumentRow): Promise<void>
}
```

## Files Reference

| File | Change |
| --- | --- |
| `gdoc/shared/metaPatch.ts` | New HTML `gdoc-meta` patch helper |
| `gdoc/shared/metaPatch.test.ts` | Unit tests for HTML meta patching |
| `gdoc/shared/docMutation.ts` | New id/path/bucket/storage mutation planner |
| `gdoc/shared/docMutation.test.ts` | Unit tests for mutation plan edge cases |
| `gdoc/supabase/migrations/0005_document_folders.sql` | Persist explicit/empty folders |
| `gdoc/supabase/functions/admin-docs/index.ts` | Owner-only mutation API |
| `gdoc/viewer/src/DocEditModal.tsx` | New edit modal UI |
| `gdoc/viewer/src/useUpdateDocMeta.ts` | Viewer mutation hook |
| `gdoc/viewer/src/useFolders.ts` | Fetch explicit folders from `document_folders` |
| `gdoc/viewer/src/useFolderActions.ts` | Create/rename/delete folders and move docs |
| `gdoc/viewer/src/TreeContextMenu.tsx` | IDE-style right-click menu |
| `gdoc/viewer/src/TreeRenameDialog.tsx` | Rename file/folder dialog |
| `gdoc/viewer/src/CreateFolderDialog.tsx` | New folder dialog |
| `gdoc/viewer/src/FileTree.tsx` | Pass folders/actions into tree |
| `gdoc/viewer/src/TreeView.tsx` | Context menus, drag sources, drop targets |
| `gdoc/viewer/src/App.tsx` | Add edit button, modal wiring, selected doc refresh |
| `gdoc/viewer/src/theme.css` | Modal, form, warning, save state styles |
| `gdoc/cli/ports.ts` | Expand DB/Storage port interfaces |
| `gdoc/cli/supabase.ts` | Implement download/remove/get/update identity |
| `gdoc/cli/index.ts` | Add `mv`, `rename`, `meta` commands |
| `gdoc/cli/manage.ts` | New CLI command logic |
| `gdoc/cli/manage.test.ts` | CLI mutation tests with fake ports |
| `gdoc/README.md` | Document viewer editing and CLI management |

## Acceptance Criteria

1. Logged-out users do not see document edit controls.
2. Logged-in users see an edit button in the selected document header.
3. Editing title updates DB row, Storage HTML `gdoc-meta.title`, viewer list, and selected document header.
4. Editing path moves the document in the viewer tree after refetch.
5. Editing path changes `documents.id` to `slugFromPath(newPath)` and changes `storage_key` to `storageKey(newId)`.
6. Editing path to an existing id fails with `path_conflict` and leaves the original document unchanged.
7. Editing visibility from `private` to `public` moves the Storage object to the public bucket and updates `documents.bucket`.
8. Editing visibility from `public` to `private` moves the Storage object to the private bucket and public URL no longer works for anonymous users.
9. All successful edits update HTML `gdoc-meta` and `documents.content_hash`.
10. If DB update fails after new Storage upload, the new object is deleted best-effort and the old document remains selected.
11. If old Storage deletion fails after DB update, the API returns success with a warning.
12. Logged-in users can create a root folder from the tree empty-area context menu.
13. Logged-in users can create a child folder from a folder context menu.
14. Empty explicit folders remain visible after refresh.
15. Logged-in users can drag a file onto a folder and the file moves under that folder path.
16. Dragging a file onto its current parent folder is a no-op and does not call the server.
17. File context menu rename changes only the final path segment and preserves folder path.
18. Folder context menu rename changes the folder segment and all descendant document paths.
19. Folder rename preflight blocks the operation if any target document id would conflict.
20. Folder delete succeeds only for explicit empty folders.
21. Folder delete fails for folders containing child folders or documents.
22. Context menu is available by mouse right-click and keyboard context menu gesture.
23. `bun run test` passes.
24. `bun run check` passes.

## Testing Plan

| Layer | Tests |
| --- | --- |
| Unit | `metaPatch` parses, patches, validates, and preserves HTML |
| Unit | `docMutation` computes id/storage/bucket changes correctly |
| Unit | `buildTree` merges explicit folders with document-derived folders |
| Unit | `buildTree` keeps empty explicit folders visible |
| Unit | Edge function pure handler rejects unauthorized, invalid payload, conflict |
| Unit | Edge function folder create/rename/delete preflight catches conflicts |
| Unit | CLI manage command dry-run makes no writes |
| Integration | Fake DB/Storage move path, rename, visibility change |
| Integration | Fake DB/Storage folder rename moves descendant docs and folder rows |
| Viewer | Modal validation, save disabled state, success callback updates selected doc |
| Viewer | Context menu opens for empty area, folder, and file |
| Viewer | Drag file to folder calls `moveDocToFolder` with the target folder path |
| Manual E2E | Login, create folder, drag file into folder, rename file, rename folder, delete empty folder |
| Manual E2E | Edit title, edit path, edit visibility, conflict failure, anonymous access check |

## Rollback Plan

- Viewer UI changes can be reverted without changing stored documents.
- Edge Function deployment can be rolled back independently.
- A failed document edit should not require manual rollback unless old Storage cleanup fails.
- Folder creation rollback is a single DB row delete.
- Folder rename rollback may require moving partially changed documents back if a partial failure occurred. The function must return enough partial failure detail to support manual repair.
- If orphaned Storage objects appear, add a follow-up `gdoc cleanup-orphans` command that compares `documents.bucket/storage_key` against Storage object lists and deletes unreferenced keys after confirmation.

## Out of Scope

- Editing document body HTML from viewer.
- Bulk move or bulk tag editing.
- Dragging folders to move subtrees. Folder movement in MVP is done through rename/path dialogs only.
- Local HTML file synchronization.
- `uid` as primary viewer identity migration.
- Graph/search index auto-rebuild after metadata changes.

## Open Decisions

1. Edge Function owner check: single-user model currently treats any authenticated user as owner. Confirm whether this remains acceptable or should compare against an explicit owner uid.
2. Function invocation style: use `sb.functions.invoke` if routing works cleanly with path parameters, otherwise use direct function URL with `fetch`.
3. `id` primary key update: verify Supabase/Postgres update of primary key works cleanly with current table and no foreign keys. If not, insert new row + delete old row in one transaction-like sequence inside the function.
4. Search/graph staleness: after metadata edits, viewer should probably show "analyze needed" for graph/search, but automatic analyze is out of scope for this MVP.
5. Empty folder visibility for anonymous users: since folders are management metadata, MVP should show explicit folders only to authenticated owner. Public anonymous tree can continue deriving folders from public documents only.
6. Folder rename maximum size: decide whether to cap one folder rename to N descendant documents before requiring CLI confirmation.

## Execution Order

1. Add `document_folders` migration and folder fetch support.
2. Update `buildTree` to merge explicit folders with document-derived folders.
3. Add `metaPatch` and `docMutation` shared utilities with tests.
4. Implement Edge Function document mutation using fake-testable pure helpers.
5. Implement Edge Function folder create/delete and file move.
6. Implement folder rename preflight and cascade mutation.
7. Add viewer `useUpdateDocMeta`, `useFolders`, and `useFolderActions`.
8. Add `DocEditModal`, tree context menu dialogs, and drag/drop tree behavior.
9. Wire edit button, context menus, selected-doc refresh, and folder refetch in `App.tsx`.
10. Expand CLI ports and implement `mv/rename/meta/folder` commands.
11. Update README.
12. Run `bun run test` and `bun run check`.
