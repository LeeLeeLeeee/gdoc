import { useEffect, useMemo, useState } from 'react';
import type { DocSummary } from '../../shared/buildTree';
import { buildShareUrl } from '../../shared/shareLinks';
import type { ShareLinkSummary } from './useShareLinks';
import { LinkIcon, X } from './icons';

type Props = {
  doc: DocSummary;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onList: (docId: string) => Promise<ShareLinkSummary[]>;
  onCreate: (docId: string, expiresAt: string | null) => Promise<ShareLinkSummary>;
  onRevoke: (id: string) => Promise<ShareLinkSummary>;
};

function expiresAtForPreset(preset: string): string | null {
  if (preset === 'never') return null;
  const days = Number(preset);
  if (!Number.isFinite(days)) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function formatDate(value: string | null) {
  if (!value) return '만료 없음';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ShareLinkModal({ doc, loading, error, onClose, onList, onCreate, onRevoke }: Props) {
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [preset, setPreset] = useState('7');
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useMemo(() => window.location.origin, []);

  useEffect(() => {
    let cancelled = false;
    onList(doc.id).then((items) => {
      if (!cancelled) setLinks(items);
    });
    return () => {
      cancelled = true;
    };
  }, [doc.id, onList]);

  const create = async () => {
    const link = await onCreate(doc.id, expiresAtForPreset(preset));
    setLinks((items) => [link, ...items]);
    if (link.token) {
      const url = buildShareUrl(origin, link.token);
      setLatestUrl(url);
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const copyLatest = async () => {
    if (!latestUrl) return;
    await navigator.clipboard?.writeText(latestUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="share-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">공유 링크</div>
            <h2>{doc.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={14} />
          </button>
        </div>

        <div className="share-create">
          <div className="visibility-control" role="radiogroup" aria-label="만료">
            <button type="button" className={preset === '7' ? 'on' : ''} onClick={() => setPreset('7')}>7일</button>
            <button type="button" className={preset === '30' ? 'on' : ''} onClick={() => setPreset('30')}>30일</button>
            <button type="button" className={preset === 'never' ? 'on' : ''} onClick={() => setPreset('never')}>무기한</button>
          </div>
          <button type="button" className="btn btn-primary" onClick={create} disabled={loading}>
            <LinkIcon size={14} /> {loading ? '생성 중...' : '링크 생성'}
          </button>
        </div>

        {latestUrl && (
          <div className="share-url">
            <span>{latestUrl}</span>
            <button type="button" className="btn btn-ghost" onClick={copyLatest}>{copied ? '복사됨' : '복사'}</button>
          </div>
        )}

        {error && <div className="error-text modal-error">{error}</div>}

        <div className="share-list">
          {links.length === 0 ? (
            <div className="muted small">아직 생성된 공유 링크가 없습니다.</div>
          ) : (
            links.map((link) => (
              <div key={link.id} className={`share-row${link.revokedAt ? ' revoked' : ''}`}>
                <div>
                  <div className="share-row-title">{link.revokedAt ? '폐기됨' : '활성 링크'}</div>
                  <div className="share-row-sub">
                    생성 {formatDate(link.createdAt)} · 만료 {formatDate(link.expiresAt)}
                  </div>
                </div>
                {!link.revokedAt && (
                  <button type="button" className="btn btn-ghost" disabled={loading} onClick={async () => {
                    const updated = await onRevoke(link.id);
                    setLinks((items) => items.map((item) => item.id === updated.id ? updated : item));
                  }}>
                    폐기
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
