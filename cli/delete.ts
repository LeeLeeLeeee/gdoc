import { planFolderDelete } from '../shared/deletePlan';
import type { UploadPorts } from './upload';

export interface DeleteOptions {
  confirm?: boolean;
  dryRun?: boolean;
}

export interface DeleteResult {
  deletedDocs: string[];
  deletedFolders: string[];
  warnings: string[];
  dryRun: boolean;
}

function assertConfirmed(opts: DeleteOptions, what: string) {
  if (!opts.confirm && !opts.dryRun) {
    throw new Error(`requires --confirm: ${what} (되돌릴 수 없습니다)`);
  }
}

/**
 * Remove one document: database row first, storage object second.
 *
 * The order matters. Deleting the row first means `highlights` and
 * `document_share_links` go with it (ON DELETE CASCADE), and a failure at the
 * storage step leaves only an orphaned object — invisible and harmless.
 * The reverse order would leave a row pointing at a missing object, which
 * breaks the document when it is opened.
 */
export async function deleteDoc(ref: string, ports: UploadPorts, opts: DeleteOptions): Promise<DeleteResult> {
  if (!ports.db.deleteDoc) throw new Error('이 백엔드는 문서 삭제를 지원하지 않습니다');

  const row = await ports.db.getByIdOrPath(ref);
  if (!row) throw new Error(`document not found: ${ref}`);

  assertConfirmed(opts, `문서 삭제 ${row.path}`);
  if (opts.dryRun) {
    return { deletedDocs: [row.id], deletedFolders: [], warnings: [], dryRun: true };
  }

  const warnings = await removeDocRow(row.id, row.bucket, row.storageKey, ports);
  return { deletedDocs: [row.id], deletedFolders: [], warnings, dryRun: false };
}

/**
 * Guard for the non-recursive `folder rmdir`.
 *
 * The Edge Function already refuses to drop a folder that still holds
 * documents or subfolders; the CLI did not, which silently orphaned documents
 * into an implicit folder. Same rule on both paths now.
 */
export async function assertFolderEmpty(path: string, ports: UploadPorts): Promise<void> {
  const docs = await ports.db.listExisting();
  const folders = ports.db.listFolders ? await ports.db.listFolders() : [];
  const plan = planFolderDelete(path, docs, folders);
  const childFolders = plan.counts.folders - 1;
  if (plan.counts.docs > 0 || childFolders > 0) {
    throw new Error(
      `folder not empty: ${path} (문서 ${plan.counts.docs}개 · 하위 폴더 ${childFolders}개) — 통째로 지우려면 --recursive --confirm`,
    );
  }
}

/** Delete a folder together with every document and subfolder inside it. */
export async function deleteFolderRecursive(
  path: string,
  ports: UploadPorts,
  opts: DeleteOptions,
): Promise<DeleteResult> {
  if (!ports.db.deleteDoc) throw new Error('이 백엔드는 문서 삭제를 지원하지 않습니다');
  if (!ports.db.deleteFolder) throw new Error('이 백엔드는 폴더 삭제를 지원하지 않습니다');
  if (!ports.db.listFolders) throw new Error('이 백엔드는 폴더 조회를 지원하지 않습니다');

  const docs = await ports.db.listExisting();
  const folders = await ports.db.listFolders();
  const plan = planFolderDelete(path, docs, folders);

  assertConfirmed(opts, `폴더 삭제 ${path} (문서 ${plan.counts.docs}개 · 폴더 ${plan.counts.folders}개)`);
  if (opts.dryRun) {
    return { deletedDocs: plan.docs, deletedFolders: plan.folders, warnings: [], dryRun: true };
  }

  const warnings: string[] = [];
  const deletedDocs: string[] = [];
  for (const id of plan.docs) {
    const row = await ports.db.getByIdOrPath(id);
    if (!row) {
      warnings.push(`문서를 찾을 수 없어 건너뜀: ${id}`);
      continue;
    }
    warnings.push(...(await removeDocRow(row.id, row.bucket, row.storageKey, ports)));
    deletedDocs.push(row.id);
  }

  const deletedFolders: string[] = [];
  for (const folderPath of plan.folders) {
    try {
      await ports.db.deleteFolder(folderPath);
      deletedFolders.push(folderPath);
    } catch (error) {
      warnings.push(`폴더 삭제 실패: ${folderPath} (${message(error)})`);
    }
  }

  return { deletedDocs, deletedFolders, warnings, dryRun: false };
}

async function removeDocRow(
  id: string,
  bucket: 'public' | 'private',
  storageKey: string,
  ports: UploadPorts,
): Promise<string[]> {
  await ports.db.deleteDoc!(id);
  try {
    await ports.storage.remove(bucket, storageKey);
  } catch (error) {
    // The row is already gone, so the document is deleted as far as users are
    // concerned. Report the leftover object instead of failing the command.
    return [`storage 객체 삭제 실패: ${bucket}/${storageKey} (${message(error)})`];
  }
  return [];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
