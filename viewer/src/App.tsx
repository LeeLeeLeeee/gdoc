import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileTree } from './FileTree';
import { CardView } from './CardView';
import { useDocs } from './useDocs';
import { useDocHtml } from './useDocHtml';
import { useSearchIndex } from './useSearchIndex';
import { contentSnippet, searchScore } from '../../shared/searchSnippet';
import { useSession } from './auth';
import { useFolders } from './useFolders';
import { useFolderActions } from './useFolderActions';
import { useUpdateDocMeta } from './useUpdateDocMeta';
import { useShareLinks } from './useShareLinks';
import { AuthBar } from './AuthBar';
import { LoginModal } from './LoginModal';
import { SortControl } from './SortControl';
import { DocEditModal } from './DocEditModal';
import { ShareLinkModal } from './ShareLinkModal';
import { CreateFolderDialog } from './CreateFolderDialog';
import { TreeRenameDialog } from './TreeRenameDialog';
import { SharedDocPage } from './SharedDocPage';
import { formatUpdatedAt } from './dateFormat';
import { sortDocs, type SortKey, type SortDir } from '../../shared/sortDocs';
import type { DocSummary } from '../../shared/buildTree';
import { folderPathOf } from '../../shared/folderRules';
import { shareTokenFromPath } from '../../shared/shareLinks';
import { Logo, Search, Filter, X, Alert, Moon, Sun, Refresh, Check, Pencil, LinkIcon } from './icons';
import { useHighlights, type Highlight } from './useHighlights';
import { HighlightEditor } from './HighlightEditor';
import { HighlightList } from './HighlightList';
import { extractAnchor, locateAnchor } from '../../shared/anchor';
import { isActionKeyword } from '../../shared/highlightKeywords';

const loadGraphView = () => import('./GraphView').then((m) => ({ default: m.GraphView }));
const GraphView = lazy(loadGraphView);
const preloadGraphView = () => {
  void loadGraphView();
};

