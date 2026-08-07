import { describe, expect, it } from 'vitest';
import { planFolderDelete } from './deletePlan';

const docs = [
  { id: 'a/b/one', path: 'a/b/one' },
  { id: 'a/b/c/two', path: 'a/b/c/two' },
  { id: 'a/bc/three', path: 'a/bc/three' }, // sibling prefix — must NOT be caught
  { id: 'z/four', path: 'z/four' },
];

const folders = [
  { path: 'a' },
  { path: 'a/b' },
  { path: 'a/b/c' },
  { path: 'a/b/c/d' },
  { path: 'a/bc' }, // sibling prefix — must NOT be caught
  { path: 'z' },
];

describe('planFolderDelete', () => {
  it('collects only documents under the folder, not sibling prefixes', () => {
    const plan = planFolderDelete('a/b', docs, folders);
    expect(plan.docs).toEqual(['a/b/one', 'a/b/c/two']);
  });

  it('collects descendant folders deepest-first and puts itself last', () => {
    const plan = planFolderDelete('a/b', docs, folders);
    expect(plan.folders).toEqual(['a/b/c/d', 'a/b/c', 'a/b']);
  });

  it('reports counts', () => {
    expect(planFolderDelete('a/b', docs, folders).counts).toEqual({ docs: 2, folders: 3 });
  });

  it('handles a leaf folder with nothing inside', () => {
    const plan = planFolderDelete('a/b/c/d', docs, folders);
    expect(plan.docs).toEqual([]);
    expect(plan.folders).toEqual(['a/b/c/d']);
    expect(plan.counts).toEqual({ docs: 0, folders: 1 });
  });

  it('includes the folder itself even when it is not registered in document_folders', () => {
    const plan = planFolderDelete('z', docs, []);
    expect(plan.docs).toEqual(['z/four']);
    expect(plan.folders).toEqual(['z']);
  });

  it('normalizes the folder path before matching', () => {
    expect(planFolderDelete(' a/b/ ', docs, folders).docs).toEqual(['a/b/one', 'a/b/c/two']);
  });

  it('rejects an empty folder path', () => {
    expect(() => planFolderDelete('  ', docs, folders)).toThrow('Folder path cannot be empty');
  });
});
