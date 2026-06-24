import { parseMeta } from './parseMeta';
import { slugFromPath, type GdocMeta } from '../shared/schema';
import { contentHash, classifyUpload, defaultPath, storageKey, type UploadStatus } from './classify';
import type { Bucket, DbPort, StoragePort } from './ports';

export interface UploadPorts {
  storage: StoragePort;
  db: DbPort;
}

export interface UploadCtx {
  byId: Map<string, string | null>; // docId -> content_hash
  byHash: Map<string, string>; // content_hash -> docId
  autoPath?: boolean;
  folders?: string[]; // existing folder paths (context for the LLM)
  assignPath?: (meta: GdocMeta, folders: string[]) => Promise<string | null>;
  dryRun?: boolean; // classify + report, but never write to storage/db
}

export type UploadOutcome =
  | { status: UploadStatus; id: string; bucket: Bucket; key: string }
  | { status: 'skip'; reason: 'no-meta-block' | 'invalid-json'; detail?: string };

/**
 * Upload one document. Resolves the folder path (authored → LLM auto-path → default),
 * then classifies against existing docs (new/updated/unchanged/duplicate). `unchanged`
 * and `duplicate` are skipped; otherwise storage write then db upsert (storage-first).
 */
export async function uploadDoc(html: string, ports: UploadPorts, ctx: UploadCtx): Promise<UploadOutcome> {
  const parsed = parseMeta(html);
  if (parsed.status === 'skip') return parsed;

  const meta = parsed.meta;
  const hash = contentHash(html);

  let path = meta.path;
  if (!path && ctx.autoPath && ctx.assignPath) {
    path = (await ctx.assignPath(meta, ctx.folders ?? [])) ?? undefined;
  }
  if (!path) path = defaultPath(meta);

  const id = slugFromPath(path);
  const bucket: Bucket = meta.visibility;
  const key = storageKey(id);

  const status = classifyUpload(id, hash, ctx.byId, ctx.byHash);
  if (status === 'unchanged' || status === 'duplicate') {
    return { status, id, bucket, key };
  }

  // dry-run: report what would be written, then stop before any storage/db mutation.
  if (ctx.dryRun) return { status, id, bucket, key };

  await ports.storage.upload(bucket, key, html, 'text/html; charset=utf-8');
  await ports.db.upsert({
    id,
    uid: meta.uid,
    type: meta.type,
    title: meta.title,
    tags: meta.tags,
    category: meta.category,
    createdAt: meta.createdAt,
    visibility: meta.visibility,
    path,
    project: meta.project,
    bucket,
    storageKey: key,
    contentHash: hash,
  });

  return { status, id, bucket, key };
}
