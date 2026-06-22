import { describe, it, expect } from 'vitest';
import { buildGraph, graphSchema } from './graph';
import type { DocSummary } from './buildTree';

const d = (o: Partial<DocSummary> & { id: string }): DocSummary => ({
  id: o.id,
  title: o.title ?? o.id,
  type: 'tech-note',
  path: `p/${o.id}`,
  visibility: 'public',
  bucket: 'public',
  storageKey: 'k',
  tags: o.tags ?? [],
  category: o.category ?? 'general',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('buildGraph', () => {
  it('makes one node per doc, carrying label/type', () => {
    const g = buildGraph([d({ id: 'a', title: 'A' })]);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]).toMatchObject({ id: 'a', label: 'A', type: 'tech-note' });
  });

  it('links docs that share a tag, weighted by shared count', () => {
    const g = buildGraph([
      d({ id: 'a', tags: ['react', 'cache'] }),
      d({ id: 'b', tags: ['react', 'cache', 'x'] }),
    ]);
    expect(g.edges).toEqual([{ source: 'a', target: 'b', weight: 2, kind: 'tag' }]);
  });

  it('makes no edge when no tags are shared', () => {
    const g = buildGraph([d({ id: 'a', tags: ['x'] }), d({ id: 'b', tags: ['y'] })]);
    expect(g.edges).toHaveLength(0);
  });

  it('clusters by category', () => {
    const g = buildGraph([d({ id: 'a', category: 'fe' }), d({ id: 'b', category: 'be' })]);
    expect(g.clusters.map((c) => c.id).sort()).toEqual(['be', 'fe']);
  });

  it('output validates against graphSchema', () => {
    const g = buildGraph([d({ id: 'a', tags: ['t'] }), d({ id: 'b', tags: ['t'] })]);
    expect(() => graphSchema.parse(g)).not.toThrow();
  });
});
