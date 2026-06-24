import { z } from 'zod';

/**
 * Single source of truth for gdoc document metadata.
 * The generation skill writes this as a `<script type="application/json" id="gdoc-meta">`
 * block; the CLI parses + validates it; the viewer reuses the inferred type.
 */
export const DOC_TYPES = [
  'tech-note',
  'overview',
  'change-log',
  'feature-spec',
  'deploy-test',
  'index',
] as const;

/** Storage bucket = visibility tier: public docs live in the public bucket, private in private. */
export type Bucket = 'public' | 'private';

export const gdocAssetSchema = z.object({
  src: z.string().min(1),
  url: z.string().url().optional(),
});

export const gdocMetaSchema = z.object({
  type: z.enum(DOC_TYPES),
  // Stable node identity for the future knowledge graph. Authored by the generation
  // skill once and preserved across re-uploads; if absent, the DB assigns one per path.
  uid: z.string().uuid().optional(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  category: z.string().min(1),
  createdAt: z.string().datetime(),
  visibility: z.enum(['public', 'private']).default('private'),
  path: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
  assets: z.array(gdocAssetSchema).default([]),
});

export type GdocMeta = z.infer<typeof gdocMetaSchema>;

/** Effective folder path for the tree. Falls back to `<project>/<type>` when `path` is absent. */
export function resolvePath(meta: GdocMeta): string {
  return meta.path ?? `${meta.project ?? 'uncategorized'}/${meta.type}`;
}

/** Stable doc id / storage key from a path. Lowercases + hyphenates each segment, preserving hierarchy. */
export function slugFromPath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, ''),
    )
    .filter(Boolean)
    .join('/');
}
