import { describe, it, expect } from 'vitest';
import { backupKey, editDoc, getDocHtml, revertDoc } from './edit';
import { contentHash, storageKey } from './classify';
import { slugFromPath } from '../shared/schema';
import type { StoragePort, DbPort, DocumentRow } from './ports';

const PATH = 'Playground/Tech Notes/React Query';
const ID = slugFromPath(PATH); // playground/tech-notes/react-query
const KEY = storageKey(ID);

const docHtml = (body = 'BODY', extra: Record<string, unknown> = {}) =>
  `<html><head><script type="application/json" id="gdoc-meta">${JSON.stringify({
    type: 'tech-note',
    title: 'React Query',
    category: 'frontend',
    createdAt: '2026-06-22T12:00:00Z',
    visibility: 'private',
    path: PATH,
    ...extra,
  })}</script></head><body>${body}</body></html>`;

function makeFakes(seedHtml = docHtml()) {
  const store = new Map<string, string>(); // `${bucket}/${key}` -> html
  const removed: string[] = [];
  const storage = {
    uploads: [] as { bucket: string; key: string; body: string }[],
    async upload(bucket: 'public' | 'private', key: string, body: string | Uint8Array) {
      this.uploads.push({ bucket, key, body: String(body) });
      store.set(`${bucket}/${key}`, String(body));
      return {};
    },
    async download(bucket: 'public' | 'private', key: string) {
      const v = store.get(`${bucket}/${key}`);
      if (v == null) throw new Error(`storage miss: ${bucket}/${key}`);
      return v;
    },
    async remove(bucket: 'public' | 'private', key: string) {
      removed.push(`${bucket}/${key}`);
      store.delete(`${bucket}/${key}`);
    },
  } satisfies StoragePort & { uploads: unknown[] };

  const seedRow: DocumentRow = {
    id: ID,
    type: 'tech-note',
    title: 'React Query',
    tags: [],
    category: 'frontend',
    createdAt: '2026-06-22T12:00:00Z',
    visibility: 'private',
    path: PATH,
    bucket: 'private',
    storageKey: KEY,
    contentHash: contentHash(seedHtml),
  };

  const db = {
    rows: [seedRow] as DocumentRow[],
    deletedHighlightsFor: [] as string[],
    async upsert(row: DocumentRow) {
      const i = this.rows.findIndex((r) => r.id === row.id);
      if (i === -1) this.rows.push(row);
      else this.rows[i] = row;
    },
    async listExisting() {
      return this.rows.map((r) => ({ id: r.id, contentHash: r.contentHash, path: r.path }));
    },
    async getByIdOrPath(ref: string) {
      return this.rows.find((r) => r.id === ref || r.path === ref) ?? null;
    },
    async exists(id: string) {
      return this.rows.some((r) => r.id === id);
    },
    async updateIdentity(oldId: string, row: DocumentRow) {
      const i = this.rows.findIndex((r) => r.id === oldId);
      if (i === -1) this.rows.push(row);
      else this.rows[i] = row;
    },
    async deleteHighlights(docId: string) {
      this.deletedHighlightsFor.push(docId);
    },
  } satisfies DbPort & { rows: DocumentRow[]; deletedHighlightsFor: string[] };

  store.set(`private/${KEY}`, seedHtml);
  return { storage, db, removed, store };
}

describe('getDocHtml', () => {
  it('returns the stored HTML and row for an existing ref (by id or path)', async () => {
    const { storage, db } = makeFakes();
    const byId = await getDocHtml(ID, { storage, db });
    expect(byId.html).toContain('BODY');
    expect(byId.row.id).toBe(ID);
    const byPath = await getDocHtml(PATH, { storage, db });
    expect(byPath.row.id).toBe(ID);
  });

  it('throws for an unknown ref', async () => {
    const { storage, db } = makeFakes();
    await expect(getDocHtml('nope/missing', { storage, db })).rejects.toThrow('document not found');
  });
});

