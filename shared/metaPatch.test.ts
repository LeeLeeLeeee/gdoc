import { describe, expect, it } from 'vitest';
import { GdocMetaPatchError, patchGdocMetaHtml } from './metaPatch';

const html = (meta: Record<string, unknown>) =>
  `<html><head><title>x</title><script type="application/json" id="gdoc-meta">${JSON.stringify(meta)}</script></head><body>body</body></html>`;

const meta = {
  type: 'tech-note',
  title: 'Old Title',
  tags: ['old'],
  category: 'backend',
  createdAt: '2026-06-25T00:00:00Z',
  visibility: 'private',
  path: 'playground/old/file',
  uid: '9114e558-42c1-4765-97ae-78c9388ed93e',
};

describe('patchGdocMetaHtml', () => {
  it('patches editable fields and preserves non-edited fields', () => {
    const out = patchGdocMetaHtml(html(meta), {
      title: 'New Title',
      path: 'playground/new/file',
      tags: ['effect', 'docs'],
      visibility: 'public',
    });

    expect(out.meta).toMatchObject({
      title: 'New Title',
      path: 'playground/new/file',
      tags: ['effect', 'docs'],
      visibility: 'public',
      uid: meta.uid,
      createdAt: meta.createdAt,
    });
    expect(out.html).toContain('<title>x</title>');
    expect(out.html).toContain('<body>body</body>');
    expect(out.html).toContain('"title": "New Title"');
  });

  it('throws a typed error when meta block is missing', () => {
    expect(() => patchGdocMetaHtml('<html></html>', { title: 'x' })).toThrow(GdocMetaPatchError);
  });

  it('throws a typed error for invalid json', () => {
    expect(() => patchGdocMetaHtml('<script id="gdoc-meta">{bad</script>', { title: 'x' })).toThrow(
      GdocMetaPatchError,
    );
  });

  it('validates the patched metadata', () => {
    expect(() => patchGdocMetaHtml(html(meta), { title: '' })).toThrow(GdocMetaPatchError);
  });
});
