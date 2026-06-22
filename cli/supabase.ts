import { createClient } from '@supabase/supabase-js';
import type { DbPort, StoragePort } from './ports';
import type { UploadPorts } from './upload';

/**
 * Real Supabase-backed ports. Uses the service_role key, which bypasses RLS —
 * keep it server-side only (never in the viewer bundle). `ownerUid` (the owner's
 * Supabase Auth user id) is stamped on each row so the owner can read private docs.
 */
export function createSupabasePorts(
  url: string,
  serviceRoleKey: string,
  ownerUid?: string,
): UploadPorts {
  const sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const storage: StoragePort = {
    async upload(bucket, key, body, contentType) {
      const ct = contentType ?? 'application/octet-stream';
      // Wrap strings in a typed Blob — supabase-js otherwise serves string
      // bodies as text/plain, which makes the browser show source not render.
      const payload = typeof body === 'string' ? new Blob([body], { type: ct }) : body;
      const { error } = await sb.storage
        .from(bucket)
        .upload(key, payload, { contentType: ct, upsert: true });
      if (error) throw error;
      const { data } = sb.storage.from(bucket).getPublicUrl(key);
      return { publicUrl: bucket === 'public' ? data.publicUrl : undefined };
    },
  };

  const db: DbPort = {
    async upsert(row) {
      const { error } = await sb.from('documents').upsert({
        id: row.id,
        ...(row.uid ? { uid: row.uid } : {}), // omit → DB preserves existing / assigns default
        type: row.type,
        title: row.title,
        tags: row.tags,
        category: row.category,
        created_at: row.createdAt,
        visibility: row.visibility,
        path: row.path,
        project: row.project ?? null,
        bucket: row.bucket,
        storage_key: row.storageKey,
        owner_uid: ownerUid ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
  };

  return { storage, db };
}
