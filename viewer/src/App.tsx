import { useEffect, useMemo, useState } from 'react';
import { FileTree } from './FileTree';
import { useDocs } from './useDocs';
import { useSession } from './auth';
import { AuthBar } from './AuthBar';
import { LoginModal } from './LoginModal';
import { SortControl } from './SortControl';
import { docUrl } from './supabase';
import { sortDocs, type SortKey, type SortDir } from '../../shared/sortDocs';
import type { DocSummary } from '../../shared/buildTree';
import { Logo, Search, Filter, X, Alert } from './icons';

export default function App() {
  const { session } = useSession();
  const { docs, loading, error } = useDocs(session?.user?.id ?? null);

  const [q, setQ] = useState(''); // meta filter
  const [name, setName] = useState(''); // name search
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [selected, setSelected] = useState<DocSummary | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [showLogin, setShowLogin] = useState(false);

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

  // load selected doc into the iframe (fetch text → srcDoc; Supabase serves HTML as text/plain)
  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setDocHtml(null);
      setLoadError(false);
      return;
    }
    setDocHtml(null);
    setLoadError(false);
    docUrl(selected)
      .then((url) => fetch(url))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((html) => !cancelled && setDocHtml(html))
      .catch((e) => {
        console.error(e);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, reload]);

  const hasFilter = q.trim() !== '' || name.trim() !== '';
  const countLabel = session ? `문서 · ${docs.length}` : `문서 · 공개 ${docs.length}`;
  const crumb = selected ? selected.path.split('/').slice(0, -1).join(' / ') : '';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-head">
          <div className="brand">
            <Logo size={20} />
            <span className="brand-name">gdoc 뷰어</span>
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
            <SortControl sortKey={sortKey} sortDir={sortDir} onChange={(k, d) => { setSortKey(k); setSortDir(d); }} />
          </div>
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
        </div>

        <div className="tree">
          {loading ? (
            <div className="center muted" style={{ padding: 24 }}>불러오는 중…</div>
          ) : error ? (
            <div className="center error-text" style={{ padding: 24 }}>에러: {error}</div>
          ) : visible.length ? (
            <FileTree docs={visible} selectedPath={selected?.path} onSelect={setSelected} />
          ) : (
            <div className="center muted" style={{ padding: 24, textAlign: 'center' }}>
              {hasFilter ? '필터와 일치하는 문서가 없습니다' : '문서 없음'}
            </div>
          )}
        </div>
      </aside>

      <main className="pane">
        {selected && loadError ? (
          <div className="pane-center">
            <div className="empty">
              <div className="err-badge"><Alert size={28} /></div>
              <div className="title" style={{ color: 'var(--text-strong)' }}>문서를 불러오지 못했습니다</div>
              <div className="sub">파일이 이동되었거나 접근 권한이 없을 수 있습니다.</div>
              <div style={{ marginTop: 20 }}>
                <button className="btn btn-ghost" onClick={() => setReload((n) => n + 1)}>다시 시도</button>
              </div>
            </div>
          </div>
        ) : selected && docHtml !== null ? (
          <>
            <div className="doc-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                {crumb && <div className="crumb">{crumb}</div>}
                <div className="title">{selected.title}</div>
              </div>
              <span className="badge badge-brand">{selected.type}</span>
              <span className={`badge ${selected.visibility === 'private' ? 'badge-amber' : 'badge-neutral'}`}>
                {selected.visibility === 'private' ? '비공개' : '공개'}
              </span>
            </div>
            <iframe className="doc-frame" title={selected.title} srcDoc={docHtml} sandbox="allow-scripts allow-popups" />
          </>
        ) : selected ? (
          <div className="pane-center">
            <div className="empty">
              <div className="spinner" />
              <div className="sub">문서 불러오는 중…</div>
            </div>
          </div>
        ) : (
          <div className="pane-center">
            <div className="pane-glow" />
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
