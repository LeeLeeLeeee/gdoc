import { describe, expect, it } from 'vitest';
import { buildDocHtmlRequest } from './docHtmlRequest';
import type { DocSummary } from '../../shared/buildTree';

const doc = (visibility: 'public' | 'private'): DocSummary => ({
  id: 'playground/tech-notes/typescript-generator',
  title: 'TypeScript generator 문법',
  type: 'tech-note',
  path: 'playground/tech-notes/typescript-generator',
  visibility,
  bucket: visibility,
  storageKey: 'playground-tech-notes-typescript-generator.html',
  tags: [],
  category: 'typescript',
  createdAt: '2026-06-26T00:00:00Z',
  updatedAt: '2026-06-26T05:00:00Z',
});

describe('buildDocHtmlRequest', () => {
  it('uses the public storage URL for public documents', () => {
    const request = buildDocHtmlRequest({
      doc: doc('public'),
      supabaseUrl: 'https://example.supabase.co',
      accessToken: null,
      cacheKey: 2,
      publicUrl: 'https://cdn.example/doc.html',
    });

    expect(request).toEqual({
      url: 'https://cdn.example/doc.html?v=2026-06-26T05%3A00%3A00Z&r=2',
      init: undefined,
    });
  });

  it('uses the owner-only admin function for private documents', () => {
    const request = buildDocHtmlRequest({
      doc: doc('private'),
      supabaseUrl: 'https://example.supabase.co/',
      accessToken: 'token-123',
      cacheKey: 3,
      publicUrl: 'https://cdn.example/should-not-be-used.html',
    });

    expect(request).toEqual({
      url: 'https://example.supabase.co/functions/v1/admin-docs/docs/playground%2Ftech-notes%2Ftypescript-generator/html?r=3',
      init: { headers: { authorization: 'Bearer token-123' } },
    });
  });

  it('rejects private documents when there is no signed-in owner token', () => {
    expect(() =>
      buildDocHtmlRequest({
        doc: doc('private'),
        supabaseUrl: 'https://example.supabase.co',
        accessToken: null,
        publicUrl: 'https://cdn.example/unused.html',
      }),
    ).toThrow('Private document requires an owner session');
  });
});
