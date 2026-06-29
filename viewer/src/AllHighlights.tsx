import { isActionKeyword } from '../../shared/highlightKeywords';
import type { DocSummary } from '../../shared/buildTree';
import type { Highlight } from './useHighlights';

interface Props {
  all: Highlight[];
  docs: DocSummary[];
  currentDocId?: string;
  onJump: (docId: string, id: string) => void;
}

/** All highlights across every document, grouped by document (current doc first). */
export function AllHighlights({ all, docs, currentDocId, onJump }: Props) {
  if (all.length === 0) return null;

  const groups = new Map<string, Highlight[]>();
  for (const h of all) {
    const arr = groups.get(h.doc_id) ?? [];
    arr.push(h);
    groups.set(h.doc_id, arr);
  }
  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title ?? id;
  const docIds = [...groups.keys()].sort((a, b) => {
    if (a === currentDocId) return -1;
    if (b === currentDocId) return 1;
    return titleOf(a).localeCompare(titleOf(b));
  });

  return (
    <div className="hl-all">
      {docIds.map((docId) => (
        <div key={docId} className={`hl-doc-group${docId === currentDocId ? ' current' : ''}`}>
          <div className="hl-doc-title" title={docId}>
            <span className="hl-doc-name">{titleOf(docId)}</span>
            <span className="count">{groups.get(docId)!.length}</span>
          </div>
          <div className="hl-list">
            {groups.get(docId)!.map((h) => {
              const tag = h.keywords[0];
              return (
                <button key={h.id} type="button" className="hl-item" onClick={() => onJump(docId, h.id)} title={h.exact}>
                  <span className="hl-item-head">
                    {tag && <span className={`hl-chip ${isActionKeyword(tag) ? 'action' : 'info'}`}>{tag}</span>}
                    <span className="hl-snippet">{h.exact.slice(0, 60)}</span>
                  </span>
                  {h.note && <span className="hl-item-note">{h.note}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
