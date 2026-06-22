import { createHash } from 'node:crypto';
import type { GdocMeta } from '../shared/schema';

/** sha256 of the raw HTML — used to detect duplicate / unchanged uploads. */
export function contentHash(html: string): string {
  return createHash('sha256').update(html).digest('hex');
}

export type UploadStatus = 'new' | 'updated' | 'unchanged' | 'duplicate';

/**
 * Classify an upload against what's already in the DB.
 * - id exists, same hash      → unchanged (skip)
 * - id exists, different hash → updated   (overwrite)
 * - new id, hash seen elsewhere → duplicate (skip; same content under another id)
 * - new id, new hash          → new
 */
export function classifyUpload(
  id: string,
  hash: string,
  byId: Map<string, string | null>,
  byHash: Map<string, string>,
): UploadStatus {
  if (byId.has(id)) return byId.get(id) === hash ? 'unchanged' : 'updated';
  const dupId = byHash.get(hash);
  if (dupId && dupId !== id) return 'duplicate';
  return 'new';
}

/** Fallback folder path when none is authored and auto-path is off / unavailable. */
export function defaultPath(meta: GdocMeta): string {
  return `${meta.project ?? meta.category}/${meta.title}`;
}

/**
 * ASCII-safe, stable Storage object key for a docId. The docId/path may contain
 * non-ASCII (e.g. Korean), which Supabase Storage rejects in keys — so we ASCII-slug
 * it and append a short hash of the id for uniqueness + stability across re-uploads.
 */
export function storageKey(id: string): string {
  const ascii = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const h = createHash('sha256').update(id).digest('hex').slice(0, 10);
  return `${(ascii || 'doc').slice(0, 80)}-${h}.html`;
}
