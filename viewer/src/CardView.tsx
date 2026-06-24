import { useMemo } from 'react';
import type { DocSummary } from '../../shared/buildTree';
import { formatRelativeUpdatedAt } from './dateFormat';
import { File } from './icons';

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type HighlightConfig = {
  re: RegExp;
  terms: Set<string>;
};

function Highlight({ text, highlight }: { text: string; highlight: HighlightConfig | null }) {
  if (!highlight) return <>{text}</>;
  return (
    <>
      {text.split(highlight.re).map((p, i) =>
        highlight.terms.has(p.toLowerCase()) ? (
          <mark key={i} className="hl">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Grouped-card variant (design frame C): docs grouped by folder, search terms highlighted. */
export function CardView({
  docs,
  terms,
  snippets,
  selectedPath,
  loadingPath,
  now,
  onSelect,
  filtered,
}: {
  docs: DocSummary[];
  terms: string[];
  snippets?: Record<string, string>;
  selectedPath?: string;
  loadingPath?: string;
  now: number;
  onSelect: (d: DocSummary) => void;
  filtered: boolean;
}) {
  const highlight = useMemo(() => {
    const ts = terms.map((t) => t.trim()).filter(Boolean);
    if (!ts.length) return null;
    return {
      re: new RegExp(`(${ts.map(escapeReg).join('|')})`, 'gi'),
      terms: new Set(ts.map((t) => t.toLowerCase())),
    };
  }, [terms]);

  const groups = useMemo(() => {
    const byLabel = new Map<string, { label: string; items: DocSummary[] }>();
    for (const d of docs) {
      const label = d.path.split('/').slice(0, -1).join(' / ') || '문서';
      const group = byLabel.get(label);
      if (group) {
        group.items.push(d);
      } else {
        byLabel.set(label, { label, items: [d] });
      }
    }
    return [...byLabel.values()];
  }, [docs]);

  return (
    <div className="cards-wrap">
      {groups.map((g) => (
        <div className="card-group" key={g.label}>
          <div className="eyebrow" style={{ padding: '0 4px 8px' }}>{g.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.items.map((d) => (
              <div key={d.id} className={`card${d.path === selectedPath ? ' sel' : ''}${d.path === loadingPath ? ' loading' : ''}`} onClick={() => onSelect(d)}>
                <div className="card-title">
                  <File size={14} color="var(--text-faint)" />
                  <span style={{ flex: 1, minWidth: 0 }}><Highlight text={d.title} highlight={highlight} /></span>
                  <span className="relative-time" title={`업데이트 ${d.updatedAt}`}>{formatRelativeUpdatedAt(d.updatedAt, now)}</span>
                  {d.visibility === 'private' && <span className="tag" style={{ color: 'var(--amber-500)' }}>비공개</span>}
                </div>
                {snippets?.[d.id] && (
                  <div className="card-snippet"><Highlight text={snippets[d.id]} highlight={highlight} /></div>
                )}
                <div className="card-tags">
                  <span className="tag type">{d.type}</span>
                  {d.tags.map((t) => <span className="tag" key={t}>#{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {filtered && <div className="card-note">필터와 일치하지 않는 항목은 숨겨졌습니다</div>}
    </div>
  );
}
