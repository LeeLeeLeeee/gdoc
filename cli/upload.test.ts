import { describe, it, expect } from 'vitest';
import { uploadDoc, type UploadCtx } from './upload';
import { contentHash, storageKey } from './classify';
import { slugFromPath } from '../shared/schema';
import type { StoragePort, DbPort, DocumentRow } from './ports';

const html = (extra: Record<string, unknown> = {}) =>
  `<html><head><script type="application/json" id="gdoc-meta">${JSON.stringify({
    type: 'tech-note',
    title: 'React Query',
    category: 'frontend',
    createdAt: '2026-06-22T12:00:00Z',
    path: 'Playground/Tech Notes/React Query',
    ...extra,
  })}</script></head><body>doc</body></html>`;

const ID = slugFromPath('Playground/Tech Notes/React Query'); // playground/tech-notes/react-query

function makeFakes() {
  const storage = {
    calls: [] as { bucket: string; key: string }[],
    async upload(bucket: 'public' | 'private', key: string) {
      this.calls.push({ bucket, key });
      return { publicUrl: bucket === 'public' ? `https://cdn/${key}` : undefined };
    },
  } satisfies StoragePort & { calls: { bucket: string; key: string }[] };

  const db = {
    rows: [] as DocumentRow[],
    async upsert(row: DocumentRow) {
      this.rows.push(row);
    },
    async listExisting() {
      return [];
    },
  } satisfies DbPort & { rows: DocumentRow[] };

  return { storage, db };
}

const emptyCtx = (): UploadCtx => ({ byId: new Map(), byHash: new Map() });

describe('uploadDoc', () => {
  it('new doc → status new, uploads body then upserts a row keyed by slug(path) with hash', async () => {
    const { storage, db } = makeFakes();
    const out = await uploadDoc(html(), { storage, db }, emptyCtx());
    expect(out).toMatchObject({ status: 'new', id: ID, bucket: 'private', key: storageKey(ID) });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ id: ID, visibility: 'private', path: 'Playground/Tech Notes/React Query' });
    expect(db.rows[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('routes public docs to the public bucket', async () => {
    const { storage, db } = makeFakes();
    const out = await uploadDoc(html({ visibility: 'public' }), { storage, db }, emptyCtx());
    expect(out.status).toBe('new');
    expect(storage.calls[0].bucket).toBe('public');
  });

  it('skips a doc with no meta block', async () => {
    const { storage, db } = makeFakes();
    const out = await uploadDoc('<html><body>nope</body></html>', { storage, db }, emptyCtx());
    expect(out).toEqual({ status: 'skip', reason: 'no-meta-block' });
    expect(storage.calls).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
  });

  it('unchanged → same id+hash already present, skips storage and db', async () => {
    const { storage, db } = makeFakes();
    const hash = contentHash(html());
    const ctx: UploadCtx = { byId: new Map([[ID, hash]]), byHash: new Map([[hash, ID]]) };
    const out = await uploadDoc(html(), { storage, db }, ctx);
    expect(out.status).toBe('unchanged');
    expect(storage.calls).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
  });

  it('duplicate → same hash under a different id, skips', async () => {
    const { storage, db } = makeFakes();
    const hash = contentHash(html());
    const ctx: UploadCtx = { byId: new Map(), byHash: new Map([[hash, 'some/other-doc']]) };
    const out = await uploadDoc(html(), { storage, db }, ctx);
    expect(out.status).toBe('duplicate');
    expect(storage.calls).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
  });

  it('does NOT write the db row if storage upload fails (storage-first order)', async () => {
    const db = { rows: [] as DocumentRow[], async upsert(r: DocumentRow) { this.rows.push(r); }, async listExisting() { return []; } };
    const storage: StoragePort = { async upload() { throw new Error('network down'); } };
    await expect(uploadDoc(html(), { storage, db }, emptyCtx())).rejects.toThrow('network down');
    expect(db.rows).toHaveLength(0);
  });

  it('dry-run: classifies but writes nothing to storage or db', async () => {
    const { storage, db } = makeFakes();
    const out = await uploadDoc(html(), { storage, db }, { ...emptyCtx(), dryRun: true });
    expect(out.status).toBe('new');
    expect(storage.calls).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
  });

  it('auto-path: uses the assignPath result when no path is authored', async () => {
    const { storage, db } = makeFakes();
    const ctx: UploadCtx = {
      byId: new Map(), byHash: new Map(), autoPath: true,
      assignPath: async () => 'auto/assigned/here',
    };
    const out = await uploadDoc(html({ path: undefined }), { storage, db }, ctx);
    if (out.status === 'skip') throw new Error(`expected upload, got skip: ${out.reason}`);
    expect(out.id).toBe('auto/assigned/here');
  });
});
