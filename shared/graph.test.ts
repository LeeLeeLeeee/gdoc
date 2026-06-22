import { describe, it, expect } from 'vitest';
import { buildGraph, buildSemanticGraph, cosine, graphSchema } from './graph';
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

describe('cosine', () => {
  it('is 1 for identical, 0 for orthogonal / zero vectors', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe('buildSemanticGraph', () => {
  const vec = {
    a: [1, 0, 0],
    b: [0.96, 0.28, 0], // ~cos 0.96 to a
    c: [0, 0, 1], // orthogonal to a/b
  };
  const docs = [d({ id: 'a', category: 'fe' }), d({ id: 'b', category: 'fe' }), d({ id: 'c', category: 'be' })];

  it('links similar docs (kind semantic) and not dissimilar ones', () => {
    const g = buildSemanticGraph(docs, vec, { threshold: 0.35 });
    expect(g.edges).toEqual([{ source: 'a', target: 'b', weight: 4, kind: 'semantic' }]);
  });

  it('clusters by connected component, labelled by dominant category', () => {
    const g = buildSemanticGraph(docs, vec, { threshold: 0.35 });
    expect(g.nodes.find((n) => n.id === 'a')!.cluster).toBe(g.nodes.find((n) => n.id === 'b')!.cluster);
    expect(g.nodes.find((n) => n.id === 'c')!.cluster).not.toBe(g.nodes.find((n) => n.id === 'a')!.cluster);
    expect(g.clusters.find((cl) => cl.id === g.nodes.find((n) => n.id === 'a')!.cluster)!.label).toBe('fe');
  });

  it('skips docs without a vector, output validates against graphSchema', () => {
    const g = buildSemanticGraph(docs, { a: vec.a, b: vec.b }, { threshold: 0.35 });
    expect(() => graphSchema.parse(g)).not.toThrow();
    expect(g.nodes).toHaveLength(3); // c still a node, just unlinked
  });
});
