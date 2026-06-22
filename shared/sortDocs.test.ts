import { describe, it, expect } from 'vitest';
import { sortDocs } from './sortDocs';
import type { DocSummary } from './buildTree';

const d = (o: Partial<DocSummary> & { title: string }): DocSummary => ({
  id: o.title,
  title: o.title,
  type: o.type ?? 'tech-note',
  path: `p/${o.title}`,
  visibility: 'public',
  bucket: 'public',
  storageKey: 'k',
  tags: [],
  category: 'c',
  createdAt: o.createdAt ?? '2026-01-01T00:00:00Z',
  updatedAt: o.updatedAt ?? '2026-01-01T00:00:00Z',
});

describe('sortDocs', () => {
  it('sorts by name ascending and descending', () => {
    const a = [d({ title: 'b' }), d({ title: 'a' }), d({ title: 'c' })];
    expect(sortDocs(a, 'name', 'asc').map((x) => x.title)).toEqual(['a', 'b', 'c']);
    expect(sortDocs(a, 'name', 'desc').map((x) => x.title)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by created date', () => {
    const a = [
      d({ title: 'x', createdAt: '2026-03-01T00:00:00Z' }),
      d({ title: 'y', createdAt: '2026-01-01T00:00:00Z' }),
    ];
    expect(sortDocs(a, 'created', 'asc').map((x) => x.title)).toEqual(['y', 'x']);
  });

  it('does not mutate the input array', () => {
    const a = [d({ title: 'b' }), d({ title: 'a' })];
    const before = a.map((x) => x.title);
    sortDocs(a, 'name', 'asc');
    expect(a.map((x) => x.title)).toEqual(before);
  });
});
