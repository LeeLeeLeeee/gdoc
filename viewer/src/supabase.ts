import { createClient } from '@supabase/supabase-js';
import type { DocSummary } from '../../shared/buildTree';
import { buildDocHtmlRequest } from './docHtmlRequest';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const sb = createClient(supabaseUrl, anon);

/** Load document HTML. Public docs use Storage URLs; private docs use the owner-only admin function. */
export async function fetchDocHtml(
  doc: DocSummary,
  accessToken: string | null | undefined,
  cacheKey?: string | number,
  signal?: AbortSignal,
): Promise<string> {
  const publicUrl = sb.storage.from('public').getPublicUrl(doc.storageKey).data.publicUrl;
  const request = buildDocHtmlRequest({ doc, supabaseUrl, accessToken, cacheKey, publicUrl });
  const response = await fetch(request.url, { ...request.init, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}
