import { gdocMetaSchema, type GdocMeta } from './schema';

const META_BLOCK = /<script[^>]*\bid=["']gdoc-meta["'][^>]*>([\s\S]*?)<\/script>/i;

export type EditableGdocMeta = Pick<GdocMeta, 'title' | 'tags' | 'category' | 'type' | 'visibility' | 'path'>;

export type GdocMetaPatch = Partial<EditableGdocMeta>;

export class GdocMetaPatchError extends Error {
  constructor(
    public readonly code: 'missing_meta_block' | 'invalid_meta_json' | 'invalid_patched_meta',
    message: string,
  ) {
    super(message);
    this.name = 'GdocMetaPatchError';
  }
}

export function patchGdocMetaHtml(html: string, patch: GdocMetaPatch): { html: string; meta: GdocMeta } {
  const match = html.match(META_BLOCK);
  if (!match) {
    throw new GdocMetaPatchError('missing_meta_block', 'Missing <script id="gdoc-meta"> block');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    throw new GdocMetaPatchError('invalid_meta_json', 'gdoc-meta block is not valid JSON');
  }

  const patched = { ...(raw as Record<string, unknown>), ...patch };
  const parsed = gdocMetaSchema.safeParse(patched);
  if (!parsed.success) {
    throw new GdocMetaPatchError('invalid_patched_meta', parsed.error.message);
  }

  const replacement = match[0].replace(match[1], JSON.stringify(parsed.data, null, 2));
  return { html: html.replace(match[0], replacement), meta: parsed.data };
}
