import { useEffect, useMemo, useState } from 'react';
import { FileTree } from './FileTree';
import { useDocs } from './useDocs';
import { useSession } from './auth';
import { AuthBar } from './AuthBar';
import { docUrl } from './supabase';
import type { DocSummary } from '../../shared/buildTree';

export default function App() {
  const { session } = useSession();
  const { docs, loading, error } = useDocs(session?.user?.id ?? null);
  const [selected, setSelected] = useState<DocSummary | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(t) ||
        d.category.toLowerCase().includes(t) ||
        d.type.toLowerCase().includes(t) ||
        d.tags.some((tag) => tag.toLowerCase().includes(t)),
    );
  }, [docs, q]);

  // Supabase serves uploaded HTML as text/plain (anti-XSS on its domain), so we
  // fetch the doc text and render it via a sandboxed <iframe srcDoc> instead of src.
  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setDocHtml(null);
      return;
    }
    setDocHtml(null);
    docUrl(selected)
      .then((url) => fetch(url))
      .then((r) => r.text())
      .then((html) => {
        if (!cancelled) setDocHtml(html);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setDocHtml('<p style="color:#c00;padding:16px">문서를 불러오지 못했습니다.</p>');
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="app">
      <aside className="sidebar">
        <AuthBar session={session} />
        <input
          className="filter"
          placeholder="태그·카테고리·제목 필터"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="tree">
          {loading ? (
            <div className="center muted">불러오는 중…</div>
          ) : error ? (
            <div className="center error">에러: {error}</div>
          ) : filtered.length ? (
            <FileTree docs={filtered} onSelect={setSelected} />
          ) : (
            <div className="center muted">문서 없음</div>
          )}
        </div>
      </aside>
      <main className="pane">
        {docHtml !== null ? (
          <iframe
            title={selected?.title ?? 'doc'}
            srcDoc={docHtml}
            sandbox="allow-scripts allow-popups"
          />
        ) : (
          <div className="center muted">왼쪽에서 문서를 선택하세요</div>
        )}
      </main>
    </div>
  );
}
