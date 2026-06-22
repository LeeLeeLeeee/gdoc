import { parseMeta } from './parseMeta';
import { resolvePath, slugFromPath } from '../shared/schema';
import type { Bucket, DbPort, StoragePort } from './ports';

export interface UploadPorts {
  storage: StoragePort;
  db: DbPort;
}

export type UploadOutcome =
  | { status: 'ok'; id: string; bucket: Bucket; key: string }
  | { status: 'skip'; reason: 'no-meta-block' | 'invalid-json' };

/**
 * Upload one document. Order matters: storage write first, then db upsert —
 * so a storage failure never leaves an orphaned metadata row pointing at a
 * doc that does not exist. parseMeta throws on a valid-JSON-but-invalid-schema
 * block; the caller turns that into a per-doc failure.
 */
export async function uploadDoc(html: string, ports: UploadPorts): Promise<UploadOutcome> {
  const parsed = parseMeta(html);
  if (parsed.status === 'skip') return parsed;

  const meta = parsed.meta;
  const path = resolvePath(meta);
  const id = slugFromPath(path);
  const bucket: Bucket = meta.visibility; // 'public' | 'private'
  const key = `${id}.html`;

  await ports.storage.upload(bucket, key, html, 'text/html; charset=utf-8');

  await ports.db.upsert({
    id,
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
  });

  return { status: 'ok', id, bucket, key };
}
