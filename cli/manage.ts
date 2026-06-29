import { contentHash } from './classify';
import type { UploadPorts } from './upload';
import { patchGdocMetaHtml, type GdocMetaPatch } from '../shared/metaPatch';
import { planDocMetaMutation } from '../shared/docMutation';
import { fileLeaf, folderPathOf, normalizeFolderPath, renamePathPrefix } from '../shared/folderRules';

export async function updateRemoteDoc(ref: string, patch: GdocMetaPatch, ports: UploadPorts, dryRun = false) {
  const row = await ports.db.getByIdOrPath(ref);
  if (!row) throw new Error(`document not found: ${ref}`);

  const html = await ports.storage.download(row.bucket, row.storageKey);
  const patched = patchGdocMetaHtml(html, { path: row.path, ...patch });
  const plan = planDocMetaMutation(
    { id: row.id, path: row.path, bucket: row.bucket, storageKey: row.storageKey, visibility: row.visibility },
    patched.meta,
  );

  if (plan.newId !== row.id && await ports.db.exists(plan.newId)) {
    throw new Error(`path conflict: ${plan.newPath}`);
  }

  const next = {
    ...row,
    id: plan.newId,
    type: patched.meta.type,
    title: patched.meta.title,
    tags: patched.meta.tags,
    category: patched.meta.category,
    visibility: patched.meta.visibility,
    path: plan.newPath,
    project: patched.meta.project,
    bucket: plan.newBucket,
    storageKey: plan.newStorageKey,
    contentHash: contentHash(patched.html),
  };

  if (dryRun) return { row: next, plan };

  await ports.storage.upload(plan.newBucket, plan.newStorageKey, patched.html, 'text/html; charset=utf-8');
  await ports.db.updateIdentity(row.id, next);
  if (plan.oldBucket !== plan.newBucket || plan.oldStorageKey !== plan.newStorageKey) {
    await ports.storage.remove(plan.oldBucket, plan.oldStorageKey);
  }
  return { row: next, plan };
}

export function renameFilePath(path: string, newName: string): string {
  const parent = folderPathOf(path);
  return parent ? `${parent}/${newName}` : newName;
}

export function moveFilePath(path: string, targetFolder: string): string {
  return `${normalizeFolderPath(targetFolder)}/${fileLeaf(path)}`;
}

export async function renameFolderDocs(oldPath: string, newName: string, ports: UploadPorts, dryRun = false) {
  const normalizedOld = normalizeFolderPath(oldPath);
  const parent = folderPathOf(normalizedOld);
  const normalizedNew = parent ? `${parent}/${newName}` : normalizeFolderPath(newName);
  const existing = await ports.db.listExisting();
  const docs = existing.filter((doc) => doc.path.startsWith(`${normalizedOld}/`));
  const updates = [];
  for (const doc of docs) {
    updates.push(await updateRemoteDoc(doc.id, { path: renamePathPrefix(doc.path, normalizedOld, normalizedNew) }, ports, dryRun));
  }
  if (!dryRun && ports.db.renameFolder) {
    await ports.db.renameFolder(normalizedOld, normalizedNew);
  }
  return { oldPath: normalizedOld, newPath: normalizedNew, updates };
}

