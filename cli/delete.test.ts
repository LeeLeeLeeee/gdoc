import { describe, expect, it } from 'vitest';
import { assertFolderEmpty, deleteDoc, deleteFolderRecursive } from './delete';
import type { DbPort, DocumentRow, StoragePort } from './ports';

function row(id: string, path: string): DocumentRow {
  return {
    id,
    type: 'tech-note',
    title: id,
    tags: [],
    category: 'backend',
    createdAt: '2026-08-07T00:00:00Z',
    visibility: 'private',
    path,
    bucket: 'private',
    storageKey: `${id}.html`,
    contentHash: 'hash',
  };
}

function makeFakes(seed: DocumentRow[] = [row('a/b/one', 'a/b/one')], folders = [{ path: 'a/b' }]) {
  const ops: string[] = [];

  const storage = {
    async upload() {
      return {};
    },
    async download() {
      return '';
    },
    async remove(bucket: 'public' | 'private', key: string) {
      ops.push(`storage.remove:${bucket}/${key}`);
    },
  } satisfies StoragePort;

  const db = {
    rows: [...seed],
    folders: [...folders],
    async upsert() {},
    async listExisting() {
      return this.rows.map((r) => ({ id: r.id, contentHash: r.contentHash, path: r.path }));
    },
    async getByIdOrPath(ref: string) {
      return this.rows.find((r) => r.id === ref || r.path === ref) ?? null;
    },
    async exists(id: string) {
      return this.rows.some((r) => r.id === id);
    },
    async updateIdentity() {},
    async deleteDoc(id: string) {
      ops.push(`db.deleteDoc:${id}`);
      this.rows = this.rows.filter((r) => r.id !== id);
    },
    async listFolders() {
      return this.folders;
    },
    async deleteFolder(path: string) {
      ops.push(`db.deleteFolder:${path}`);
      this.folders = this.folders.filter((f) => f.path !== path);
    },
  } satisfies DbPort & { rows: DocumentRow[]; folders: { path: string }[] };

  return { ports: { storage, db }, ops, db, storage };
}

describe('deleteDoc', () => {
  it('refuses to delete without --confirm', async () => {
    const { ports, ops } = makeFakes();
    await expect(deleteDoc('a/b/one', ports, {})).rejects.toThrow('requires --confirm');
    expect(ops).toEqual([]);
  });

  it('reports the target on --dry-run without touching anything', async () => {
    const { ports, ops, db } = makeFakes();
    const result = await deleteDoc('a/b/one', ports, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.deletedDocs).toEqual(['a/b/one']);
    expect(ops).toEqual([]);
    expect(db.rows).toHaveLength(1);
  });

  it('deletes the database row before the storage object', async () => {
    const { ports, ops } = makeFakes();
    const result = await deleteDoc('a/b/one', ports, { confirm: true });
    expect(ops).toEqual(['db.deleteDoc:a/b/one', 'storage.remove:private/a/b/one.html']);
    expect(result.warnings).toEqual([]);
  });

  it('resolves a document by path as well as by id', async () => {
    const { ports, ops } = makeFakes([row('doc-id', 'a/b/one')]);
    await deleteDoc('a/b/one', ports, { confirm: true });
    expect(ops[0]).toBe('db.deleteDoc:doc-id');
  });

  it('keeps the deletion and warns when the storage object cannot be removed', async () => {
    const { ports, db } = makeFakes();
    ports.storage.remove = async () => {
      throw new Error('storage down');
    };
    const result = await deleteDoc('a/b/one', ports, { confirm: true });
    expect(db.rows).toHaveLength(0);
    expect(result.warnings).toEqual(['storage 객체 삭제 실패: private/a/b/one.html (storage down)']);
  });

  it('throws when the document does not exist', async () => {
    const { ports } = makeFakes();
    await expect(deleteDoc('nope', ports, { confirm: true })).rejects.toThrow('document not found: nope');
  });
});

describe('assertFolderEmpty', () => {
  it('rejects a folder that still holds documents', async () => {
    const { ports } = makeFakes([row('a/b/one', 'a/b/one')], [{ path: 'a/b' }]);
    await expect(assertFolderEmpty('a/b', ports)).rejects.toThrow('folder not empty: a/b (문서 1개 · 하위 폴더 0개)');
  });

  it('rejects a folder that still holds subfolders', async () => {
    const { ports } = makeFakes([], [{ path: 'a/b' }, { path: 'a/b/c' }]);
    await expect(assertFolderEmpty('a/b', ports)).rejects.toThrow('하위 폴더 1개');
  });

  it('accepts an empty folder', async () => {
    const { ports } = makeFakes([row('z/four', 'z/four')], [{ path: 'a/b' }]);
    await expect(assertFolderEmpty('a/b', ports)).resolves.toBeUndefined();
  });
});

describe('deleteFolderRecursive', () => {
  const seed = [row('a/b/one', 'a/b/one'), row('a/b/c/two', 'a/b/c/two'), row('a/bc/three', 'a/bc/three')];
  const folders = [{ path: 'a' }, { path: 'a/b' }, { path: 'a/b/c' }, { path: 'a/bc' }];

  it('refuses to run without --confirm', async () => {
    const { ports, ops } = makeFakes(seed, folders);
    await expect(deleteFolderRecursive('a/b', ports, {})).rejects.toThrow('requires --confirm');
    expect(ops).toEqual([]);
  });

  it('reports counts on --dry-run without deleting', async () => {
    const { ports, ops, db } = makeFakes(seed, folders);
    const result = await deleteFolderRecursive('a/b', ports, { dryRun: true });
    expect(result.deletedDocs).toEqual(['a/b/one', 'a/b/c/two']);
    expect(result.deletedFolders).toEqual(['a/b/c', 'a/b']);
    expect(ops).toEqual([]);
    expect(db.rows).toHaveLength(3);
  });

  it('deletes contained documents first, then folders deepest-first', async () => {
    const { ports, ops, db } = makeFakes(seed, folders);
    await deleteFolderRecursive('a/b', ports, { confirm: true });
    expect(ops).toEqual([
      'db.deleteDoc:a/b/one',
      'storage.remove:private/a/b/one.html',
      'db.deleteDoc:a/b/c/two',
      'storage.remove:private/a/b/c/two.html',
      'db.deleteFolder:a/b/c',
      'db.deleteFolder:a/b',
    ]);
    expect(db.rows.map((r) => r.id)).toEqual(['a/bc/three']);
    expect(db.folders.map((f) => f.path)).toEqual(['a', 'a/bc']);
  });
});
