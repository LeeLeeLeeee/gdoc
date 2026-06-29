import { createHash } from 'node:crypto';
import { slugFromPath, type Bucket, type GdocMeta } from './schema';
import { storageKeyFromIdHash } from './storageKey';

export type DocMutationPlan = {
  oldId: string;
  newId: string;
  oldPath: string;
  newPath: string;
  oldBucket: Bucket;
  newBucket: Bucket;
  oldStorageKey: string;
  newStorageKey: string;
  idChanged: boolean;
  bucketChanged: boolean;
  storageChanged: boolean;
};

function storageKeyForId(id: string): string {
  return storageKeyFromIdHash(id, createHash('sha256').update(id).digest('hex'));
}

export function planDocMetaMutation(
  current: {
    id: string;
    path: string;
    bucket: Bucket;
    storageKey: string;
    visibility: Bucket;
  },
  patchedMeta: GdocMeta,
): DocMutationPlan {
  if (!patchedMeta.path) throw new Error('Document path is required');
  const newId = slugFromPath(patchedMeta.path);
  if (!newId) throw new Error('Document id cannot be empty');
  const newBucket = patchedMeta.visibility;
  const newStorageKey = storageKeyForId(newId);
  const idChanged = current.id !== newId;
  const bucketChanged = current.bucket !== newBucket;
  return {
    oldId: current.id,
    newId,
    oldPath: current.path,
    newPath: patchedMeta.path,
    oldBucket: current.bucket,
    newBucket,
    oldStorageKey: current.storageKey,
    newStorageKey,
    idChanged,
    bucketChanged,
    storageChanged: idChanged,
  };
}
