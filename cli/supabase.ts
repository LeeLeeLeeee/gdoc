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
    async download(bucket, key) {
      const { data, error } = await sb.storage.from(bucket).download(key);
      if (error) throw error;
      return await data.text();
    },
    async remove(bucket, key) {
      const { error } = await sb.storage.from(bucket).remove([key]);
      if (error) throw error;
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
        content_hash: row.contentHash,
        owner_uid: ownerUid ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    async listExisting() {
      const { data, error } = await sb.from('documents').select('id,content_hash,path');
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, contentHash: r.content_hash, path: r.path }));
    },
    async getByIdOrPath(ref) {
      const { data: byId, error: byIdError } = await sb
        .from('documents')
        .select('id,uid,type,title,tags,category,created_at,visibility,path,project,bucket,storage_key,content_hash')
        .eq('id', ref)
        .maybeSingle();
      if (byIdError) throw byIdError;

      const { data, error } = byId ? { data: byId, error: null } : await sb
        .from('documents')
        .select('id,uid,type,title,tags,category,created_at,visibility,path,project,bucket,storage_key,content_hash')
        .eq('path', ref)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        uid: data.uid,
        type: data.type,
        title: data.title,
        tags: data.tags ?? [],
        category: data.category,
        createdAt: data.created_at,
        visibility: data.visibility,
        path: data.path,
        project: data.project ?? undefined,
        bucket: data.bucket,
        storageKey: data.storage_key,
        contentHash: data.content_hash ?? '',
      };
    },
    async exists(id) {
      const { data, error } = await sb.from('documents').select('id').eq('id', id).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async updateIdentity(oldId, row) {
      const { error } = await sb
        .from('documents')
        .update({
          id: row.id,
          ...(row.uid ? { uid: row.uid } : {}),
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
          content_hash: row.contentHash,
          owner_uid: ownerUid ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', oldId);
      if (error) throw error;
    },
    async createFolder(path, folderOwnerUid) {
      const segments = path.split('/').filter(Boolean);
      const { error } = await sb.from('document_folders').insert({
        path,
        name: segments.at(-1) ?? path,
        parent_path: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
        owner_uid: folderOwnerUid ?? ownerUid ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    async renameFolder(oldPath, newPath, folderOwnerUid) {
      const { data: folders, error: foldersError } = await sb.from('document_folders').select('*');
      if (foldersError) throw foldersError;
      const oldRows = (folders ?? []).filter((row) => row.path === oldPath || row.path.startsWith(`${oldPath}/`));
      const rows = oldRows
        .map((row) => {
          const path = row.path === oldPath ? newPath : `${newPath}${row.path.slice(oldPath.length)}`;
          const segments = path.split('/').filter(Boolean);
          return {
            ...row,
            path,
            name: segments.at(-1) ?? path,
            parent_path: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
            owner_uid: row.owner_uid ?? folderOwnerUid ?? ownerUid ?? null,
            updated_at: new Date().toISOString(),
          };
        });
      if (rows.length) {
        const { error } = await sb.from('document_folders').upsert(rows);
        if (error) throw error;
        const nextPaths = new Set(rows.map((row) => row.path));
        const oldPaths = oldRows.map((row) => row.path).filter((path) => !nextPaths.has(path));
        if (oldPaths.length) {
          const { error: deleteError } = await sb.from('document_folders').delete().in('path', oldPaths);
          if (deleteError) throw deleteError;
        }
      }
    },
    async deleteFolder(path) {
      const { error } = await sb.from('document_folders').delete().eq('path', path);
      if (error) throw error;
    },
    async deleteHighlights(docId: string) {
      const { error } = await sb.from('highlights').delete().eq('doc_id', docId);
      if (error) throw new Error(error.message);
    },
    async deleteHighlightsByIds(docId: string, ids: string[]) {
      if (ids.length === 0) return;
      const { error } = await sb.from('highlights').delete().eq('doc_id', docId).in('id', ids);
      if (error) throw new Error(error.message);
    },
    async listHighlights(docId: string) {
      const { data, error } = await sb.from('highlights').select('id,exact,note,keywords').eq('doc_id', docId);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; exact: string; note: string | null; keywords: string[] }[];
    },
  };

  return { storage, db };
}
