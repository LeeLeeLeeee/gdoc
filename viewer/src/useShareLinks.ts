import { useCallback, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabaseUrl } from './supabase';

export type ShareLinkSummary = {
  id: string;
  docId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  token?: string;
};

export function useShareLinks(session: Session | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(
    async <T,>(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> => {
      if (!session) throw new Error('로그인이 필요합니다.');
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-docs/${path}`, {
          method,
          headers: {
            authorization: `Bearer ${session.access_token}`,
            'content-type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '공유 링크 작업에 실패했습니다.');
        return data as T;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  const listShareLinks = useCallback(
    async (docId: string) => {
      const data = await invoke<{ links: ShareLinkSummary[] }>(`shares?docId=${encodeURIComponent(docId)}`, 'GET');
      return data.links;
    },
    [invoke],
  );

  const createShareLink = useCallback(
    async (docId: string, expiresAt: string | null) => {
      const data = await invoke<{ link: ShareLinkSummary; token: string }>('shares', 'POST', { docId, expiresAt });
      return { ...data.link, token: data.token };
    },
    [invoke],
  );

  const revokeShareLink = useCallback(
    async (id: string) => {
      const data = await invoke<{ link: ShareLinkSummary }>(`shares/${encodeURIComponent(id)}`, 'DELETE');
      return data.link;
    },
    [invoke],
  );

  return { listShareLinks, createShareLink, revokeShareLink, loading, error };
}
