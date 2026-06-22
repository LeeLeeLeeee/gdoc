/** Backend boundary. Real implementations wrap supabase-js; tests use fakes. */

export type Bucket = 'public' | 'private';

export interface StoragePort {
  upload(
    bucket: Bucket,
    key: string,
    body: string | Uint8Array,
    contentType?: string,
  ): Promise<{ publicUrl?: string }>;
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
}

export interface DbPort {
  upsert(row: DocumentRow): Promise<void>;
}
