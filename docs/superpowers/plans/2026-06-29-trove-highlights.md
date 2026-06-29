# Trove 하이라이트 + 주석 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trove 뷰어에서 문서 본문을 드래그해 하이라이트하고 키워드 칩 + 메모를 달며, 헤더·사이드바에서 보고 클릭해 스크롤하는 유저별 주석 시스템을 만든다.

**Architecture:** 문서는 sandbox iframe(blob)에서 렌더되므로, 기존 `injectThemeBridge` 패턴대로 iframe에 `injectHighlightBridge` 스크립트를 주입한다. 스크립트는 선택 감지·`<mark>` 렌더·클릭을 담당하고 `postMessage`로 부모 React와 통신한다. 부모는 Supabase `highlights` 테이블 CRUD(RLS, owner 스코프)·헤더 스트립·사이드바·팝오버·주석 에디터를 담당한다. 앵커는 구조가 아니라 텍스트-인용(exact+prefix+suffix)으로 고정한다.

**Tech Stack:** TypeScript, React, Vite (viewer), bun, vitest, Supabase (Postgres + RLS + supabase-js), 기존 gdoc CLI(ports/shared 패턴).

## Global Constraints

- 하이라이트 UI와 데이터는 **로그인(소유자) 시에만** 노출. 비로그인은 RLS로 행 미전달 + UI 숨김.
- 하이라이트는 **`owner_uid` 기반 누적**, RLS `auth.uid() = owner_uid`로 강제. 브라우저엔 anon 키 + 사용자 JWT만, 서비스 키 노출 금지.
- 키워드 상수: 액션 `편집`,`삭제` / 정보 `궁금`,`중요`,`확인`. 코드 상수로 한 곳에 정의.
- 앵커는 텍스트-인용(`exact`+`prefix`+`suffix`+`textPos` 폴백), 구조/오프셋 단독 금지.
- 정리 규칙: full-HTML 교체(`editDoc`/`uploadDoc` 업데이트) = 그 문서 하이라이트 전부 삭제 / 메타 전용 이동(`mv` 등) = 유지(FK cascade).
- 모든 신규 순수 로직은 vitest 테스트 동반. 기존 `cli/edit.test.ts`의 fake-ports 패턴을 따른다.
- 커밋 메시지는 한국어 Conventional Commits.

---

## File Structure

- `supabase/migrations/0008_highlights.sql` (생성) — highlights 테이블 + RLS + 인덱스.
- `shared/anchor.ts` (생성) + `shared/anchor.test.ts` — 텍스트-인용 앵커 추출/재배치 순수 로직.
- `shared/highlightKeywords.ts` (생성) — 키워드 상수 + 액션/정보 분류(부모·브리지·CLI 공유).
- `cli/ports.ts` (수정) — `DbPort.deleteHighlights` 추가.
- `cli/supabase.ts` (수정) — `deleteHighlights` 실제 구현.
- `cli/edit.ts` (수정) + `cli/edit.test.ts` (수정) — editDoc full-replace 시 정리 훅 + `consumeHighlights` 계약 시그니처.
- `cli/upload.ts` (수정) + `cli/upload.test.ts` (수정) — uploadDoc 'updated' 시 정리 훅.
- `viewer/src/useDocHtml.ts` (수정) + `viewer/src/injectHighlightBridge.test.ts` (생성) — 브리지 주입.
- `viewer/src/highlightBridge.ts` (생성) — iframe 주입 스크립트 본문(문자열 export).
- `viewer/src/useHighlights.ts` (생성) — Supabase CRUD 훅.
- `viewer/src/HighlightEditor.tsx` (생성) — 주석 에디터(칩 + 메모).
- `viewer/src/HighlightList.tsx` (생성) — 헤더 스트립 + 사이드바 목록 공용 표현.
- `viewer/src/App.tsx` (수정) — 배선(iframe ref, postMessage, 헤더/사이드바, 팝오버/에디터, 권한 게이트).
- `viewer/src/theme.css` (수정) — 마크/칩/스트립/팝오버 스타일.

---

## Task 1: 키워드 상수

**Files:**
- Create: `shared/highlightKeywords.ts`
- Test: (상수만 — 별도 테스트 생략, Task 3/7에서 사용처가 검증)

**Interfaces:**
- Produces: `HIGHLIGHT_KEYWORDS: readonly string[]`, `ACTION_KEYWORDS: readonly string[]`, `isActionKeyword(k: string): boolean`.

- [ ] **Step 1: 상수 작성**

```ts
// shared/highlightKeywords.ts
export const ACTION_KEYWORDS = ['편집', '삭제'] as const;
export const INFO_KEYWORDS = ['궁금', '중요', '확인'] as const;
export const HIGHLIGHT_KEYWORDS = [...ACTION_KEYWORDS, ...INFO_KEYWORDS] as const;

export type HighlightKeyword = (typeof HIGHLIGHT_KEYWORDS)[number];

export function isActionKeyword(k: string): boolean {
  return (ACTION_KEYWORDS as readonly string[]).includes(k);
}
```

- [ ] **Step 2: 커밋**

```bash
git add shared/highlightKeywords.ts
git commit -m "feat: 하이라이트 키워드 상수(액션/정보) 추가"
```

---

## Task 2: 텍스트-인용 앵커 순수 로직

**Files:**
- Create: `shared/anchor.ts`
- Test: `shared/anchor.test.ts`

