import { useEffect, useRef, useState } from 'react';
import type { SortKey, SortDir } from '../../shared/sortDocs';
import { SortIcon, Chevron, Check, Up, Down } from './icons';

const LABELS: Record<SortKey, string> = {
  name: '이름순',
  updated: '최근 수정순',
  created: '만든 날짜순',
  type: '타입순',
};

export function SortControl({
  sortKey,
  sortDir,
  onChange,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onChange: (key: SortKey, dir: SortDir) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="sort" ref={ref}>
      <button className={`sort-btn${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <SortIcon /> {LABELS[sortKey]} <Chevron size={11} />
      </button>
      {open && (
        <div className="sort-menu">
          {(Object.keys(LABELS) as SortKey[]).map((k) => (
            <div key={k} className={`sort-item${k === sortKey ? ' sel' : ''}`} onClick={() => onChange(k, sortDir)}>
              <span style={{ width: 13, display: 'inline-flex' }}>{k === sortKey && <Check color="var(--blue-300)" />}</span>
              <span style={{ flex: 1 }}>{LABELS[k]}</span>
            </div>
          ))}
          <div className="sort-dir">
            <button className={sortDir === 'asc' ? 'on' : ''} onClick={() => onChange(sortKey, 'asc')}><Up /> 오름차순</button>
            <button className={sortDir === 'desc' ? 'on' : ''} onClick={() => onChange(sortKey, 'desc')}><Down /> 내림차순</button>
          </div>
        </div>
      )}
    </div>
  );
}
