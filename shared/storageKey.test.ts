import { describe, expect, it } from 'vitest';
import { storageKeyAsciiBase, storageKeyFromIdHash } from './storageKey';

describe('storageKeyAsciiBase', () => {
  it('uses ascii slug text when available', () => {
    expect(storageKeyAsciiBase('playground/tech-notes/react-query')).toBe('playground-tech-notes-react-query');
  });

  it('falls back to doc when the id has no ascii letters or numbers', () => {
    expect(storageKeyAsciiBase('한글/문서')).toBe('doc');
  });
});

describe('storageKeyFromIdHash', () => {
  it('combines ascii base and first 10 hash chars', () => {
    expect(storageKeyFromIdHash('playground/tech-notes/react-query', 'abcdef0123456789')).toBe(
      'playground-tech-notes-react-query-abcdef0123.html',
    );
  });

  it('limits the ascii prefix to 80 characters', () => {
    const id = 'a'.repeat(120);
    const key = storageKeyFromIdHash(id, '1234567890abcdef');
    expect(key).toBe(`${'a'.repeat(80)}-1234567890.html`);
  });
});
