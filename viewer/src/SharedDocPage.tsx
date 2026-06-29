import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocSummary } from '../../shared/buildTree';
import { supabaseUrl } from './supabase';
import { injectThemeBridge } from './useDocHtml';
import { Alert, Logo } from './icons';

type SharedDocResponse = {
  document: DocSummary;
  html: string;
};

export function SharedDocPage({ token }: { token: string }) {
  const [data, setData] = useState<SharedDocResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setData(null);
    setError(null);
    fetch(`${supabaseUrl}/functions/v1/shared-docs/${encodeURIComponent(token)}`, { signal: ac.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? '공유 문서를 불러오지 못했습니다.');
        setData({ document: body.document, html: injectThemeBridge(body.html) });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, [token]);

  const blobUrl = useMemo(
    () => (data ? URL.createObjectURL(new Blob([data.html], { type: 'text/html' })) : null),
    [data],
  );
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);
  useEffect(() => setFrameReady(false), [blobUrl]);

  if (error) {
    return (
      <div className="shared-shell">
        <div className="empty">
          <div className="err-badge"><Alert size={28} /></div>
          <div className="title" style={{ color: 'var(--text-strong)' }}>공유 문서를 열 수 없습니다</div>
          <div className="sub">{error}</div>
        </div>
      </div>
    );
  }

  if (!data || !blobUrl) {
    return (
      <div className="shared-shell">
        <div className="empty"><Logo size={42} /><div className="title">불러오는 중...</div></div>
      </div>
    );
  }

  return (
    <div className="shared-doc">
      <header className="doc-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crumb">공유 문서</div>
          <div className="title">{data.document.title}</div>
        </div>
        <span className="badge badge-brand">{data.document.type}</span>
      </header>
      <div className="doc-reader">
        <div className="doc-page">
          <iframe
            ref={frameRef}
            className={`doc-frame${frameReady ? ' ready' : ''}`}
            title={data.document.title}
            src={blobUrl}
            onLoad={() => {
              frameRef.current?.contentWindow?.postMessage({ type: 'set-theme', theme: 'dark' }, '*');
              setFrameReady(true);
            }}
            sandbox="allow-scripts allow-popups allow-same-origin allow-popups-to-escape-sandbox"
          />
        </div>
      </div>
    </div>
  );
}
