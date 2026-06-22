import type { DocSummary } from '../../shared/buildTree';
import { File } from './icons';

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ts = terms.map((t) => t.trim()).filter(Boolean);
  if (!ts.length) return <>{text}</>;
  const re = new RegExp(`(${ts.map(escapeReg).join('|')})`, 'gi');
  return (
    <>
      {text.split(re).map((p, i) =>
        ts.some((t) => t.toLowerCase() === p.toLowerCase()) ? (
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
  selectedPath,
  loadingPath,
  onSelect,
  filtered,
}: {
  docs: DocSummary[];
  terms: string[];
  selectedPath?: string;
  loadingPath?: string;
  onSelect: (d: DocSummary) => void;
  filtered: boolean;
}) {
  const groups: { label: string; items: DocSummary[] }[] = [];
  for (const d of docs) {
    const label = d.path.split('/').slice(0, -1).join(' / ') || '문서';
    const g = groups.find((x) => x.label === label) ?? (groups.push({ label, items: [] }), groups[groups.length - 1]);
    g.items.push(d);
  }

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
                  <span style={{ flex: 1, minWidth: 0 }}><Highlight text={d.title} terms={terms} /></span>
                  {d.visibility === 'private' && <span className="tag" style={{ color: 'var(--amber-500)' }}>비공개</span>}
                </div>
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