describe('editDoc', () => {
  it('updated → same identity, new body: writes storage (same key) and updates row hash', async () => {
    const { storage, db } = makeFakes();
    const next = docHtml('EDITED BODY');
    const out = await editDoc(ID, next, { storage, db });
    expect(out).toMatchObject({ status: 'updated', id: ID, bucket: 'private', key: KEY });
    // snapshot (backup) + content write
    expect(storage.uploads).toHaveLength(2);
    expect(storage.uploads.find((u) => u.key === KEY)).toMatchObject({ bucket: 'private', key: KEY });
    expect(db.rows[0].contentHash).toBe(contentHash(next));
  });

  it('unchanged → identical bytes: no storage or db write', async () => {
    const { storage, db } = makeFakes();
    const out = await editDoc(ID, docHtml(), { storage, db });
    expect(out.status).toBe('unchanged');
    expect(storage.uploads).toHaveLength(0);
  });

  it('throws for an unknown ref, writing nothing', async () => {
    const { storage, db } = makeFakes();
    await expect(editDoc('nope/missing', docHtml('X'), { storage, db })).rejects.toThrow('document not found');
    expect(storage.uploads).toHaveLength(0);
  });

  it('rejects on --if-match mismatch without writing', async () => {
    const { storage, db } = makeFakes();
    await expect(editDoc(ID, docHtml('X'), { storage, db }, { ifMatch: 'stale-hash' })).rejects.toThrow('content changed');
    expect(storage.uploads).toHaveLength(0);
  });

  it('passes when --if-match equals the current hash', async () => {
    const { storage, db } = makeFakes();
    const current = db.rows[0].contentHash;
    const out = await editDoc(ID, docHtml('X'), { storage, db }, { ifMatch: current });
    expect(out.status).toBe('updated');
  });

  it('rejects HTML with no gdoc-meta block, writing nothing', async () => {
    const { storage, db } = makeFakes();
    await expect(editDoc(ID, '<html><body>no meta</body></html>', { storage, db })).rejects.toThrow('invalid HTML');
    expect(storage.uploads).toHaveLength(0);
  });

  it('moved (with --confirm) → updates identity and removes the old storage object', async () => {
    const { storage, db, removed } = makeFakes();
    const next = docHtml('BODY', { path: 'Playground/Tech Notes/Renamed' });
    const newId = slugFromPath('Playground/Tech Notes/Renamed');
    const out = await editDoc(ID, next, { storage, db }, { confirm: true });
    expect(out).toMatchObject({ status: 'moved', id: newId });
    expect(db.rows[0].id).toBe(newId);
    expect(removed).toContain(`private/${KEY}`);
  });

  it('refuses a move without --confirm, writing nothing', async () => {
    const { storage, db } = makeFakes();
    const next = docHtml('BODY', { path: 'Playground/Tech Notes/Renamed' });
    await expect(editDoc(ID, next, { storage, db })).rejects.toThrow('requires --confirm');
    expect(storage.uploads).toHaveLength(0);
    expect(db.rows[0].id).toBe(ID);
  });

  it('refuses a visibility change without --confirm', async () => {
    const { storage, db } = makeFakes();
    const next = docHtml('BODY', { visibility: 'public' });
    await expect(editDoc(ID, next, { storage, db })).rejects.toThrow('requires --confirm');
    expect(storage.uploads).toHaveLength(0);
  });

  it('applies a visibility change with --confirm (same id → updated)', async () => {
    const { storage, db } = makeFakes();
    const next = docHtml('BODY', { visibility: 'public' });
    const out = await editDoc(ID, next, { storage, db }, { confirm: true });
    expect(out).toMatchObject({ status: 'updated', id: ID, bucket: 'public' });
    expect(db.rows[0].visibility).toBe('public');
  });

  it('dry-run previews a move without --confirm (writes nothing)', async () => {
    const { storage, db } = makeFakes();
    const next = docHtml('BODY', { path: 'Playground/Tech Notes/Renamed' });
    const out = await editDoc(ID, next, { storage, db }, { dryRun: true });
    expect(out.status).toBe('moved');
    expect(storage.uploads).toHaveLength(0);
  });

  it('snapshots the previous body before overwriting', async () => {
    const { storage, db, store } = makeFakes(docHtml('V1'));
    await editDoc(ID, docHtml('V2'), { storage, db });
    expect(store.get(`private/${backupKey(KEY)}`)).toContain('V1');
    expect(store.get(`private/${KEY}`)).toContain('V2');
  });

  it('clears highlights for the doc after an in-place content replace', async () => {
    const { storage, db } = makeFakes();
    await editDoc(ID, docHtml('EDITED'), { storage, db });
    expect(db.deletedHighlightsFor).toEqual([ID]);
  });

  it('clears highlights keyed by the OLD id on a confirmed move', async () => {
    const { storage, db } = makeFakes();
    const next = docHtml('BODY', { path: 'Playground/Tech Notes/Renamed' });
    await editDoc(ID, next, { storage, db }, { confirm: true });
    expect(db.deletedHighlightsFor).toEqual([ID]); // old id
  });

  it('does NOT clear highlights on a no-op (unchanged) edit', async () => {
    const { storage, db } = makeFakes();
    await editDoc(ID, docHtml(), { storage, db });
    expect(db.deletedHighlightsFor).toEqual([]);
  });
});

describe('revertDoc', () => {
  it('restores the previous body after an edit', async () => {
    const { storage, db } = makeFakes(docHtml('V1'));
    await editDoc(ID, docHtml('V2'), { storage, db });
    const out = await revertDoc(ID, { storage, db });
    expect(out.status).toBe('updated');
    const { html } = await getDocHtml(ID, { storage, db });
    expect(html).toContain('V1');
    expect(html).not.toContain('V2');
  });

  it('throws when there is no snapshot yet', async () => {
    const { storage, db } = makeFakes();
    await expect(revertDoc(ID, { storage, db })).rejects.toThrow('no snapshot to revert');
  });

  it('dry-run: classifies but writes nothing', async () => {
    const { storage, db } = makeFakes();
    const out = await editDoc(ID, docHtml('EDITED'), { storage, db }, { dryRun: true });
    expect(out.status).toBe('updated');
    expect(storage.uploads).toHaveLength(0);
  });
});