**Interfaces:**
- Produces:
  - `interface TextAnchor { exact: string; prefix: string; suffix: string; textPos: number }`
  - `extractAnchor(fullText: string, start: number, end: number, ctx?: number): TextAnchor`
  - `locateAnchor(fullText: string, anchor: TextAnchor): { start: number; end: number } | null`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// shared/anchor.test.ts
import { describe, it, expect } from 'vitest';
import { extractAnchor, locateAnchor } from './anchor';

const TEXT = 'The quick brown fox jumps over the lazy dog and the quick cat.';

describe('extractAnchor', () => {
  it('captures exact text plus surrounding context', () => {
    const start = TEXT.indexOf('brown fox');
    const a = extractAnchor(TEXT, start, start + 'brown fox'.length, 5);
    expect(a.exact).toBe('brown fox');
    expect(a.prefix).toBe('uick ');
    expect(a.suffix).toBe(' jump');
    expect(a.textPos).toBe(start);
  });
});

describe('locateAnchor', () => {
  it('relocates a unique match', () => {
    const start = TEXT.indexOf('lazy dog');
    const a = extractAnchor(TEXT, start, start + 'lazy dog'.length);
    expect(locateAnchor(TEXT, a)).toEqual({ start, end: start + 'lazy dog'.length });
  });

  it('disambiguates repeated exact text via prefix/suffix', () => {
    // "quick" appears twice; prefix/suffix should pick the second.
    const second = TEXT.lastIndexOf('quick');
    const a = extractAnchor(TEXT, second, second + 'quick'.length, 6);
    expect(locateAnchor(TEXT, a)).toEqual({ start: second, end: second + 'quick'.length });
  });

  it('returns null when the exact text is gone (orphaned)', () => {
    const a = extractAnchor(TEXT, 0, 3);
    expect(locateAnchor('completely different content', a)).toBeNull();
  });

  it('falls back to nearest occurrence using textPos when context shifted', () => {
    const start = TEXT.indexOf('the lazy');
    const a = extractAnchor(TEXT, start, start + 3, 4); // exact "the"
    // "the" repeats; with prefix/suffix slightly changed, textPos breaks the tie.
    const moved = 'x' + TEXT; // shift everything by 1
    const hit = locateAnchor(moved, { ...a, textPos: a.textPos + 1 });
    expect(hit).not.toBeNull();
    expect(moved.slice(hit!.start, hit!.end)).toBe('the');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test anchor`
Expected: FAIL — `extractAnchor`/`locateAnchor` is not defined.

- [ ] **Step 3: 구현 작성**

```ts
// shared/anchor.ts
export interface TextAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  textPos: number;
}

export function extractAnchor(fullText: string, start: number, end: number, ctx = 32): TextAnchor {
  return {
    exact: fullText.slice(start, end),
    prefix: fullText.slice(Math.max(0, start - ctx), start),
    suffix: fullText.slice(end, end + ctx),
    textPos: start,
  };
}

/** All start indices of `needle` in `haystack`. */
function allIndexes(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

export function locateAnchor(fullText: string, anchor: TextAnchor): { start: number; end: number } | null {
  const candidates = allIndexes(fullText, anchor.exact);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { start: candidates[0], end: candidates[0] + anchor.exact.length };
  }
  // score by prefix/suffix agreement, then proximity to textPos.
  let best = -1;
  let bestScore = -Infinity;
  for (const start of candidates) {
    const before = fullText.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = fullText.slice(start + anchor.exact.length, start + anchor.exact.length + anchor.suffix.length);
    let score = 0;
    if (anchor.prefix && before.endsWith(anchor.prefix)) score += 2;
    if (anchor.suffix && after.startsWith(anchor.suffix)) score += 2;
    score -= Math.abs(start - anchor.textPos) / (fullText.length || 1); // tiebreak by closeness
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return { start: best, end: best + anchor.exact.length };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test anchor`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add shared/anchor.ts shared/anchor.test.ts
git commit -m "feat: 텍스트-인용 앵커 추출/재배치 순수 로직 추가"
```

---

## Task 3: highlights 마이그레이션

**Files:**
- Create: `supabase/migrations/0008_highlights.sql`

**Interfaces:**
- Produces: Postgres `highlights` 테이블(컬럼: `id, doc_id, owner_uid, exact, prefix, suffix, text_pos, note, keywords, created_at, updated_at`) + RLS 정책 `highlights_owner_all` + 인덱스.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- supabase/migrations/0008_highlights.sql
create table if not exists highlights (
  id          uuid primary key default gen_random_uuid(),
  doc_id      text not null references documents(id) on delete cascade on update cascade,
  owner_uid   uuid not null,
  exact       text not null,
  prefix      text,
  suffix      text,
  text_pos    int,
  note        text,
  keywords    text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table highlights enable row level security;

create policy highlights_owner_all on highlights
  for all
  using (auth.uid() = owner_uid)
  with check (auth.uid() = owner_uid);

create index if not exists highlights_doc_owner_idx on highlights (doc_id, owner_uid);
```

- [ ] **Step 2: 적용**

Run (Supabase SQL Editor에 붙여넣기, 또는):
```bash
bun run deploy:supabase
```
Expected: 에러 없이 적용. `documents` FK가 잡혀야 하므로 0001 이후 순서 유지.

- [ ] **Step 3: 도달 확인**

Run:
```bash
bun -e 'const u=process.env.SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;const r=await fetch(`${u}/rest/v1/highlights?select=id&limit=1`,{headers:{apikey:k,Authorization:`Bearer ${k}`}});console.log(r.status, await r.text())'
```
Expected: `200 []` (빈 배열, 테이블 존재).

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0008_highlights.sql
git commit -m "feat: highlights 테이블 + RLS 마이그레이션 추가"
```

---

## Task 4: CLI 정리 훅 — `deleteHighlights` 포트 + editDoc 연결

**Files:**
- Modify: `cli/ports.ts` (DbPort에 메서드 추가)
- Modify: `cli/supabase.ts` (구현)
- Modify: `cli/edit.ts` (editDoc 쓰기 후 호출 + consumeHighlights 시그니처)
- Test: `cli/edit.test.ts` (fake ports에 deleteHighlights 추가 + 검증)

**Interfaces:**
- Consumes: `editDoc` (Task 기존), `DbPort` (`cli/ports.ts`).
- Produces:
  - `DbPort.deleteHighlights?(docId: string): Promise<void>`
  - `editDoc`는 실제 쓰기(updated/moved) 성공 후 `ports.db.deleteHighlights?.(row.id)` 호출.
  - `consumeHighlights(docId: string, usedHighlightIds: string[]): Promise<void>` — 시그니처 + 문서 주석만(미래 `--instruction`용). 본문은 `deleteHighlights`로 위임하지 않고 TODO 주석 없이 명시적 미구현 표기 대신, 사용된 id만 지우는 최소 구현.

- [ ] **Step 1: 실패하는 테스트 작성** (`cli/edit.test.ts` 의 `makeFakes` 및 신규 테스트)

`makeFakes`의 `db` 객체에 추가:
```ts
    deletedHighlightsFor: [] as string[],
    async deleteHighlights(docId: string) {
      this.deletedHighlightsFor.push(docId);
    },
```
그리고 `describe('editDoc', ...)` 안에 신규 테스트:
```ts
  it('clears highlights for the doc after an in-place content replace', async () => {
    const { storage, db } = makeFakes();
    await editDoc(ID, docHtml('EDITED'), { storage, db });
    expect(db.deletedHighlightsFor).toEqual([ID]);
  });

  it('clears highlights keyed by the OLD id on a confirmed move', async () => {
    const { storage, db } = makeFakes();
    const next = docHtml('BODY', { path: 'Playground/Tech Notes/Renamed' });
    await editDoc(ID, next, { storage, db }, { confirm: true });
    expect(db.deletedHighlightsFor).toEqual([ID]); // old id
  });

  it('does NOT clear highlights on a no-op (unchanged) edit', async () => {
    const { storage, db } = makeFakes();
    await editDoc(ID, docHtml(), { storage, db });
    expect(db.deletedHighlightsFor).toEqual([]);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test edit`
Expected: FAIL — `db.deletedHighlightsFor` 비어 있음(editDoc가 아직 호출 안 함).

- [ ] **Step 3: 포트 인터페이스 추가** (`cli/ports.ts`, `DbPort`에 한 줄)

```ts
  deleteFolder?(path: string): Promise<void>;
  /** Remove all highlights for a doc (full-replace cleanup). */
  deleteHighlights?(docId: string): Promise<void>;
```

- [ ] **Step 4: editDoc에 훅 추가** (`cli/edit.ts`)

`editDoc`의 쓰기 블록에서, `await ports.db.updateIdentity(row.id, next);` 다음 줄에 추가:
```ts
  await ports.db.deleteHighlights?.(row.id); // full-replace → 해당 문서 하이라이트 정리(편집 전 id 기준)
```
파일 하단에 미래 계약 추가:
```ts
/**
 * 미래 `--instruction` 타깃 편집용 계약: 편집에 실제 사용된 하이라이트만 삭제.
 * 전체 교체가 아닌 부분 편집에서 호출한다(editDoc의 full-replace 정리와 구분).
 */
export async function consumeHighlights(
  docId: string,
  usedHighlightIds: string[],
  ports: UploadPorts,
): Promise<void> {
  await ports.db.deleteHighlightsByIds?.(docId, usedHighlightIds);
}
```
그리고 `DbPort`에 짝 메서드 추가(`cli/ports.ts`):
```ts
  /** Remove specific highlights (targeted-edit consume). */
  deleteHighlightsByIds?(docId: string, ids: string[]): Promise<void>;
```

- [ ] **Step 5: supabase 구현** (`cli/supabase.ts`, `db` 객체에 추가)

```ts
    async deleteHighlights(docId: string) {
      const { error } = await sb.from('highlights').delete().eq('doc_id', docId);
      if (error) throw new Error(error.message);
    },
    async deleteHighlightsByIds(docId: string, ids: string[]) {
      if (ids.length === 0) return;
      const { error } = await sb.from('highlights').delete().eq('doc_id', docId).in('id', ids);
      if (error) throw new Error(error.message);
    },
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `bun run test edit`
Expected: PASS (기존 + 신규 3개).

- [ ] **Step 7: tsc + 전체 테스트**

Run: `bunx tsc -p tsconfig.json --noEmit && bun run test`
Expected: tsc 통과, 전체 그린.

- [ ] **Step 8: 커밋**

```bash
git add cli/ports.ts cli/supabase.ts cli/edit.ts cli/edit.test.ts
git commit -m "feat: full-replace 시 하이라이트 정리 훅 + consumeHighlights 계약 추가"
```

---

## Task 5: uploadDoc 정리 훅 (재업로드 = full-replace)

**Files:**
- Modify: `cli/upload.ts`
- Test: `cli/upload.test.ts`

**Interfaces:**
- Consumes: `uploadDoc`, `DbPort.deleteHighlights`.
- Produces: `uploadDoc`가 status `updated`일 때 `ports.db.deleteHighlights?.(id)` 호출. `new`/`unchanged`/`duplicate`/dry-run은 호출 안 함.

- [ ] **Step 1: 실패하는 테스트 작성** (`cli/upload.test.ts`)

`makeFakes`의 `db`에 추가(Task 4와 동일 형태):
```ts
    deletedHighlightsFor: [] as string[],
    async deleteHighlights(docId: string) { this.deletedHighlightsFor.push(docId); },
```
신규 테스트:
```ts
  it('clears highlights when an existing doc is updated (re-upload = full replace)', async () => {
    const { storage, db } = makeFakes();
    // seed an existing row with a different hash so this counts as "updated"
    const ctx: UploadCtx = { byId: new Map([[ID, 'old-hash']]), byHash: new Map() };
    const out = await uploadDoc(html(), { storage, db }, ctx);
    expect(out.status).toBe('updated');
    expect(db.deletedHighlightsFor).toEqual([ID]);
  });

  it('does NOT clear highlights for a brand-new doc', async () => {
    const { storage, db } = makeFakes();
    await uploadDoc(html(), { storage, db }, emptyCtx());
    expect(db.deletedHighlightsFor).toEqual([]);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test upload`
Expected: FAIL — `deletedHighlightsFor` 비어 있음.

- [ ] **Step 3: 구현** (`cli/upload.ts`, db.upsert 직후)

`await ports.db.upsert({ ... });` 다음에 추가:
```ts
  if (status === 'updated') {
    await ports.db.deleteHighlights?.(id); // 기존 문서 전체 교체 → 하이라이트 정리
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test upload`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add cli/upload.ts cli/upload.test.ts
git commit -m "feat: 기존 문서 재업로드(updated) 시 하이라이트 정리"
```

---

## Task 6: 브리지 주입 — `injectHighlightBridge`

**Files:**
- Create: `viewer/src/highlightBridge.ts` (스크립트 본문 문자열)
- Modify: `viewer/src/useDocHtml.ts` (주입 함수 + 적용)
- Test: `viewer/src/injectHighlightBridge.test.ts`

**Interfaces:**
- Consumes: 기존 `injectThemeBridge` 패턴(`viewer/src/useDocHtml.ts`).
- Produces:
  - `HIGHLIGHT_BRIDGE_SCRIPT: string` (`viewer/src/highlightBridge.ts`)
  - `injectHighlightBridge(html: string): string` (`viewer/src/useDocHtml.ts`) — `</body>` 앞에 스크립트 1회 주입(멱등).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// viewer/src/injectHighlightBridge.test.ts
import { describe, it, expect } from 'vitest';
import { injectHighlightBridge } from './useDocHtml';

const HTML = '<html><head></head><body><p>hi</p></body></html>';

describe('injectHighlightBridge', () => {
  it('injects the bridge marker before </body>', () => {
    const out = injectHighlightBridge(HTML);
    expect(out).toContain('data-gdoc-highlight-bridge');
    expect(out.indexOf('data-gdoc-highlight-bridge')).toBeLessThan(out.indexOf('</body>'));
  });

  it('is idempotent (does not double-inject)', () => {
    const once = injectHighlightBridge(HTML);
    const twice = injectHighlightBridge(once);
    const count = twice.split('data-gdoc-highlight-bridge').length - 1;
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd viewer && bun run test injectHighlightBridge`
Expected: FAIL — `injectHighlightBridge` not exported.

- [ ] **Step 3: 브리지 스크립트 본문 작성** (`viewer/src/highlightBridge.ts`)

```ts
// viewer/src/highlightBridge.ts
// iframe 안에서 실행되는 하이라이트 브리지. 부모와 postMessage로 통신.
// 점진적 향상: 비활성(로그인 안 함)이면 아무 것도 하지 않는다.
export const HIGHLIGHT_BRIDGE_SCRIPT = `
<script data-gdoc-highlight-bridge>
(function(){
  var enabled = false;
  var marks = {}; // id -> [<mark> nodes]

  function fullText(){ return document.body ? document.body.innerText : ''; }

  // ---- 평문 오프셋 ↔ DOM Range 매핑 (innerText 기준 근사) ----
  function offsetToRange(start, end){
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var pos = 0, range = document.createRange(), set = { s:false, e:false };
    var node;
    while ((node = walker.nextNode())){
      var len = node.nodeValue.length;
      if (!set.s && start <= pos + len){ range.setStart(node, Math.max(0, start - pos)); set.s = true; }
      if (!set.e && end <= pos + len){ range.setEnd(node, Math.max(0, end - pos)); set.e = true; break; }
      pos += len;
    }
    return (set.s && set.e) ? range : null;
  }

  function selectionOffsets(){
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    var pre = document.createRange();
    pre.selectNodeContents(document.body);
    pre.setEnd(range.startContainer, range.startOffset);
    var start = pre.toString().length;
    return { start: start, end: start + range.toString().length, text: range.toString(), rect: range.getBoundingClientRect() };
  }

  function send(type, payload){ parent.postMessage(Object.assign({ type: type }, payload), '*'); }

  document.addEventListener('mouseup', function(){
    if (!enabled) return;
    var s = selectionOffsets();
    if (!s || !s.text.trim()) return;
    send('hl:selected', {
      anchor: { start: s.start, end: s.end },
      rect: { x: s.rect.left, y: s.rect.top, w: s.rect.width, h: s.rect.height }
    });
  });

  function wrap(range, id, cls){
    var mark = document.createElement('mark');
    mark.setAttribute('data-hl-id', id);
    mark.className = 'gdoc-hl ' + (cls || '');
    try { range.surroundContents(mark); }
    catch(e){ mark.appendChild(range.extractContents()); range.insertNode(mark); }
    mark.addEventListener('click', function(ev){
      ev.stopPropagation();
      var r = mark.getBoundingClientRect();
      send('hl:clicked', { id: id, rect: { x:r.left, y:r.top, w:r.width, h:r.height } });
    });
    (marks[id] = marks[id] || []).push(mark);
  }

  function clear(id){
    (marks[id] || []).forEach(function(m){
      var parentNode = m.parentNode;
      while (m.firstChild) parentNode.insertBefore(m.firstChild, m);
      parentNode.removeChild(m);
      parentNode.normalize();
    });
    delete marks[id];
  }

  window.addEventListener('message', function(ev){
    var d = ev.data || {};
    if (d.type === 'hl:set-enabled'){ enabled = !!d.on; if (!enabled){ Object.keys(marks).forEach(clear); } return; }
    if (d.type === 'hl:render'){
      Object.keys(marks).forEach(clear);
      var text = fullText();
      (d.located || []).forEach(function(h){
        var range = offsetToRange(h.start, h.end);
        if (range){ wrap(range, h.id, h.cls); send('hl:anchored', { id: h.id, ok: true }); }
        else { send('hl:anchored', { id: h.id, ok: false }); }
      });
      return;
    }
    if (d.type === 'hl:scroll-to'){
      var nodes = marks[d.id];
      if (nodes && nodes[0]){ nodes[0].scrollIntoView({ behavior:'smooth', block:'center' });
        nodes.forEach(function(n){ n.classList.add('flash'); setTimeout(function(){ n.classList.remove('flash'); }, 1200); }); }
      return;
    }
    if (d.type === 'hl:remove'){ clear(d.id); return; }
    if (d.type === 'hl:fulltext-request'){ send('hl:fulltext', { text: fullText() }); return; }
  });

  send('hl:ready', {});
})();
</script>`;
```

- [ ] **Step 4: 주입 함수 추가** (`viewer/src/useDocHtml.ts`)

상단 import 추가:
```ts
import { HIGHLIGHT_BRIDGE_SCRIPT } from './highlightBridge';
```
`injectThemeBridge` 아래에 추가:
```ts
export function injectHighlightBridge(html: string) {
  if (html.includes('data-gdoc-highlight-bridge')) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${HIGHLIGHT_BRIDGE_SCRIPT}\n</body>`);
  }
  return `${html}\n${HIGHLIGHT_BRIDGE_SCRIPT}`;
}
```
그리고 HTML을 iframe에 넣기 전 적용하는 곳(테마 브리지 주입 직후)에서 함께 적용:
```ts
// 기존: const withTheme = injectThemeBridge(rawHtml);
const withBridges = injectHighlightBridge(injectThemeBridge(rawHtml));
// 이후 withBridges 를 blob 으로 사용
```
*(정확한 변수명은 `useDocHtml.ts`의 기존 주입 지점에 맞춘다.)*

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd viewer && bun run test injectHighlightBridge`
Expected: PASS (2 tests).

- [ ] **Step 6: 커밋**

```bash
git add viewer/src/highlightBridge.ts viewer/src/useDocHtml.ts viewer/src/injectHighlightBridge.test.ts
git commit -m "feat: iframe 하이라이트 브리지 스크립트 주입"
```

---

## Task 7: Supabase CRUD 훅 `useHighlights`

**Files:**
- Create: `viewer/src/useHighlights.ts`

**Interfaces:**
- Consumes: 기존 viewer supabase client(`viewer/src/supabase.ts`), `Session`.
- Produces: `useHighlights(docId, session)` →
  `{ highlights: Highlight[], create(input), update(id, patch), remove(id), reload() }`
  where `interface Highlight { id; doc_id; exact; prefix; suffix; text_pos; note; keywords: string[] }`.

- [ ] **Step 1: 훅 작성** (CRUD, owner 스코프는 RLS가 강제)

```ts
// viewer/src/useHighlights.ts
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Highlight {
  id: string;
  doc_id: string;
  exact: string;
  prefix: string | null;
  suffix: string | null;
  text_pos: number | null;
  note: string | null;
  keywords: string[];
}

export type NewHighlight = Omit<Highlight, 'id'>;

export function useHighlights(docId: string | null, session: Session | null) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const reload = useCallback(async () => {
    if (!docId || !session) { setHighlights([]); return; }
    const { data, error } = await supabase
      .from('highlights').select('*').eq('doc_id', docId).order('created_at');
    if (!error && data) setHighlights(data as Highlight[]);
  }, [docId, session]);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (input: NewHighlight) => {
    if (!session) return null;
    const row = { ...input, owner_uid: session.user.id };
    const { data, error } = await supabase.from('highlights').insert(row).select().single();
    if (error) throw new Error(error.message);
    setHighlights((h) => [...h, data as Highlight]);
    return data as Highlight;
  }, [session]);

  const update = useCallback(async (id: string, patch: Partial<Pick<Highlight, 'note' | 'keywords'>>) => {
    const { data, error } = await supabase
      .from('highlights').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw new Error(error.message);
    setHighlights((h) => h.map((x) => (x.id === id ? (data as Highlight) : x)));
    return data as Highlight;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('highlights').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setHighlights((h) => h.filter((x) => x.id !== id));
  }, []);

  return { highlights, create, update, remove, reload };
}
```

- [ ] **Step 2: tsc 확인**

Run: `cd viewer && bunx tsc -p tsconfig.json --noEmit`
Expected: 통과. (`supabase` export 경로가 다르면 기존 client import에 맞춘다.)

- [ ] **Step 3: 커밋**

```bash
git add viewer/src/useHighlights.ts
git commit -m "feat: 하이라이트 Supabase CRUD 훅(useHighlights) 추가"
```

---

## Task 8: 주석 에디터 + 목록 컴포넌트

**Files:**
- Create: `viewer/src/HighlightEditor.tsx`
- Create: `viewer/src/HighlightList.tsx`

**Interfaces:**
- Consumes: `Highlight` (Task 7), `HIGHLIGHT_KEYWORDS`/`isActionKeyword` (Task 1).
- Produces:
  - `HighlightEditor({ highlight, onSave, onDelete, onClose })` — 칩 토글 + 메모 + 저장/삭제.
  - `HighlightList({ highlights, orphanIds, onJump })` — 헤더 스트립/사이드바 공용 목록.

- [ ] **Step 1: 에디터 작성**

```tsx
// viewer/src/HighlightEditor.tsx
import { useState } from 'react';
import { HIGHLIGHT_KEYWORDS, isActionKeyword } from '../../shared/highlightKeywords';
import type { Highlight } from './useHighlights';

interface Props {
  highlight: Pick<Highlight, 'exact' | 'note' | 'keywords'>;
  onSave: (patch: { note: string; keywords: string[] }) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function HighlightEditor({ highlight, onSave, onDelete, onClose }: Props) {
  const [keywords, setKeywords] = useState<string[]>(highlight.keywords ?? []);
  const [note, setNote] = useState(highlight.note ?? '');

  const toggle = (k: string) =>
    setKeywords((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div className="hl-editor" role="dialog" aria-label="하이라이트 주석">
      <blockquote className="hl-quote">“{highlight.exact.slice(0, 120)}”</blockquote>
      <div className="hl-kw-buttons">
        {HIGHLIGHT_KEYWORDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`hl-kw ${keywords.includes(k) ? 'on' : ''} ${isActionKeyword(k) ? 'action' : 'info'}`}
            onClick={() => toggle(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="hl-chips">
        {keywords.map((k) => (
          <span key={k} className={`hl-chip ${isActionKeyword(k) ? 'action' : 'info'}`}>
            {k}<button type="button" aria-label="제거" onClick={() => toggle(k)}>✕</button>
          </span>
        ))}
      </div>
      <textarea
        className="hl-note"
        placeholder="메모(왜 표시했는지)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="hl-editor-actions">
        <button type="button" className="btn" onClick={() => { onSave({ note, keywords }); onClose(); }}>저장</button>
        <button type="button" className="btn btn-ghost" onClick={() => { onDelete(); onClose(); }}>삭제</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 목록 작성**

```tsx
// viewer/src/HighlightList.tsx
import { isActionKeyword } from '../../shared/highlightKeywords';
import type { Highlight } from './useHighlights';

interface Props {
  highlights: Highlight[];
  orphanIds: Set<string>;
  onJump: (id: string) => void;
  compact?: boolean; // 헤더 스트립용
}

export function HighlightList({ highlights, orphanIds, onJump, compact }: Props) {
  if (highlights.length === 0) return null;
  return (
    <div className={`hl-list ${compact ? 'compact' : ''}`}>
      {highlights.map((h) => {
        const tag = h.keywords[0];
        const orphan = orphanIds.has(h.id);
        return (
          <button
            key={h.id}
            type="button"
            className={`hl-item ${orphan ? 'orphan' : ''}`}
            disabled={orphan}
            onClick={() => onJump(h.id)}
            title={orphan ? '본문에서 위치를 찾지 못함(고아)' : h.note ?? ''}
          >
            {tag && <span className={`hl-chip ${isActionKeyword(tag) ? 'action' : 'info'}`}>{tag}</span>}
            <span className="hl-snippet">{(h.note || h.exact).slice(0, 40)}</span>
            {orphan && <span className="hl-orphan">⚠</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: tsc 확인**

Run: `cd viewer && bunx tsc -p tsconfig.json --noEmit`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add viewer/src/HighlightEditor.tsx viewer/src/HighlightList.tsx
git commit -m "feat: 하이라이트 주석 에디터 + 목록 컴포넌트 추가"
```

---

## Task 9: App.tsx 배선 (postMessage · 헤더 · 사이드바 · 팝오버 · 권한)

**Files:**
- Modify: `viewer/src/App.tsx`

**Interfaces:**
- Consumes: `useHighlights`(Task 7), `HighlightEditor`/`HighlightList`(Task 8), `extractAnchor`/`locateAnchor`(Task 2), iframe `frameRef`(기존), `session`(기존).
- Produces: 동작하는 하이라이트 UX (드래그→팝오버→마크→에디터, 헤더 스트립, 사이드바 목록, 스크롤).

- [ ] **Step 1: 훅/상태 추가** (App 컴포넌트 상단)

```tsx
import { useHighlights, type Highlight } from './useHighlights';
import { HighlightEditor } from './HighlightEditor';
import { HighlightList } from './HighlightList';
import { extractAnchor, locateAnchor } from '../../shared/anchor';
import { isActionKeyword } from '../../shared/highlightKeywords';

// App 내부:
const { highlights, create, update, remove } = useHighlights(selected?.id ?? null, session);
const [docText, setDocText] = useState('');
const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
const [popover, setPopover] = useState<{ x: number; y: number; anchorRange: { start: number; end: number } } | null>(null);
const [editing, setEditing] = useState<Highlight | null>(null);
const loggedIn = !!session;
```

- [ ] **Step 2: postMessage 핸들러** (useEffect, frame과 연동)

```tsx
useEffect(() => {
  function onMsg(ev: MessageEvent) {
    const d = ev.data || {};
    const frame = frameRef.current;
    const rectOffset = frame?.getBoundingClientRect();
    if (d.type === 'hl:ready') {
      frame?.contentWindow?.postMessage({ type: 'hl:set-enabled', on: loggedIn }, '*');
      frame?.contentWindow?.postMessage({ type: 'hl:fulltext-request' }, '*');
    }
    if (d.type === 'hl:fulltext') setDocText(d.text || '');
    if (d.type === 'hl:selected' && rectOffset) {
      setPopover({
        x: rectOffset.left + d.rect.x,
        y: rectOffset.top + d.rect.y,
        anchorRange: { start: d.anchor.start, end: d.anchor.end },
      });
    }
    if (d.type === 'hl:clicked') {
      const h = highlights.find((x) => x.id === d.id);
      if (h) setEditing(h);
    }
    if (d.type === 'hl:anchored') {
      setOrphanIds((cur) => {
        const next = new Set(cur);
        if (d.ok) next.delete(d.id); else next.add(d.id);
        return next;
      });
    }
  }
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}, [highlights, loggedIn]);
```

- [ ] **Step 3: 저장된 하이라이트를 iframe에 렌더(재앵커)**

```tsx
useEffect(() => {
  const frame = frameRef.current;
  if (!frame || !docText || !loggedIn) return;
  const located = highlights
    .map((h) => {
      const hit = locateAnchor(docText, {
        exact: h.exact, prefix: h.prefix ?? '', suffix: h.suffix ?? '', textPos: h.text_pos ?? 0,
      });
      return hit ? { id: h.id, start: hit.start, end: hit.end, cls: isActionKeyword(h.keywords[0]) ? 'action' : 'info' } : null;
    })
    .filter(Boolean);
  frame.contentWindow?.postMessage({ type: 'hl:render', located }, '*');
}, [highlights, docText, loggedIn, frameReady]);
```

- [ ] **Step 4: 팝오버에서 하이라이트 생성**

```tsx
async function createFromPopover(keywords: string[]) {
  if (!popover) return;
  const a = extractAnchor(docText, popover.anchorRange.start, popover.anchorRange.end);
  const created = await create({
    doc_id: selected!.id, exact: a.exact, prefix: a.prefix, suffix: a.suffix,
    text_pos: a.textPos, note: null, keywords,
  });
  setPopover(null);
  if (created) setEditing(created); // 생성 직후 주석 에디터 열기
}
```
팝오버 JSX(부모 오버레이, `position:fixed`로 `popover.x/y`):
```tsx
{loggedIn && popover && (
  <div className="hl-popover" style={{ left: popover.x, top: popover.y }}>
    <button className="hl-pop-main" onClick={() => createFromPopover([])}>🔆 하이라이트</button>
    {['편집','삭제','궁금','중요','확인'].map((k) => (
      <button key={k} className="hl-pop-kw" onClick={() => createFromPopover([k])}>{k}</button>
    ))}
  </div>
)}
```

- [ ] **Step 5: 헤더 스트립 + 사이드바 목록 + 에디터 렌더**

헤더(문서 헤더 badge 영역 옆, 로그인 시):
```tsx
{loggedIn && (
  <HighlightList highlights={highlights} orphanIds={orphanIds} compact
    onJump={(id) => frameRef.current?.contentWindow?.postMessage({ type: 'hl:scroll-to', id }, '*')} />
)}
```
사이드바(문서 열림 + 로그인 시, `<aside className="sidebar">` 안 트리 위/아래):
```tsx
{loggedIn && selected && (
  <div className="sidebar-hl">
    <div className="sidebar-hl-title">🔆 하이라이트 ({highlights.length})</div>
    <HighlightList highlights={highlights} orphanIds={orphanIds}
      onJump={(id) => frameRef.current?.contentWindow?.postMessage({ type: 'hl:scroll-to', id }, '*')} />
  </div>
)}
```
에디터(모달/패널):
```tsx
{editing && (
  <HighlightEditor
    highlight={editing}
    onSave={(patch) => update(editing.id, patch)}
    onDelete={() => { remove(editing.id); frameRef.current?.contentWindow?.postMessage({ type: 'hl:remove', id: editing.id }, '*'); }}
    onClose={() => setEditing(null)}
  />
)}
```

- [ ] **Step 6: tsc + 빌드 확인**

Run: `cd viewer && bunx tsc -p tsconfig.json --noEmit && bun run build`
Expected: 타입 통과, 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add viewer/src/App.tsx
git commit -m "feat: 하이라이트 UX 배선(팝오버·헤더·사이드바·에디터·재앵커)"
```

---

## Task 10: 스타일

**Files:**
- Modify: `viewer/src/theme.css`

**Interfaces:**
- Consumes: 클래스명(`gdoc-hl`, `hl-popover`, `hl-editor`, `hl-chip`, `hl-item`, `hl-list`, `flash` 등).
- Produces: 마크/칩/팝오버/에디터/목록 스타일(다크·라이트 토큰 사용).

- [ ] **Step 1: 스타일 추가** (`viewer/src/theme.css` 하단)

```css
/* ---- highlights ---- */
mark.gdoc-hl { background: color-mix(in srgb, var(--accent) 22%, transparent); border-radius: 2px; padding: 0 1px; cursor: pointer; }
mark.gdoc-hl.action { background: color-mix(in srgb, #e0a106 30%, transparent); }
mark.gdoc-hl.info { background: color-mix(in srgb, #3b82f6 24%, transparent); }
mark.gdoc-hl.flash { outline: 2px solid var(--accent); transition: outline .2s; }

.hl-popover { position: fixed; z-index: 50; display: flex; gap: 4px; padding: 5px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.25); transform: translateY(-110%); }
.hl-popover button { font-size: 12.5px; font-weight: 700; padding: 4px 9px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel-2); color: var(--body); cursor: pointer; }
.hl-popover .hl-pop-main { color: var(--accent); }

.hl-editor { position: fixed; z-index: 60; right: 24px; bottom: 24px; width: 320px; padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
.hl-quote { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
.hl-kw-buttons, .hl-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.hl-kw { font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel-2); color: var(--body); cursor: pointer; }
.hl-kw.on { color: var(--text-strong); border-color: var(--accent); }
.hl-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.hl-chip.action { background: color-mix(in srgb, #e0a106 22%, transparent); }
.hl-chip.info { background: color-mix(in srgb, #3b82f6 18%, transparent); }
.hl-chip button { border: 0; background: none; cursor: pointer; color: inherit; }
.hl-note { width: 100%; min-height: 60px; resize: vertical; padding: 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel-2); color: var(--text); }
.hl-editor-actions { display: flex; gap: 8px; margin-top: 10px; }

.hl-list { display: flex; flex-wrap: wrap; gap: 6px; }
.hl-list.compact { align-items: center; }
.hl-item { display: inline-flex; align-items: center; gap: 6px; max-width: 240px; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel-2); color: var(--body); cursor: pointer; font-size: 12.5px; }
.hl-item.orphan { opacity: .5; cursor: default; }
.hl-snippet { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-hl { border-top: 1px solid var(--line); margin-top: 10px; padding-top: 10px; }
.sidebar-hl-title { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.sidebar-hl .hl-list { flex-direction: column; }
```

- [ ] **Step 2: 빌드 확인**

Run: `cd viewer && bun run build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add viewer/src/theme.css
git commit -m "style: 하이라이트 마크/칩/팝오버/목록 스타일 추가"
```

---

## Task 11: 통합 스모크 (수동) + 마무리

**Files:** (없음 — 검증)

- [ ] **Step 1: 로컬 뷰어 실행**

Run: `cd viewer && bun run dev`
Expected: http://localhost:5173 기동.

- [ ] **Step 2: 비로그인 확인**

로그인 안 한 상태로 공개 문서 열기 → 드래그해도 팝오버 없음, 헤더 스트립/사이드바 하이라이트 섹션 숨김.
Expected: 하이라이트 UI 전무.

- [ ] **Step 3: 로그인 후 생성/주석**

소유자 로그인 → 문서 본문 드래그 → 팝오버 등장 → `삭제` 클릭 → 마크(앰버) 생성 + 에디터 열림 → 메모 입력 → 저장.
Expected: 본문에 마크, 헤더 스트립과 사이드바에 항목 표시.

- [ ] **Step 4: 점프 + 수정 + 영속**

사이드바 항목 클릭 → 본문 해당 위치로 스크롤 + 깜빡임. 마크 클릭 → 에디터가 기존 값으로 열림 → 키워드 토글/메모 수정 → 저장. 새로고침 후에도 유지.
Expected: 스크롤·수정·영속 정상.

- [ ] **Step 5: 정리 훅(CLI)**

`bun run gdoc edit <ref> --file <변경본>` (full replace) 후 그 문서 다시 열기 → 하이라이트 사라짐. `bun run gdoc mv <ref> <새 path>` 후 → 하이라이트 유지.
Expected: full-replace=삭제, mv=유지.

- [ ] **Step 6: 전체 검증**

Run: `bun run test && bunx tsc -p tsconfig.json --noEmit && (cd viewer && bunx tsc -p tsconfig.json --noEmit && bun run build)`
Expected: 전부 통과.

- [ ] **Step 7: 최종 커밋(있으면)**

```bash
git add -A && git commit -m "test: 하이라이트 통합 스모크 확인" || true
```
