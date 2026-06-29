import type { DocSummary } from '../../shared/buildTree';

type BuildDocHtmlRequestInput = {
  doc: DocSummary;
  supabaseUrl: string;
  accessToken: string | null | undefined;
  cacheKey?: string | number;
  publicUrl: string;
};

export function buildDocHtmlRequest({
  doc,
  supabaseUrl,
  accessToken,
  cacheKey,
  publicUrl,
}: BuildDocHtmlRequestInput): { url: string; init?: RequestInit } {
  if (doc.visibility === 'public') {
    const url = new URL(publicUrl);
    url.searchParams.set('v', doc.updatedAt || doc.storageKey);
    if (cacheKey !== undefined) url.searchParams.set('r', String(cacheKey));
    return { url: url.toString(), init: undefined };
  }

  if (!accessToken) throw new Error('Private document requires an owner session');

  const base = supabaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/functions/v1/admin-docs/docs/${encodeURIComponent(doc.id)}/html`);
  if (cacheKey !== undefined) url.searchParams.set('r', String(cacheKey));
  return {
    url: url.toString(),
    init: { headers: { authorization: `Bearer ${accessToken}` } },
  };
}