type ThemeMode = 'dark' | 'light';
const THEME_STORAGE_KEY = 'gdoc-theme';
const ownerUid = import.meta.env.VITE_OWNER_UID as string | undefined;

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function App() {
  const shareToken = typeof window === 'undefined' ? null : shareTokenFromPath(window.location.pathname);
  const { session, ready } = useSession();
  const canManage = Boolean(session && ownerUid && session.user.id === ownerUid);
  const { docs, loading, error, refetch: refetchDocs } = useDocs(session?.user?.id ?? null, ready);
  const { folders, loading: foldersLoading, error: foldersError, refetch: refetchFolders } = useFolders(
    session?.user?.id ?? null,
    ready,
  );
  const { updateDocMeta, saving: savingDoc, error: docSaveError } = useUpdateDocMeta(session);
  const folderActions = useFolderActions(session);
  const shareActions = useShareLinks(session);
  const now = useNow();

  const [q, setQ] = useState(''); // meta filter
  const [name, setName] = useState(''); // search input (updates immediately)
  const [debouncedName, setDebouncedName] = useState(''); // applied after a short pause
  const [searchState, setSearchState] = useState<'idle' | 'typing' | 'done'>('idle');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [view, setView] = useState<'tree' | 'card' | 'graph'>('tree');
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  const [selected, setSelected] = useState<DocSummary | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocSummary | null>(null);
  const [sharingDoc, setSharingDoc] = useState<DocSummary | null>(null);
  const [createFolderParent, setCreateFolderParent] = useState<string | null | undefined>(undefined);
  const [movingDoc, setMovingDoc] = useState<{ id: string; targetFolderPath: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<
    { kind: 'file'; doc: DocSummary } | { kind: 'folder'; path: string; name: string } | null
  >(null);
  const [showLogin, setShowLogin] = useState(false);
  const { docHtml, loadError, retry } = useDocHtml(selected, session);
  const { index: searchIndex } = useSearchIndex(session, ready);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Highlight feature state
  const { highlights, create, update, remove } = useHighlights(selected?.id ?? null, session);
  const [docText, setDocText] = useState('');
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<{ x: number; y: number; bottom: number; anchorRange: { start: number; end: number } } | null>(null);
  const [editing, setEditing] = useState<Highlight | null>(null);
  const [editorPos, setEditorPos] = useState<{ x: number; y: number } | null>(null);
  const [hlMenuOpen, setHlMenuOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'docs' | 'highlights'>('docs');
  const loggedIn = !!session;
  const showDocs = !loggedIn || sidebarMode === 'docs';

  // Debounce the search box: while typing, show a "typing" indicator; once settled,
  // apply the term and flash a "done" check that fades after a moment.
  useEffect(() => {
    if (name === debouncedName) return;
    setSearchState('typing');
    const id = window.setTimeout(() => {
      setDebouncedName(name);
      setSearchState(name.trim() ? 'done' : 'idle');
    }, 220);
    return () => window.clearTimeout(id);
  }, [name, debouncedName]);
  useEffect(() => {
    if (searchState !== 'done') return;
    const id = window.setTimeout(() => setSearchState('idle'), 1200);
    return () => window.clearTimeout(id);
  }, [searchState]);
  const clearSearch = useCallback(() => {
    setName('');
    setDebouncedName('');
    setSearchState('idle');
  }, []);

  // meta filter AND search (title OR content), then sort. Content matches produce a
  // snippet for the card view; falls back to title-only when no index is loaded.
  const { visible, snippets } = useMemo(() => {
    const m = q.trim().toLowerCase();
    const n = debouncedName.trim().toLowerCase();
    const snips: Record<string, string> = {};
    const scored: { d: DocSummary; score: number }[] = [];
    for (const d of docs) {
      const metaOk =
        !m ||
        d.title.toLowerCase().includes(m) ||
        d.category.toLowerCase().includes(m) ||
        d.type.toLowerCase().includes(m) ||
        d.tags.some((t) => t.toLowerCase().includes(m));
      if (!metaOk) continue;
      if (!n) {
        scored.push({ d, score: 0 });
        continue;
      }
      const text = searchIndex?.[d.id] ?? '';
      const score = searchScore(d.title, text, n);
      if (score === 0) continue;
      const snip = contentSnippet(text, n);
      if (snip) snips[d.id] = snip;
      scored.push({ d, score });
    }
    // With a search term, rank by relevance; otherwise honor the sort control.
    const list = n
      ? scored.sort((a, b) => b.score - a.score).map((s) => s.d)
      : sortDocs(scored.map((s) => s.d), sortKey, sortDir);
    return { visible: list, snippets: snips };
  }, [docs, q, debouncedName, sortKey, sortDir, searchIndex]);

  // render via a real blob: URL rather than srcDoc, so the doc's own #anchor TOC links
  // scroll within the document instead of navigating to about:srcdoc#… (which blanks it)
  const blobUrl = useMemo(
    () => (docHtml === null ? null : URL.createObjectURL(new Blob([docHtml], { type: 'text/html' }))),
    [docHtml],
  );
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  // hold the iframe hidden until it fires `load`, so a dark backdrop shows during
  // paint instead of a white flash; revealed via a fade once the doc is rendered
  const [frameReady, setFrameReady] = useState(false);
  useEffect(() => { setFrameReady(false); }, [blobUrl]);

  // Bridge: listen for iframe highlight messages
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
          bottom: rectOffset.top + d.rect.y + d.rect.h,
          anchorRange: { start: d.anchor.start, end: d.anchor.end },
        });
      }
      if (d.type === 'hl:clicked' && rectOffset) {
        const h = highlights.find((x) => x.id === d.id);
        if (h) {
          setEditorPos({ x: rectOffset.left + d.rect.x, y: rectOffset.top + d.rect.y + d.rect.h + 6 });
          setEditing(h);
        }
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

  // Re-anchor: send stored highlights to iframe after docText/frameReady changes
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

  const hasFilter = q.trim() !== '' || debouncedName.trim() !== '';
  const countLabel = !ready ? '문서' : session ? `문서 · ${docs.length}` : `문서 · 공개 ${docs.length}`;
  const listLoading = !ready || loading || foldersLoading;
  const listError = error ?? foldersError;
  const crumb = selected ? selected.path.split('/').slice(0, -1).join(' / ') : '';
  const docLoading = !!selected && docHtml === null && !loadError;
  const loadingPath = docLoading && selected ? selected.path : undefined;
  // mobile: single column — show the list, or the detail (a doc / the graph)
  const mobileScreen = view === 'graph' || selected ? 'show-detail' : 'show-list';
  const filterTerms = useMemo(() => [q, debouncedName], [q, debouncedName]);
  const showGraph = useCallback(() => {
    preloadGraphView();
    setView('graph');
  }, []);
  const selectGraphDoc = useCallback((d: DocSummary) => {
    setSelected(d);
    setView('tree');
  }, []);
  const sendThemeToFrame = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'set-theme', theme }, '*');
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    sendThemeToFrame();
  }, [sendThemeToFrame, theme]);

  async function createFromPopover(keywords: string[]) {
    if (!popover) return;
    const a = extractAnchor(docText, popover.anchorRange.start, popover.anchorRange.end);
    const created = await create({
      doc_id: selected!.id, exact: a.exact, prefix: a.prefix, suffix: a.suffix,
      text_pos: a.textPos, note: null, keywords,
    });
    setEditorPos({ x: popover.x, y: popover.bottom + 6 });
    setPopover(null);
    if (created) setEditing(created);
  }

  if (shareToken) {
    return <SharedDocPage token={shareToken} />;
  }

  return (
    <div className={`app ${mobileScreen}`} data-theme={theme}>
      <aside className="sidebar">
        <div className="side-head">
          <div className="brand">
            <Logo size={20} />
            <span className="brand-name">Trove</span>
          </div>
          <div className="theme-toggle" aria-label="테마 선택">
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} title="다크 모드">
              <Moon size={13} /> 다크
            </button>
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} title="라이트 모드">
              <Sun size={13} /> 라이트
            </button>
          </div>
          <AuthBar session={session} onLogin={() => setShowLogin(true)} />
          <div className="field">
            <span className="ico"><Filter /></span>
            <input className="gd-input" placeholder="태그·카테고리·타입·제목 필터" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div className="doc-controls">
          {loggedIn && (
            <div className="seg seg-primary">
              <button className={sidebarMode === 'docs' ? 'on' : ''} onClick={() => setSidebarMode('docs')}>문서</button>
              <button className={sidebarMode === 'highlights' ? 'on' : ''} onClick={() => setSidebarMode('highlights')}>🔆 하이라이트{highlights.length ? ` ${highlights.length}` : ''}</button>
            </div>
          )}
          {showDocs && (<>
          <div className="row-between">
            <span className="eyebrow">{countLabel}</span>
            <div className="list-actions">
              <button
                className={`icon-btn list-refresh${listLoading ? ' loading' : ''}`}
                onClick={() => {
                  refetchDocs();
                  refetchFolders();
                }}
                disabled={!ready || listLoading}
                aria-label="문서 목록 새로고침"
                title="문서 목록 새로고침"
              >
                <Refresh size={13} />
              </button>
              <SortControl sortKey={sortKey} sortDir={sortDir} onChange={(k, d) => { setSortKey(k); setSortDir(d); }} />
            </div>
          </div>
          <div className="seg">
            <button className={view === 'tree' ? 'on' : ''} onClick={() => setView('tree')}>트리</button>
            <button className={view === 'card' ? 'on' : ''} onClick={() => setView('card')}>카드</button>
            <button className={view === 'graph' ? 'on' : ''} onMouseEnter={preloadGraphView} onFocus={preloadGraphView} onClick={showGraph}>그래프</button>
          </div>
          {view !== 'graph' && (
            <>
              <div className="field">
                <span className="ico"><Search /></span>
                <input className="gd-input" style={{ height: 34, paddingRight: 32 }} placeholder="제목·내용 검색" value={name} onChange={(e) => setName(e.target.value)} />
                {searchState === 'typing' && (
                  <span className="search-status typing" aria-hidden="true"><i /><i /><i /></span>
                )}
                {searchState === 'done' && (
                  <span className="search-status done" aria-label="검색 완료"><Check size={13} /></span>
                )}
              </div>
              {hasFilter && (
                <div className="chips">
                  {q.trim() && (
                    <span className="chip">메타: {q.trim()} <button onClick={() => setQ('')}><X size={11} /></button></span>
                  )}
                  {debouncedName.trim() && (
                    <span className="chip">검색: {debouncedName.trim()} <button onClick={clearSearch}><X size={11} /></button></span>
                  )}
                  <span className="count">{visible.length}개 결과 · AND</span>
                </div>
              )}
            </>
          )}
          </>)}
        </div>

        {showDocs ? (
        <div className="tree">
          {view === 'graph' ? (
            <div className="center muted" style={{ padding: 24, textAlign: 'center' }}>지식 그래프를<br />오른쪽에 표시 중</div>
          ) : listLoading ? (
            <div className="center muted" style={{ padding: 24 }}>불러오는 중…</div>
          ) : listError ? (
            <div className="center error-text" style={{ padding: 24 }}>에러: {listError}</div>
          ) : visible.length || (view === 'tree' && canManage) ? (
            view === 'tree' ? (
              <FileTree
                docs={visible}
                folders={folders}
                selectedPath={selected?.path}
                loadingPath={loadingPath}
                movingDocId={movingDoc?.id}
                movingTargetPath={movingDoc?.targetFolderPath}
                now={now}
                onSelect={setSelected}
                canManage={canManage}
                onCreateFolder={(parentPath) => setCreateFolderParent(parentPath)}
                onRenameFolder={(path, name) => setRenameTarget({ kind: 'folder', path, name })}
                onDeleteFolder={async (path) => {
                  await folderActions.deleteFolder(path);
                  refetchFolders();
                }}
                onRenameFile={(doc) => setRenameTarget({ kind: 'file', doc })}
                onEditFile={(doc) => setEditingDoc(doc)}
                onMoveDocToFolder={async (doc, targetFolderPath) => {
                  if (folderPathOf(doc.path) === targetFolderPath) return;
                  setMovingDoc({ id: doc.id, targetFolderPath });
                  try {
                    const updated = await folderActions.moveDocToFolder(doc.id, targetFolderPath);
                    setSelected(updated);
                    refetchDocs();
                    refetchFolders();
                  } finally {
                    setMovingDoc(null);
                  }
                }}
              />
            ) : (
              <CardView docs={visible} terms={filterTerms} snippets={snippets} selectedPath={selected?.path} loadingPath={loadingPath} now={now} onSelect={setSelected} filtered={hasFilter} />
            )
          ) : (
            <div className="center muted" style={{ padding: 24, textAlign: 'center' }}>
              {hasFilter ? '필터와 일치하는 문서가 없습니다' : '문서 없음'}
            </div>
          )}
        </div>

        ) : (
        <div className="tree sidebar-hl-body">
          {!selected ? (
            <div className="center muted" style={{ padding: 24, textAlign: 'center' }}>문서를 열면<br />하이라이트가 표시됩니다</div>
          ) : highlights.length === 0 ? (
            <div className="center muted" style={{ padding: 24, textAlign: 'center' }}>이 문서에 하이라이트가 없습니다</div>
          ) : (
            <HighlightList highlights={highlights} orphanIds={orphanIds}
              onJump={(id) => frameRef.current?.contentWindow?.postMessage({ type: 'hl:scroll-to', id }, '*')} />
          )}
        </div>
        )}
      </aside>

      <main className="pane">
        {(selected || view === 'graph') && (
          <button className="mobile-back" onClick={() => (view === 'graph' ? setView('tree') : setSelected(null))}>← 목록</button>
        )}
        {view === 'graph' ? (
          <Suspense fallback={
            <div className="pane-center">
              <div className="empty">
                <div className="spinner" />
                <div className="sub">그래프 로딩 중…</div>
              </div>
            </div>
          }>
            <GraphView session={session} docs={docs} onSelect={selectGraphDoc} />
          </Suspense>
        ) : selected ? (
          <div className="doc-show" key={selected.id}>
            <div className="doc-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                {crumb && <div className="crumb">{crumb}</div>}
                <div className="title">{selected.title}</div>
                <div className="doc-updated">업데이트 {formatUpdatedAt(selected.updatedAt)}</div>
              </div>
              <button
                className={`icon-btn doc-refresh${docLoading ? ' loading' : ''}`}
                onClick={retry}
                disabled={docLoading}
                aria-label="문서 새로고침"
                title="문서 새로고침"
              >
                <Refresh size={14} />
              </button>
              {canManage && (
                <button
                  className="icon-btn"
                  onClick={() => setSharingDoc(selected)}
                  aria-label="공유 링크"
                  title="공유 링크"
                >
                  <LinkIcon size={14} />
                </button>
              )}
              {canManage && (
                <button
                  className="icon-btn"
                  onClick={() => setEditingDoc(selected)}
                  aria-label="문서 편집"
                  title="문서 편집"
                >
                  <Pencil size={14} />
                </button>
              )}
              <span className="badge badge-brand">{selected.type}</span>
              <span className={`badge ${selected.visibility === 'private' ? 'badge-amber' : 'badge-neutral'}`}>
                {selected.visibility === 'private' ? '비공개' : '공개'}
              </span>
              {loggedIn && highlights.length > 0 && (
                <div className="hl-menu-wrap">
                  <button className="hl-menu-btn" type="button" aria-label="하이라이트 목록"
                    onClick={() => setHlMenuOpen((o) => !o)}>🔆 {highlights.length}</button>
                  {hlMenuOpen && (
                    <div className="hl-menu">
                      <HighlightList highlights={highlights} orphanIds={orphanIds}
                        onJump={(id) => { frameRef.current?.contentWindow?.postMessage({ type: 'hl:scroll-to', id }, '*'); setHlMenuOpen(false); }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="doc-reader">
              {loadError ? (
                <div className="doc-page msg" key="err">
                  <div className="empty">
                    <div className="err-badge"><Alert size={28} /></div>
                    <div className="title" style={{ color: 'var(--text-strong)' }}>문서를 불러오지 못했습니다</div>
                    <div className="sub">파일이 이동되었거나 접근 권한이 없을 수 있습니다.</div>
                    <div style={{ marginTop: 20 }}>
                      <button className="btn btn-ghost" onClick={retry}>다시 시도</button>
                    </div>
                  </div>
                </div>
              ) : docHtml !== null ? (
                <div className="doc-page" key="page">
                  <iframe
                    ref={frameRef}
                    className={`doc-frame${frameReady ? ' ready' : ''}`}
                    title={selected.title}
                    src={blobUrl ?? undefined}
                    onLoad={() => {
                      sendThemeToFrame();
                      setFrameReady(true);
                    }}
                    sandbox="allow-scripts allow-popups allow-same-origin allow-popups-to-escape-sandbox"
                  />
                </div>
              ) : (
                <div className="doc-page msg loading-glow" key="loading">
                  <div className="empty"><div className="spinner" /><div className="sub">문서 불러오는 중…</div></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="pane-center">
            <div className="empty">
              <Logo size={42} />
              <div className="title">문서를 선택하세요</div>
              <div className="sub">왼쪽 트리에서 문서를 클릭하면<br />이 영역에 내용이 표시됩니다.</div>
            </div>
          </div>
        )}
      </main>

      {editingDoc && (
        <DocEditModal
          doc={editingDoc}
          saving={savingDoc}
          error={docSaveError}
          onClose={() => setEditingDoc(null)}
          onSave={async (patch) => {
            const updated = await updateDocMeta(editingDoc.id, patch);
            setSelected(updated);
            setEditingDoc(null);
            refetchDocs();
            refetchFolders();
            retry();
          }}
        />
      )}

      {sharingDoc && (
        <ShareLinkModal
          doc={sharingDoc}
          loading={shareActions.loading}
          error={shareActions.error}
          onClose={() => setSharingDoc(null)}
          onList={shareActions.listShareLinks}
          onCreate={shareActions.createShareLink}
          onRevoke={shareActions.revokeShareLink}
        />
      )}

      {createFolderParent !== undefined && (
        <CreateFolderDialog
          parentPath={createFolderParent}
          saving={folderActions.saving}
          onClose={() => setCreateFolderParent(undefined)}
          onCreate={async (name) => {
            await folderActions.createFolder(createFolderParent, name);
            setCreateFolderParent(undefined);
            refetchFolders();
          }}
        />
      )}

      {renameTarget && (
        <TreeRenameDialog
          title={renameTarget.kind === 'file' ? '파일 이름 변경' : '폴더 이름 변경'}
          currentName={
            renameTarget.kind === 'file'
              ? renameTarget.doc.path.split('/').at(-1) ?? renameTarget.doc.path
              : renameTarget.name
          }
          saving={savingDoc || folderActions.saving}
          onClose={() => setRenameTarget(null)}
          onRename={async (name) => {
            if (renameTarget.kind === 'file') {
              const parent = folderPathOf(renameTarget.doc.path);
              const nextPath = parent ? `${parent}/${name}` : name;
              if (nextPath !== renameTarget.doc.path) {
                const updated = await updateDocMeta(renameTarget.doc.id, { path: nextPath });
                setSelected(updated);
                refetchDocs();
                refetchFolders();
                retry();
              }
            } else {
              const result = await folderActions.renameFolder(renameTarget.path, name);
              if (selected) {
                const updatedSelected = result.movedDocuments.find((doc) => doc.id === selected.id);
                if (updatedSelected) setSelected(updatedSelected);
              }
              refetchDocs();
              refetchFolders();
            }
            setRenameTarget(null);
          }}
        />
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      {loggedIn && popover && (
        <div className="hl-popover" style={{ position: 'fixed', left: popover.x, top: popover.y }}>
          <button className="hl-pop-main" onClick={() => createFromPopover([])}>🔆 하이라이트</button>
          {['편집', '삭제', '궁금', '중요', '확인'].map((k) => (
            <button key={k} className="hl-pop-kw" onClick={() => createFromPopover([k])}>{k}</button>
          ))}
        </div>
      )}

      {editing && (
        <HighlightEditor
          highlight={editing}
          style={editorPos ? { left: editorPos.x, top: editorPos.y } : undefined}
          onSave={(patch) => update(editing.id, patch)}
          onDelete={() => {
            remove(editing.id);
            frameRef.current?.contentWindow?.postMessage({ type: 'hl:remove', id: editing.id }, '*');
          }}
          onClose={() => { setEditing(null); setEditorPos(null); }}
        />
      )}
    </div>
  );
}
