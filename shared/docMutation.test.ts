import { describe, expect, it } from 'vitest';
import { planDocMetaMutation } from './docMutation';

const current = {
  id: 'playground/old/file',
  path: 'playground/old/file',
  bucket: 'private' as const,
  storageKey: 'old-key.html',
  visibility: 'private' as const,
};

const meta = {
  type: 'tech-note' as const,
  title: 'Title',
  tags: [],
  category: 'backend',
  createdAt: '2026-06-25T00:00:00Z',
  visibility: 'private' as const,
  path: 'playground/old/file',
  assets: [],
};

describe('planDocMetaMutation', () => {
  it('keeps id and storage when path and visibility do not change', () => {
    const plan = planDocMetaMutation(current, meta);
    expect(plan).toMatchObject({
      oldId: 'playground/old/file',
      newId: 'playground/old/file',
      idChanged: false,
      bucketChanged: false,
      storageChanged: false,
    });
  });

  it('computes id and storage key when path changes', () => {
    const plan = planDocMetaMutation(current, { ...meta, path: 'playground/new/File Name' });
    expect(plan.newId).toBe('playground/new/file-name');
    expect(plan.idChanged).toBe(true);
    expect(plan.storageChanged).toBe(true);
    expect(plan.newStorageKey).toMatch(/playground-new-file-name-[0-9a-f]{10}\.html/);
  });

  it('moves bucket when visibility changes', () => {
    const plan = planDocMetaMutation(current, { ...meta, visibility: 'public' });
    expect(plan.newBucket).toBe('public');
    expect(plan.bucketChanged).toBe(true);
    expect(plan.storageChanged).toBe(false);
  });

  it('rejects patched metadata without a path', () => {
    const { path, ...withoutPath } = meta;
    expect(() => planDocMetaMutation(current, withoutPath)).toThrow('Document path is required');
  });
});
