import { parseMeta } from './parseMeta';
import { contentHash } from './classify';
import { planDocMetaMutation } from '../shared/docMutation';
import type { UploadPorts } from './upload';
import type { Bucket, DocumentRow } from './ports';

/** Read a document's current HTML body plus its row. Throws if the ref is unknown. */
export async function getDocHtml(ref: string, ports: UploadPorts): Promise<{ html: string; row: DocumentRow }> {
  const row = await ports.db.getByIdOrPath(ref);
  if (!row) throw new Error(`document not found: ${ref}`);
  const html = await ports.storage.download(row.bucket, row.storageKey);
  return { html, row };
}

/** Backup object key for a doc's previous body. Stable per id; backups live in the private bucket. */
export function backupKey(storageKey: string): string {
  return storageKey.replace(/\.html$/i, '') + '.prev.html';
}

export interface EditOptions {
  dryRun?: boolean;
  /** Optimistic concurrency: reject if the current content hash differs from this. */
  ifMatch?: string;
  /** Required to apply a risky transition (doc move or visibility change). */
  confirm?: boolean;
}

export type EditResult = { status: 'updated' | 'moved' | 'unchanged'; id: string; bucket: Bucket; key: string };

/**
 * Replace an existing document's body with `newHtml`. The embedded gdoc-meta in
 * `newHtml` stays the source of truth for identity (id/path/visibility). A move
 * (path change) or visibility change is allowed but needs `confirm` because it is
 * not cleanly recoverable. Before writing, the current body is snapshotted so the
 * edit can be reverted. Storage-first write, then db.
 */
export async function editDoc(
  ref: string,
  newHtml: string,
  ports: UploadPorts,
  opts: EditOptions = {},
): Promise<EditResult> {
  const row = await ports.db.getByIdOrPath(ref);
  if (!row) throw new Error(`document not found: ${ref}`);

  if (opts.ifMatch !== undefined && opts.ifMatch !== row.contentHash) {
    throw new Error(`content changed since --if-match ${opts.ifMatch} (current ${row.contentHash})`);
  }

  const parsed = parseMeta(newHtml);
  if (parsed.status === 'skip') {
    throw new Error(`invalid HTML: ${parsed.reason}${parsed.detail ? ` (${parsed.detail})` : ''}`);
  }
  const meta = parsed.meta;
  const hash = contentHash(newHtml);

  const plan = planDocMetaMutation(
    { id: row.id, path: row.path, bucket: row.bucket, storageKey: row.storageKey, visibility: row.visibility },
    meta,
  );

  // no-op guard: identical bytes and same identity → nothing to do.
  if (hash === row.contentHash && plan.newId === row.id) {
    return { status: 'unchanged', id: row.id, bucket: row.bucket, key: row.storageKey };
  }

  // risky transitions need explicit confirmation (not cleanly revertable).
  // dry-run never writes, so it is exempt — it previews the would-be transition.
  const isMove = plan.newId !== row.id;
  const isVisibilityChange = plan.newBucket !== row.bucket;
  if ((isMove || isVisibilityChange) && !opts.confirm && !opts.dryRun) {
    const changes: string[] = [];
    if (isMove) changes.push(`path ${row.path} → ${plan.newPath}`);
    if (isVisibilityChange) changes.push(`visibility ${row.visibility} → ${meta.visibility}`);
    throw new Error(`requires --confirm: ${changes.join(', ')}`);
  }

  if (isMove && (await ports.db.exists(plan.newId))) {
    throw new Error(`path conflict: ${plan.newPath}`);
  }

  const next: DocumentRow = {
    ...row,
    id: plan.newId,
    uid: meta.uid,
    type: meta.type,
    title: meta.title,
    tags: meta.tags,
    category: meta.category,
    createdAt: meta.createdAt,
    visibility: meta.visibility,
    path: plan.newPath,
    project: meta.project,
    bucket: plan.newBucket,
    storageKey: plan.newStorageKey,
    contentHash: hash,
  };

  const status: 'updated' | 'moved' = isMove ? 'moved' : 'updated';
  if (opts.dryRun) return { status, id: plan.newId, bucket: plan.newBucket, key: plan.newStorageKey };

  // snapshot the current body for revert (private bucket, stable per-id key).
  const currentHtml = await ports.storage.download(row.bucket, row.storageKey);
  await ports.storage.upload('private', backupKey(row.storageKey), currentHtml, 'text/html; charset=utf-8');

  await ports.storage.upload(plan.newBucket, plan.newStorageKey, newHtml, 'text/html; charset=utf-8');
  await ports.db.updateIdentity(row.id, next);
  if (plan.oldBucket !== plan.newBucket || plan.oldStorageKey !== plan.newStorageKey) {
    await ports.storage.remove(plan.oldBucket, plan.oldStorageKey);
  }
  return { status, id: plan.newId, bucket: plan.newBucket, key: plan.newStorageKey };
}

/**
 * Restore a document's previous body from the snapshot taken by the last edit.
 * One level deep: reverting again toggles back. Only in-place edits (same id) are
 * revertable — a move changes the storage key, so its snapshot is not found here.
 */
export async function revertDoc(
  ref: string,
  ports: UploadPorts,
  opts: { dryRun?: boolean } = {},
): Promise<EditResult> {
  const row = await ports.db.getByIdOrPath(ref);
  if (!row) throw new Error(`document not found: ${ref}`);

  let prevHtml: string;
  try {
    prevHtml = await ports.storage.download('private', backupKey(row.storageKey));
  } catch {
    throw new Error(`no snapshot to revert for ${row.id}`);
  }
  // an explicit revert authorizes whatever transition restores the snapshot.
  return editDoc(ref, prevHtml, ports, { dryRun: opts.dryRun, confirm: true });
}
