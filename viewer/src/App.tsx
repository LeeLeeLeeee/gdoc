import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileTree } from './FileTree';
import { CardView } from './CardView';
import { useDocs } from './useDocs';
import { useDocHtml } from './useDocHtml';
import { useSession } from './auth';
import { AuthBar } from './AuthBar';
import { LoginModal } from './LoginModal';
import { SortControl } from './SortControl';
import { formatUpdatedAt } from './dateFormat';
import { sortDocs, type SortKey, type SortDir } from '../../shared/sortDocs';
import type { DocSummary } from '../../shared/buildTree';
import { Logo, Search, Filter, X, Alert, Moon, Sun, Refresh } from './icons';

const loadGraphView = () => import('./GraphView').then((m) => ({ default: m.GraphView }));
const GraphView = lazy(loadGraphView);
const preloadGraphView = () => {
  void loadGraphView();
};

type ThemeMode = 'dark' | 'light';
const THEME_STORAGE_KEY = 'gdoc-theme';

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
  const { session, ready } = useSession();
  const { docs, loading, error, refetch: refetchDocs } = useDocs(session?.user?.id ?? null, ready);
  const now = useNow();

  const [q, setQ] = useState(''); // meta filter
  const [name, setName] = useState(''); // name search
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [view, setView] = useState<'tree' | 'card' | 'graph'>('tree');
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  const [selected, setSelected] = useState<DocSummary | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const { docHtml, loadError, retry } = useDocHtml(selected);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // meta filter AND name search, then sort
  const visible = useMemo(() => {
    const m = q.trim().toLowerCase();
    const n = name.trim().toLowerCase();
    const filtered = docs.filter((d) => {
      const metaOk =
        !m ||
        d.title.toLowerCase().includes(m) ||
        d.category.toLowerCase().includes(m) ||
        d.type.toLowerCase().includes(m) ||
        d.tags.some((t) => t.toLowerCase().includes(m));
      const nameOk = !n || d.title.toLowerCase().includes(n);
      return metaOk && nameOk;
    });
    return sortDocs(filtered, sortKey, sortDir);
  }, [docs, q, name, sortKey, sortDir]);

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

  const hasFilter = q.trim() !== '' || name.trim() !== '';
  const countLabel = !ready ? '문서' : session ? `문서 · ${docs.length}` : `문서 · 공개 ${docs.length}`;
  const crumb = selected ? selected.path.split('/').slice(0, -1).join(' / ') : '';
  const docLoading = !!selected && docHtml === null && !loadError;
  const loadingPath = docLoading && selected ? selected.path : undefined;
  // mobile: single column — show the list, or the detail (a doc / the graph)
  const mobileScreen = view === 'graph' || selected ? 'show-detail' : 'show-list';
  const filterTerms = useMemo(() => [q, name], [q, name]);
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
          <div className="row-between">
            <span className="eyebrow">{countLabel}</span>
            <div className="list-actions">
              <button
                className={`icon-btn list-refresh${loading ? ' loading' : ''}`}
                onClick={refetchDocs}
                disabled={!ready || loading}
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
                <input className="gd-input" style={{ height: 34 }} placeholder="이름으로 검색" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {hasFilter && (
                <div className="chips">
                  {q.trim() && (
                    <span className="chip">메타: {q.trim()} <button onClick={() => setQ('')}><X size={11} /></button></span>
                  )}
                  {name.trim() && (
                    <span className="chip">이름: {name.trim()} <button onClick={() => setName('')}><X size={11} /></button></span>
                  )}
                  <span className="count">{visible.length}개 결과 · AND</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="tree">
          {view === 'graph' ? (
            <div className="center muted" style={{ padding: 24, textAlign: 'center' }}>지식 그래프를<br />오른쪽에 표시 중</div>
          ) : !ready || loading ? (
            <div className="center muted" style={{ padding: 24 }}>불러오는 중…</div>
          ) : error ? (
            <div className="center error-text" style={{ padding: 24 }}>에러: {error}</div>
          ) : visible.length ? (
            view === 'tree' ? (
              <FileTree docs={visible} selectedPath={selected?.path} loadingPath={loadingPath} now={now} onSelect={setSelected} />
            ) : (
              <CardView docs={visible} terms={filterTerms} selectedPath={selected?.path} loadingPath={loadingPath} now={now} onSelect={setSelected} filtered={hasFilter} />
            )
          ) : (
            <div className="center muted" style={{ padding: 24, textAlign: 'center' }}>
              {hasFilter ? '필터와 일치하는 문서가 없습니다' : '문서 없음'}
            </div>
          )}
        </div>
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
              <span className="badge badge-brand">{selected.type}</span>
              <span className={`badge ${selected.visibility === 'private' ? 'badge-amber' : 'badge-neutral'}`}>
                {selected.visibility === 'private' ? '비공개' : '공개'}
              </span>
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
                    sandbox="allow-scripts allow-popups allow-same-origin"
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

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
