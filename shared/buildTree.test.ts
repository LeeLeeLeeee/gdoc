import { describe, it, expect } from 'vitest';
import { buildTree, flattenTree, type DocSummary } from './buildTree';

const doc = (path: string, extra: Partial<DocSummary> = {}): DocSummary => ({
  id: path,
  title: path.split('/').at(-1)!,
  type: 'tech-note',
  path,
  visibility: 'public',
  bucket: 'public',
  storageKey: `${path}.html`,
  tags: [],
  category: 'frontend',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('buildTree', () => {
  it('nests a single doc into its folder chain with a file leaf', () => {
    const tree = buildTree([doc('a/b/c')]);
    expect(tree).toHaveLength(1);
    const a = tree[0];
    expect(a).toMatchObject({ kind: 'folder', name: 'a', path: 'a' });
    if (a.kind !== 'folder') throw new Error('expected folder');
    const b = a.children[0];
    expect(b).toMatchObject({ kind: 'folder', name: 'b', path: 'a/b' });
    if (b.kind !== 'folder') throw new Error('expected folder');
    expect(b.children[0]).toMatchObject({ kind: 'file', name: 'c', path: 'a/b/c' });
  });

  it('merges docs that share a folder prefix', () => {
    const tree = buildTree([doc('a/b/c'), doc('a/b/d')]);
    expect(tree).toHaveLength(1);
    const b = (tree[0] as any).children[0];
    expect(b.children.map((n: any) => n.name)).toEqual(['c', 'd']);
  });

  it('keeps separate roots separate', () => {
    const tree = buildTree([doc('a/x'), doc('b/y')]);
    expect(tree.map((n) => n.name)).toEqual(['a', 'b']);
  });

  it('sorts folders before files, each alphabetically', () => {
    const tree = buildTree([doc('root/zebra'), doc('root/apple'), doc('root/sub/leaf')]);
    const root = tree[0];
    if (root.kind !== 'folder') throw new Error('expected folder');
    expect(root.children.map((n) => `${n.kind}:${n.name}`)).toEqual([
      'folder:sub',
      'file:apple',
      'file:zebra',
    ]);
  });

  it('preserves insertion order when sort is false', () => {
    const tree = buildTree([doc('a/zebra'), doc('a/apple')], { sort: false });
    const folder = tree[0];
    if (folder.kind !== 'folder') throw new Error('expected folder');
    expect(folder.children.map((n) => n.name)).toEqual(['zebra', 'apple']);
  });

  it('flattenTree merges single-child folder chains', () => {
    const t = flattenTree(buildTree([doc('a/b/c'), doc('a/b/d')]));
    expect(t[0].name).toBe('a / b');
    if (t[0].kind !== 'folder') throw new Error('expected folder');
    expect(t[0].children.map((n) => n.name)).toEqual(['c', 'd']);
  });

  it('flattenTree does not merge a folder holding a single file', () => {
    const t = flattenTree(buildTree([doc('a/x')]));
    expect(t[0].name).toBe('a');
  });

  it('carries the doc summary on the file leaf', () => {
    const tree = buildTree([doc('a/b', { title: 'Hello', visibility: 'private' })]);
    const leaf = (tree[0] as any).children[0];
    expect(leaf.doc.title).toBe('Hello');
    expect(leaf.doc.visibility).toBe('private');
  });
});
