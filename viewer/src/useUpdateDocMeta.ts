import { useCallback, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { DocSummary } from '../../shared/buildTree';
import { supabaseUrl } from './supabase';

export type UpdateDocMetaRequest = {
  title?: string;
  path?: string;
  tags?: string[];
  category?: string;
  type?: string;
  visibility?: 'public' | 'private';
};

type DocRow = {
  id: string;
  title: string;
  type: string;
  path: string;
  visibility: 'public' | 'private';
  bucket: 'public' | 'private';
  storage_key?: string;
  storageKey?: string;
  tags?: string[];
  category: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

export function toDocSummary(row: DocRow): DocSummary {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    path: row.path,
    visibility: row.visibility,
    bucket: row.bucket,
    storageKey: row.storage_key ?? row.storageKey ?? '',
    tags: row.tags ?? [],
    category: row.category,
    createdAt: row.created_at ?? row.createdAt ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? '',
  };
}

export function useUpdateDocMeta(session: Session | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDocMeta = useCallback(
    async (id: string, patch: UpdateDocMetaRequest): Promise<DocSummary> => {
      if (!session) throw new Error('로그인이 필요합니다.');
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-docs/docs/${encodeURIComponent(id)}/meta`, {
          method: 'PATCH',
          headers: {
            authorization: `Bearer ${session.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '문서 메타정보 저장에 실패했습니다.');
        return toDocSummary(data.document);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [session],
  );

  return { updateDocMeta, saving, error };
}
