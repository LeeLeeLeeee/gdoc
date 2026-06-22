import { createClient } from '@supabase/supabase-js';
import type { DocSummary } from '../../shared/buildTree';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const sb = createClient(url, anon);

/** Resolve the URL to load a doc into the iframe: public → public URL, private → short signed URL. */
export async function docUrl(doc: DocSummary): Promise<string> {
  if (doc.visibility === 'public') {
    return sb.storage.from('public').getPublicUrl(doc.storageKey).data.publicUrl;
  }
  const { data, error } = await sb.storage.from('private').createSignedUrl(doc.storageKey, 60);
  if (error) throw error;
  return data.signedUrl;
}
