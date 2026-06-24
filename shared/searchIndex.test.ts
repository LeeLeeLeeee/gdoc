import { describe, it, expect } from 'vitest';
import { mergeSearchIndex } from './searchIndex';

describe('mergeSearchIndex', () => {
  it('adds new entries', () => {
    expect(mergeSearchIndex({}, { a: 'x' }, [])).toEqual({ a: 'x' });
  });

  it('overrides changed entries with the fresh text', () => {
    expect(mergeSearchIndex({ a: 'old' }, { a: 'new' }, [])).toEqual({ a: 'new' });
  });

  it('keeps entries that were not refreshed', () => {
    expect(mergeSearchIndex({ a: 'x', b: 'y' }, { b: 'y2' }, [])).toEqual({ a: 'x', b: 'y2' });
  });

  it('drops removed ids', () => {
    expect(mergeSearchIndex({ a: 'x', b: 'y' }, {}, ['a'])).toEqual({ b: 'y' });
  });

  it('does not mutate the existing index', () => {
    const existing = { a: 'x' };
    mergeSearchIndex(existing, { b: 'y' }, []);
    expect(existing).toEqual({ a: 'x' });
  });
});
