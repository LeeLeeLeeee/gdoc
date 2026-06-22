import { describe, it, expect } from 'vitest';
import { planEmbeddings, emptyCache, type EmbedCache } from './embedCache';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const cache: EmbedCache = {
  model: MODEL,
  dim: 2,
  docs: {
    a: { hash: 'h1', vector: [1, 0] },
    b: { hash: 'h2', vector: [0, 1] },
  },
};

describe('planEmbeddings', () => {
  it('reuses unchanged docs, re-embeds changed, flags new ones', () => {
    const plan = planEmbeddings(
      [
        { id: 'a', contentHash: 'h1' }, // unchanged → reuse
        { id: 'b', contentHash: 'hX' }, // changed → re-embed
        { id: 'c', contentHash: 'h3' }, // new → embed
      ],
      cache,
      MODEL,
    );
    expect(plan.reuse).toEqual({ a: [1, 0] });
    expect(plan.toEmbed.sort()).toEqual(['b', 'c']);
    expect(plan.changed).toBe(true);
  });

  it('detects removed docs', () => {
    const plan = planEmbeddings([{ id: 'a', contentHash: 'h1' }], cache, MODEL);
    expect(plan.removed).toEqual(['b']);
    expect(plan.changed).toBe(true);
  });

  it('changed=false when everything matches and nothing removed', () => {
    const plan = planEmbeddings(
      [{ id: 'a', contentHash: 'h1' }, { id: 'b', contentHash: 'h2' }],
      cache,
      MODEL,
    );
    expect(plan.toEmbed).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.changed).toBe(false);
  });

  it('discards the whole cache when the model differs', () => {
    const plan = planEmbeddings([{ id: 'a', contentHash: 'h1' }], cache, 'other-model');
    expect(plan.toEmbed).toEqual(['a']);
    expect(plan.reuse).toEqual({});
    expect(plan.removed).toEqual([]); // old-model entries aren't "removed", just ignored
  });

  it('emptyCache has no docs', () => {
    expect(planEmbeddings([{ id: 'a', contentHash: 'h1' }], emptyCache(MODEL, 2), MODEL).toEmbed).toEqual(['a']);
  });
});
