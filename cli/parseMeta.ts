import { gdocMetaSchema, type GdocMeta } from '../shared/schema';

export type ParseResult =
  | { status: 'ok'; meta: GdocMeta }
  | { status: 'skip'; reason: 'no-meta-block' | 'invalid-json' };

const META_BLOCK = /<script[^>]*\bid=["']gdoc-meta["'][^>]*>([\s\S]*?)<\/script>/i;

/**
 * Extract and validate the embedded `<script id="gdoc-meta">` JSON block.
 * - no block / malformed JSON  → skip (caller warns, keeps going)
 * - valid JSON, invalid schema → throws (required field missing is a hard error)
 */
export function parseMeta(html: string): ParseResult {
  const match = META_BLOCK.exec(html);
  if (!match) return { status: 'skip', reason: 'no-meta-block' };

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return { status: 'skip', reason: 'invalid-json' };
  }

  return { status: 'ok', meta: gdocMetaSchema.parse(raw) };
}
