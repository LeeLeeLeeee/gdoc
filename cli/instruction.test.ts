import { describe, it, expect } from 'vitest';
import {
  highlightsToInstructions,
  buildInstructionPrompt,
  extractHtml,
  runInstructionEdit,
  type HighlightRecord,
} from './instruction';
import { contentHash, storageKey } from './classify';
import { slugFromPath } from '../shared/schema';
import type { StoragePort, DbPort, DocumentRow } from './ports';

const PATH = 'Playground/Tech Notes/React Query';
const ID = slugFromPath(PATH);
const KEY = storageKey(ID);

const docHtml = (body = 'BODY') =>
  `<!doctype html><html><head><script type="application/json" id="gdoc-meta">${JSON.stringify({
    type: 'tech-note', title: 'React Query', category: 'frontend',
    createdAt: '2026-06-22T12:00:00Z', visibility: 'private', path: PATH,
  })}</script></head><body>${body}</body></html>`;

describe('highlightsToInstructions', () => {
  const hs: HighlightRecord[] = [
    { id: 'a', exact: '이 단락', note: '불필요', keywords: ['삭제'] },
    { id: 'b', exact: '왜 이렇게', note: null, keywords: ['궁금'] }, // info → excluded
    { id: 'c', exact: '표현 어색', note: '딱딱함', keywords: ['편집', '중요'] },
  ];
  it('keeps only action-tagged highlights and collects their ids', () => {
    const { lines, usedIds } = highlightsToInstructions(hs);
    expect(usedIds).toEqual(['a', 'c']);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('이 단락');
    expect(lines[0]).toContain('삭제');
    expect(lines[1]).toContain('표현 어색');
    expect(lines[1]).toContain('딱딱함'); // note included
  });
});

describe('buildInstructionPrompt', () => {
  it('includes the html, the instruction lines, and an HTML-only directive', () => {
    const p = buildInstructionPrompt('<html>doc</html>', ['- 오타 고쳐']);
    expect(p).toContain('<html>doc</html>');
    expect(p).toContain('오타 고쳐');
    expect(p.toLowerCase()).toContain('html');
  });
});

describe('extractHtml', () => {
  it('strips a ```html code fence', () => {
    const out = extractHtml('네 수정했습니다:\n```html\n<!doctype html><html><body>x</body></html>\n```');
    expect(out).toBe('<!doctype html><html><body>x</body></html>');
  });
  it('extracts a raw html document', () => {
    expect(extractHtml('<!doctype html><html><body>y</body></html>')).toContain('<body>y</body>');
  });
  it('returns null for prose with no html', () => {
    expect(extractHtml('죄송하지만 편집할 수 없습니다.')).toBeNull();
  });
});

function makeFakes(highlights: HighlightRecord[] = []) {
  const store = new Map<string, string>();
  const seedRow: DocumentRow = {
    id: ID, type: 'tech-note', title: 'React Query', tags: [], category: 'frontend',
    createdAt: '2026-06-22T12:00:00Z', visibility: 'private', path: PATH,
    bucket: 'private', storageKey: KEY, contentHash: contentHash(docHtml()),
  };
  const storage = {
    async upload(b: 'public' | 'private', k: string, body: string | Uint8Array) { store.set(`${b}/${k}`, String(body)); return {}; },
    async download(b: 'public' | 'private', k: string) { const v = store.get(`${b}/${k}`); if (v == null) throw new Error('miss'); return v; },
    async remove() {},
  } satisfies StoragePort;
  const db = {
    rows: [seedRow] as DocumentRow[],
    deletedAll: [] as string[],
    consumedByIds: [] as { docId: string; ids: string[] }[],
    async upsert() {},
    async listExisting() { return this.rows.map((r) => ({ id: r.id, contentHash: r.contentHash, path: r.path })); },
    async getByIdOrPath(ref: string) { return this.rows.find((r) => r.id === ref || r.path === ref) ?? null; },
    async exists(id: string) { return this.rows.some((r) => r.id === id); },
    async updateIdentity(oldId: string, row: DocumentRow) { const i = this.rows.findIndex((r) => r.id === oldId); if (i >= 0) this.rows[i] = row; },
    async deleteHighlights(docId: string) { this.deletedAll.push(docId); },
    async deleteHighlightsByIds(docId: string, ids: string[]) { this.consumedByIds.push({ docId, ids }); },
    async listHighlights() { return highlights; },
  } satisfies DbPort & { rows: DocumentRow[]; deletedAll: string[]; consumedByIds: { docId: string; ids: string[] }[] };
  store.set(`private/${KEY}`, docHtml());
  return { storage, db };
}

describe('runInstructionEdit', () => {
  it('from-highlights: applies LLM html, consumes only used action highlights, does NOT wipe all', async () => {
    const { storage, db } = makeFakes([
      { id: 'a', exact: 'BODY', note: null, keywords: ['편집'] },
      { id: 'b', exact: 'x', note: null, keywords: ['궁금'] },
    ]);
    const runner = async () => '```html\n' + docHtml('EDITED') + '\n```';
    const out = await runInstructionEdit(ID, { fromHighlights: true }, { storage, db }, runner);
    expect(out.status).toBe('updated');
    expect(out.usedIds).toEqual(['a']);
    expect(db.consumedByIds).toEqual([{ docId: ID, ids: ['a'] }]);
    expect(db.deletedAll).toEqual([]); // targeted edit: no full wipe
  });

  it('dry-run: returns preview html without writing or consuming', async () => {
    const { storage, db } = makeFakes([{ id: 'a', exact: 'BODY', note: null, keywords: ['편집'] }]);
    const runner = async () => docHtml('PREVIEWED');
    const out = await runInstructionEdit(ID, { fromHighlights: true, dryRun: true }, { storage, db }, runner);
    expect(out.status).toBe('preview');
    if (out.status === 'preview') expect(out.newHtml).toContain('PREVIEWED');
    expect(db.consumedByIds).toEqual([]);
  });

  it('rejects LLM output that is not a valid HTML document', async () => {
    const { storage, db } = makeFakes([{ id: 'a', exact: 'BODY', note: null, keywords: ['편집'] }]);
    const runner = async () => '죄송하지만 못합니다.';
    await expect(runInstructionEdit(ID, { fromHighlights: true }, { storage, db }, runner)).rejects.toThrow();
  });

  it('free-form instruction applies without consuming highlights', async () => {
    const { storage, db } = makeFakes();
    const runner = async () => docHtml('FIXED');
    const out = await runInstructionEdit(ID, { instruction: '오타 고쳐' }, { storage, db }, runner);
    expect(out.status).toBe('updated');
    expect(out.usedIds).toEqual([]);
    expect(db.consumedByIds).toEqual([]);
  });

  it('from-highlights with no action highlights throws', async () => {
    const { storage, db } = makeFakes([{ id: 'b', exact: 'x', note: null, keywords: ['궁금'] }]);
    const runner = async () => docHtml('X');
    await expect(runInstructionEdit(ID, { fromHighlights: true }, { storage, db }, runner)).rejects.toThrow();
  });
});
