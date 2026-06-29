import { createClient } from 'npm:@supabase/supabase-js@2';

type Bucket = 'public' | 'private';

type ShareRow = {
  id: string;
  doc_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  documents: {
    id: string;
    title: string;
    type: string;
    path: string;
    visibility: Bucket;
    bucket: Bucket;
    storage_key: string;
    tags: string[];
    category: string;
    created_at: string;
    updated_at: string;
  } | null;
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET,OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function routeToken(req: Request): string | null {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const functionIndex = parts.indexOf('shared-docs');
  const token = functionIndex === -1 ? parts.at(-1) : parts[functionIndex + 1];
  return token ? decodeURIComponent(token) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed', message: 'Only GET is supported' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'server_misconfigured', message: 'Missing Supabase environment variables' });
  }

  const token = routeToken(req);
  if (!token) return json(404, { error: 'not_found', message: 'Share link not found' });

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const tokenHash = await sha256Hex(token);
  const { data, error } = await service
    .from('document_share_links')
    .select(`
      id,
      doc_id,
      expires_at,
      revoked_at,
      documents (
        id,
        title,
        type,
        path,
        visibility,
        bucket,
        storage_key,
        tags,
        category,
        created_at,
        updated_at
      )
    `)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) return json(500, { error: 'db_read_failed', message: error.message });
  const share = data as ShareRow | null;
  if (!share || !share.documents) return json(404, { error: 'not_found', message: 'Share link not found' });
  if (share.revoked_at) return json(410, { error: 'revoked', message: 'Share link has been revoked' });
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return json(410, { error: 'expired', message: 'Share link has expired' });
  }

  const doc = share.documents;
  const { data: blob, error: storageError } = await service.storage.from(doc.bucket).download(doc.storage_key);
  if (storageError || !blob) {
    return json(500, { error: 'storage_download_failed', message: storageError?.message ?? 'Storage download failed' });
  }

  return json(200, {
    document: {
      id: doc.id,
      title: doc.title,
      type: doc.type,
      path: doc.path,
      visibility: doc.visibility,
      bucket: doc.bucket,
      storageKey: doc.storage_key,
      tags: doc.tags ?? [],
      category: doc.category,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    },
    html: await blob.text(),
  });
});
