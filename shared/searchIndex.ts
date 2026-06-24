/**
 * Content search index: doc id → plain extracted text. Built by `gdoc analyze`
 * (owner-only, private bucket: graph/search-index.json) and loaded once by the
 * viewer so content search needs no per-doc body fetch (E3).
 */
export type SearchIndex = Record<string, string>;

/**
 * Incremental merge: start from the existing index, overlay freshly-extracted text
 * for changed/new docs, and drop removed ids. Pure; does not mutate `existing`.
 */
export function mergeSearchIndex(
  existing: SearchIndex,
  fresh: SearchIndex,
  removedIds: string[],
): SearchIndex {
  const next: SearchIndex = { ...existing, ...fresh };
  for (const id of removedIds) delete next[id];
  return next;
}
