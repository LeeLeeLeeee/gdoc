import { describe, it, expect } from 'vitest';
import { uploadDoc } from './upload';
import type { StoragePort, DbPort } from './ports';

const html = (extra: Record<string, unknown> = {}) =>
  `<html><head><script type="application/json" id="gdoc-meta">${JSON.stringify({
    type: 'tech-note',
    title: 'React Query',
    category: 'frontend',
    createdAt: '2026-06-22T12:00:00Z',
    path: 'Playground/Tech Notes/React Query',
    ...extra,
  })}</script></head><body>doc</body></html>`;

function makeFakes() {
  const storage = {
    calls: [] as { bucket: string; key: string }[],
    async upload(bucket: 'public' | 'private', key: string) {
      this.calls.push({ bucket, key });
      return { publicUrl: bucket === 'public' ? `https://cdn/${key}` : undefined };
    },
  } satisfies StoragePort & { calls: { bucket: string; key: string }[] };

  const db = {
    rows: [] as Record<string, unknown>[],
    async upsert(row: Record<string, unknown>) {
      this.rows.push(row);
    },
  } satisfies DbPort & { rows: Record<string, unknown>[] };

  return { storage, db };
}

describe('uploadDoc', () => {
  it('uploads body then upserts a row keyed by slug(resolvePath)', async () => {
    const { storage, db } = makeFakes();
    const out = await uploadDoc(html(), { storage, db });

    expect(out).toEqual({
      status: 'ok',
      id: 'playground/tech-notes/react-query',
      bucket: 'private',
      key: 'playground/tech-notes/react-query.html',
    });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      id: 'playground/tech-notes/react-query',
      visibility: 'private',
      bucket: 'private',
      path: 'Playground/Tech Notes/React Query',
    });
  });

  it('routes public docs to the public bucket', async () => {
    const { storage, db } = makeFakes();
    const out = await uploadDoc(html({ visibility: 'public' }), { storage, db });
    expect(out.status).toBe('ok');
    expect(storage.calls[0].bucket).toBe('public');
  });

  it('skips a doc with no meta block without touching storage or db', async () => {
    const { storage, db } = makeFakes();
    const out = await uploadDoc('<html><body>nope</body></html>', { storage, db });
    expect(out).toEqual({ status: 'skip', reason: 'no-meta-block' });
    expect(storage.calls).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
  });

  it('does NOT write the db row if storage upload fails (storage-first order)', async () => {
    const db = { rows: [] as Record<string, unknown>[], async upsert(r: Record<string, unknown>) { this.rows.push(r); } };
    const storage: StoragePort = {
      async upload() {
        throw new Error('network down');
      },
    };
    await expect(uploadDoc(html(), { storage, db })).rejects.toThrow('network down');
    expect(db.rows).toHaveLength(0);
  });
});
