import { describe, it, expect } from 'vitest';
import { contentHash, classifyUpload, defaultPath, storageKey } from './classify';
import type { GdocMeta } from '../shared/schema';

describe('contentHash', () => {
  it('is deterministic, 64-hex, and differs for different input', () => {
    expect(contentHash('<h1>a</h1>')).toBe(contentHash('<h1>a</h1>'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
    expect(contentHash('a')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('classifyUpload', () => {
  const byId = new Map<string, string | null>([['doc-a', 'h1']]);
  const byHash = new Map<string, string>([['h1', 'doc-a']]);

  it('new when id not seen and hash not seen', () => {
    expect(classifyUpload('doc-b', 'h2', byId, byHash)).toBe('new');
  });
  it('unchanged when id exists with same hash', () => {
    expect(classifyUpload('doc-a', 'h1', byId, byHash)).toBe('unchanged');
  });
  it('updated when id exists with different hash', () => {
    expect(classifyUpload('doc-a', 'hX', byId, byHash)).toBe('updated');
  });
  it('duplicate when same hash belongs to a different id', () => {
    expect(classifyUpload('doc-b', 'h1', byId, byHash)).toBe('duplicate');
  });
});

describe('defaultPath', () => {
  const base = (o: Partial<GdocMeta>): GdocMeta =>
    ({ type: 'tech-note', title: 'My Note', tags: [], category: 'frontend', createdAt: '', visibility: 'private', assets: [], ...o } as GdocMeta);

  it('uses project when present, else category, then title', () => {
    expect(defaultPath(base({ project: 'proj' }))).toBe('proj/My Note');
    expect(defaultPath(base({}))).toBe('frontend/My Note');
  });
});

describe('storageKey', () => {
  it('is ASCII-only, ends with .html, and deterministic', () => {
    const k = storageKey('test/스모크-b');
    expect(k).toMatch(/^[a-z0-9-]+\.html$/); // no Korean / slashes
    expect(storageKey('test/스모크-b')).toBe(k);
  });
  it('differs per id and keeps an ASCII-readable prefix', () => {
    expect(storageKey('smoke/a')).toMatch(/^smoke-a-[0-9a-f]{10}\.html$/);
    expect(storageKey('smoke/a')).not.toBe(storageKey('smoke/b'));
  });
});
