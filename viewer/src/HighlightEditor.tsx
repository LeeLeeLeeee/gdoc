import { useState, type CSSProperties } from 'react';
import { HIGHLIGHT_KEYWORDS, isActionKeyword } from '../../shared/highlightKeywords';
import type { Highlight } from './useHighlights';

interface Props {
  highlight: Pick<Highlight, 'exact' | 'note' | 'keywords'>;
  style?: CSSProperties;
  onSave: (patch: { note: string; keywords: string[] }) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function HighlightEditor({ highlight, style, onSave, onDelete, onClose }: Props) {
  const [keywords, setKeywords] = useState<string[]>(highlight.keywords ?? []);
  const [note, setNote] = useState(highlight.note ?? '');

  const toggle = (k: string) =>
    setKeywords((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const save = () => { onSave({ note, keywords }); onClose(); };

  return (
    <div className="hl-editor" role="dialog" aria-label="하이라이트 주석" style={style}>
      <blockquote className="hl-quote">"{highlight.exact.slice(0, 120)}"</blockquote>
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
        placeholder="메모(왜 표시했는지) · Ctrl+Enter로 저장"
        value={note}
        autoFocus
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }}
      />
      <div className="hl-editor-actions">
        <button type="button" className="btn" onClick={save}>저장</button>
        <button type="button" className="btn btn-ghost" onClick={() => { onDelete(); onClose(); }}>삭제</button>
      </div>
    </div>
  );
}
