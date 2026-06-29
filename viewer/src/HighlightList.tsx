import { isActionKeyword } from '../../shared/highlightKeywords';
import type { Highlight } from './useHighlights';

interface Props {
  highlights: Highlight[];
  orphanIds: Set<string>;
  onJump: (id: string) => void;
  compact?: boolean; // 헤더 스트립용
}

export function HighlightList({ highlights, orphanIds, onJump, compact }: Props) {
  if (highlights.length === 0) return null;
  return (
    <div className={`hl-list ${compact ? 'compact' : ''}`}>
      {highlights.map((h) => {
        const tag = h.keywords[0];
        const orphan = orphanIds.has(h.id);
        return (
          <button
            key={h.id}
            type="button"
            className={`hl-item ${orphan ? 'orphan' : ''}`}
            disabled={orphan}
            onClick={() => onJump(h.id)}
            title={orphan ? '본문에서 위치를 찾지 못함(고아)' : h.note ?? ''}
          >
            {tag && <span className={`hl-chip ${isActionKeyword(tag) ? 'action' : 'info'}`}>{tag}</span>}
            <span className="hl-snippet">{(h.note || h.exact).slice(0, 40)}</span>
            {orphan && <span className="hl-orphan">⚠</span>}
          </button>
        );
      })}
    </div>
  );
}
