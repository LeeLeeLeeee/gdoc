/** Backend boundary. Real implementations wrap supabase-js; tests use fakes. */

export type Bucket = 'public' | 'private';

export interface StoragePort {
  upload(
    bucket: Bucket,
    key: string,
    body: string | Uint8Array,
    contentType?: string,
  ): Promise<{ publicUrl?: string }>;
  download(bucket: Bucket, key: string): Promise<string>;
  remove(bucket: Bucket, key: string): Promise<void>;
}

export interface DocumentRow {
  id: string;
  uid?: string; // authored stable id; omitted → DB keeps/assigns one
  type: string;
  title: string;
  tags: string[];
  category: string;
  createdAt: string;
  visibility: Bucket;
  path: string;
  project?: string;
  bucket: Bucket;
  storageKey: string;
  contentHash: string;
}

export interface ExistingDoc {
  id: string;
  contentHash: string | null;
  path: string;
}

export interface DbPort {
  upsert(row: DocumentRow): Promise<void>;
  listExisting(): Promise<ExistingDoc[]>;
  getByIdOrPath(ref: string): Promise<DocumentRow | null>;
  exists(id: string): Promise<boolean>;
  updateIdentity(oldId: string, row: DocumentRow): Promise<void>;
  createFolder?(path: string, ownerUid?: string): Promise<void>;
  renameFolder?(oldPath: string, newPath: string, ownerUid?: string): Promise<void>;
  deleteFolder?(path: string): Promise<void>;
  /** Remove all highlights for a doc (full-replace cleanup). */
  deleteHighlights?(docId: string): Promise<void>;
  /** Remove specific highlights (targeted-edit consume). */
  deleteHighlightsByIds?(docId: string, ids: string[]): Promise<void>;
  /** Read a doc's highlights (instruction edit). */
  listHighlights?(docId: string): Promise<{ id: string; exact: string; note: string | null; keywords: string[] }[]>;
}
