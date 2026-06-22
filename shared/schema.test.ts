import { describe, it, expect } from 'vitest';
import { gdocMetaSchema, resolvePath, slugFromPath } from './schema';

const validMeta = {
  type: 'tech-note',
  title: 'React Query 캐싱',
  tags: ['react', 'data-fetching'],
  category: 'frontend',
  createdAt: '2026-06-22T12:00:00Z',
  visibility: 'private',
  path: 'playground/tech-notes/react-query',
  project: 'playground',
  assets: [{ src: './diagram.png' }],
};

describe('gdocMetaSchema', () => {
  it('accepts a valid full meta object', () => {
    const parsed = gdocMetaSchema.parse(validMeta);
    expect(parsed.title).toBe('React Query 캐싱');
    expect(parsed.type).toBe('tech-note');
  });

  it('defaults visibility to private when omitted', () => {
    const { visibility, ...rest } = validMeta;
    expect(gdocMetaSchema.parse(rest).visibility).toBe('private');
  });

  it('defaults tags to an empty array when omitted', () => {
    const { tags, ...rest } = validMeta;
    expect(gdocMetaSchema.parse(rest).tags).toEqual([]);
  });

  it('rejects an unknown type', () => {
    expect(() => gdocMetaSchema.parse({ ...validMeta, type: 'memo' })).toThrow();
  });

  it('rejects a missing title', () => {
    const { title, ...rest } = validMeta;
    expect(() => gdocMetaSchema.parse(rest)).toThrow();
  });

  it('rejects an invalid visibility value', () => {
    expect(() => gdocMetaSchema.parse({ ...validMeta, visibility: 'secret' })).toThrow();
  });

  it('accepts an optional uid (uuid) and rejects a non-uuid', () => {
    const uid = '9114e558-42c1-4765-97ae-78c9388ed93e';
    expect(gdocMetaSchema.parse({ ...validMeta, uid }).uid).toBe(uid);
    expect(() => gdocMetaSchema.parse({ ...validMeta, uid: 'not-a-uuid' })).toThrow();
  });
});

describe('resolvePath', () => {
  it('uses the explicit path when present', () => {
    expect(resolvePath(gdocMetaSchema.parse(validMeta))).toBe('playground/tech-notes/react-query');
  });

  it('falls back to project/type when path is absent', () => {
    const { path, ...rest } = validMeta;
    expect(resolvePath(gdocMetaSchema.parse(rest))).toBe('playground/tech-note');
  });
});

describe('slugFromPath', () => {
  it('lowercases and hyphenates each segment while preserving hierarchy', () => {
    expect(slugFromPath('Playground/Tech Notes/React Query')).toBe(
      'playground/tech-notes/react-query',
    );
  });
});
