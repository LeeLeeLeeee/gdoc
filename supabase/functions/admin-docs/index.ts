import { createClient } from 'npm:@supabase/supabase-js@2';

type Bucket = 'public' | 'private';

type DocumentRow = {
  id: string;
  uid: string;
  type: string;
  title: string;
  tags: string[];
  category: string;
  created_at: string;
  visibility: Bucket;
  path: string;
  project: string | null;
  bucket: Bucket;
  storage_key: string;
  content_hash: string | null;
  owner_uid: string | null;
  updated_at: string;
};

type FolderRow = {
  path: string;
  name: string;
  parent_path: string | null;
  owner_uid: string | null;
  created_at: string;
  updated_at: string;
};

type ShareLinkRow = {
  id: string;
  doc_id: string;
  token_hash: string;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type DocumentSummary = Pick<
  DocumentRow,
  | 'id'
  | 'title'
  | 'type'
  | 'path'
  | 'visibility'
  | 'bucket'
  | 'storage_key'
  | 'tags'
  | 'category'
  | 'created_at'
  | 'updated_at'
  | 'content_hash'
>;

type ServiceClient = ReturnType<typeof createClient>;

type PreparedDocMutation = {
  row: DocumentRow;
  originalHtml: string;
  html: string;
  bucket: Bucket;
  storageKey: string;
  contentHash: string;
  dbPatch: {
    id: string;
    type: unknown;
    title: unknown;
    tags: unknown;
    category: unknown;
    created_at: string;
    visibility: Bucket;
    path: string;
    project: unknown;
    bucket: Bucket;
    storage_key: string;
    content_hash: string;
    updated_at: string;
  };
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

const docTypes = new Set(['tech-note', 'overview', 'change-log', 'feature-spec', 'deploy-test', 'index']);
const metaBlock = /<script[^>]*\bid=["']gdoc-meta["'][^>]*>([\s\S]*?)<\/script>/i;

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly warnings: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function apiError(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function slugFromPath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, ''),
    )
    .filter(Boolean)
    .join('/');
}

function storageKeyAsciiBase(id: string): string {
  const ascii = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (ascii || 'doc').slice(0, 80);
}

async function storageKey(id: string): Promise<string> {
  const hash = await sha256Hex(id);
  return `${storageKeyAsciiBase(id)}-${hash.slice(0, 10)}.html`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    apiError(400, code, 'Invalid request payload');
  }
  return value;
}

function validateMeta(meta: Record<string, unknown>): void {
  if (typeof meta.title !== 'string' || meta.title.trim() === '') {
    apiError(400, 'invalid_payload', 'Document title is required');
  }
  if (typeof meta.path !== 'string' || meta.path.trim() === '') {
    apiError(400, 'invalid_payload', 'Document path is required');
  }
  if (typeof meta.category !== 'string' || meta.category.trim() === '') {
    apiError(400, 'invalid_payload', 'Document category is required');
  }
  if (typeof meta.type !== 'string' || !docTypes.has(meta.type)) {
    apiError(400, 'invalid_payload', 'Document type is invalid');
  }
  if (meta.visibility !== 'public' && meta.visibility !== 'private') {
    apiError(400, 'invalid_payload', 'Document visibility is invalid');
  }
  if (!Array.isArray(meta.tags) || !meta.tags.every((tag) => typeof tag === 'string')) {
    apiError(400, 'invalid_payload', 'Document tags must be strings');
  }
  if (typeof meta.createdAt !== 'string' || meta.createdAt.trim() === '') {
    apiError(400, 'invalid_payload', 'Document createdAt is required');
  }
}

function editablePatch(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) apiError(400, 'invalid_payload', 'Request body must be an object');

  const patch: Record<string, unknown> = {};
  for (const key of ['title', 'path', 'tags', 'category', 'type', 'visibility'] as const) {
    if (key in input) patch[key] = input[key];
  }
  return patch;
}

function patchMeta(
  html: string,
  defaults: Record<string, unknown>,
  patch: Record<string, unknown>,
): { html: string; meta: Record<string, unknown> } {
  const match = html.match(metaBlock);
  if (!match) apiError(400, 'missing_meta_block', 'Missing <script id="gdoc-meta"> block');

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    apiError(400, 'invalid_meta_json', 'gdoc-meta block is not valid JSON');
  }
  if (!isRecord(parsed)) apiError(400, 'invalid_meta_json', 'gdoc-meta block must be an object');

  const meta = { ...defaults, ...parsed, ...patch };
  if (!Array.isArray(meta.tags)) meta.tags = [];
  validateMeta(meta);

  const replacement = match[0].replace(match[1], JSON.stringify(meta, null, 2));
  return { html: html.replace(match[0], replacement), meta };
}

function normalizeFolderPath(path: string): string {
  const normalized = path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
  if (!normalized) apiError(400, 'invalid_payload', 'Folder path cannot be empty');
  return normalized;
}

function normalizeFolderName(name: string): string {
  const value = name.trim();
  if (!value || value.includes('/')) apiError(400, 'invalid_payload', 'Folder name must be a single path segment');
  return value;
}

function folderPathOf(path: string): string {
  const parts = path.split('/').map((part) => part.trim()).filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function fileLeaf(path: string): string {
  const parts = path.split('/').map((part) => part.trim()).filter(Boolean);
  const leaf = parts.at(-1);
  if (!leaf) apiError(400, 'invalid_payload', 'Document path cannot be empty');
  return leaf;
}

function renamePathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(`${oldPrefix}/`)) return `${newPrefix}${path.slice(oldPrefix.length)}`;
  return path;
}

function routePath(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const functionIndex = parts.indexOf('admin-docs');
  return functionIndex === -1 ? parts.join('/') : parts.slice(functionIndex + 1).join('/');
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    apiError(400, 'invalid_payload', 'Request body must be valid JSON');
  }
}

async function getDocument(service: ServiceClient, id: string): Promise<DocumentRow> {
  const { data, error } = await service.from('documents').select('*').eq('id', id).single();
  if (error || !data) apiError(404, 'not_found', 'Document not found');
  return data as DocumentRow;
}

async function folderExists(service: ServiceClient, folderPath: string): Promise<boolean> {
  const explicit = await service.from('document_folders').select('path').eq('path', folderPath).maybeSingle();
  if (explicit.error) apiError(500, 'db_update_failed', explicit.error.message);
  if (explicit.data) return true;

  const derived = await service.from('documents').select('path').like('path', `${folderPath}/%`).limit(50);
  if (derived.error) apiError(500, 'db_update_failed', derived.error.message);
  return (derived.data ?? []).some((row: { path: string }) => row.path.startsWith(`${folderPath}/`));
}

async function assertFolderExists(service: ServiceClient, folderPath: string): Promise<void> {
  if (!(await folderExists(service, folderPath))) {
    apiError(404, 'not_found', 'Folder not found');
  }
}

async function assertNoDocumentFilePath(service: ServiceClient, path: string): Promise<void> {
  const { data, error } = await service.from('documents').select('id').eq('path', path).maybeSingle();
  if (error) apiError(500, 'db_update_failed', error.message);
  if (data) apiError(409, 'path_conflict', `A document already exists at ${path}`);
}

async function assertNoFolderConflict(
  service: ServiceClient,
  path: string,
  oldPrefix?: string,
): Promise<void> {
  const { data, error } = await service.from('document_folders').select('path').limit(10000);
  if (error) apiError(500, 'db_update_failed', error.message);

  const conflict = (data ?? []).find((row: { path: string }) => {
    const folderPath = row.path;
    const underOldPrefix = oldPrefix && (folderPath === oldPrefix || folderPath.startsWith(`${oldPrefix}/`));
    return !underOldPrefix && (folderPath === path || folderPath.startsWith(`${path}/`));
  });

  if (conflict) apiError(409, 'path_conflict', `Folder already exists at ${conflict.path}`);
}

async function assertNoDerivedFolderConflict(
  service: ServiceClient,
  path: string,
  oldPrefix?: string,
): Promise<void> {
  const { data, error } = await service.from('documents').select('id,path').like('path', `${path}/%`).limit(10000);
  if (error) apiError(500, 'db_update_failed', error.message);

  const conflict = (data ?? []).find((row: { id: string; path: string }) => {
    const underOldPrefix = oldPrefix && row.path.startsWith(`${oldPrefix}/`);
    return !underOldPrefix && row.path.startsWith(`${path}/`);
  });

  if (conflict) apiError(409, 'path_conflict', `Folder already exists at ${path}`);
}

async function prepareDocMutation(
  service: ServiceClient,
  row: DocumentRow,
  patch: Record<string, unknown>,
): Promise<PreparedDocMutation> {
  const { data: blob, error } = await service.storage.from(row.bucket).download(row.storage_key);
  if (error || !blob) {
    apiError(500, 'storage_download_failed', error?.message ?? 'Storage download failed');
  }

  const currentHtml = await blob.text();
  const defaults = {
    type: row.type,
    title: row.title,
    tags: row.tags ?? [],
    category: row.category,
    createdAt: row.created_at,
    visibility: row.visibility,
    path: row.path,
    project: row.project ?? undefined,
  };
  const { html, meta } = patchMeta(currentHtml, defaults, patch);
  const newPath = String(meta.path);
  const newId = slugFromPath(newPath);
  if (!newId) apiError(400, 'invalid_payload', 'Document id cannot be empty');

  const newBucket = meta.visibility as Bucket;
  const newStorageKey = await storageKey(newId);
  const contentHash = await sha256Hex(html);

  return {
    row,
    originalHtml: currentHtml,
    html,
    bucket: newBucket,
    storageKey: newStorageKey,
    contentHash,
    dbPatch: {
      id: newId,
      type: meta.type,
      title: meta.title,
      tags: meta.tags,
      category: meta.category,
      created_at: row.created_at,
      visibility: newBucket,
      path: newPath,
      project: typeof meta.project === 'string' && meta.project.trim() ? meta.project : null,
      bucket: newBucket,
      storage_key: newStorageKey,
      content_hash: contentHash,
      updated_at: new Date().toISOString(),
    },
  };
}

async function assertNoDocIdConflict(
  service: ServiceClient,
  prepared: PreparedDocMutation[],
): Promise<void> {
  const oldIds = new Set(prepared.map((item) => item.row.id));
  const newIds = prepared.map((item) => String(item.dbPatch.id));
  if (new Set(newIds).size !== newIds.length) {
    apiError(409, 'path_conflict', 'Multiple documents would move to the same id');
  }

  const changedIds = newIds.filter((id, index) => id !== prepared[index].row.id);
  if (changedIds.length === 0) return;

  const { data, error } = await service.from('documents').select('id').in('id', changedIds);
  if (error) apiError(500, 'db_update_failed', error.message);

  const conflict = (data ?? []).find((row: { id: string }) => !oldIds.has(row.id));
  if (conflict) apiError(409, 'path_conflict', `Document already exists at ${conflict.id}`);
}

async function applyDocMutation(
  service: ServiceClient,
  prepared: PreparedDocMutation,
): Promise<{ document: DocumentSummary; warnings: string[] }> {
  const oldBucket = prepared.row.bucket;
  const oldStorageKey = prepared.row.storage_key;
  const storageChanged = oldBucket !== prepared.bucket || oldStorageKey !== prepared.storageKey;
  const warnings: string[] = [];

  const { error: uploadError } = await service.storage
    .from(prepared.bucket)
    .upload(prepared.storageKey, new Blob([prepared.html], { type: 'text/html; charset=utf-8' }), {
      contentType: 'text/html; charset=utf-8',
      upsert: true,
    });
  if (uploadError) apiError(500, 'storage_upload_failed', uploadError.message);

  const { data, error: updateError } = await service
    .from('documents')
    .update(prepared.dbPatch)
    .eq('id', prepared.row.id)
    .select('id,title,type,path,visibility,bucket,storage_key,tags,category,created_at,updated_at,content_hash')
    .single();

  if (updateError || !data) {
    if (storageChanged) {
      await service.storage.from(prepared.bucket).remove([prepared.storageKey]);
    } else {
      await service.storage
        .from(oldBucket)
        .upload(oldStorageKey, new Blob([prepared.originalHtml], { type: 'text/html; charset=utf-8' }), {
          contentType: 'text/html; charset=utf-8',
          upsert: true,
        });
    }
    apiError(500, 'db_update_failed', updateError?.message ?? 'Document update failed');
  }

  if (storageChanged) {
    const { error: removeError } = await service.storage.from(oldBucket).remove([oldStorageKey]);
    if (removeError) warnings.push(`old storage object was not removed: ${removeError.message}`);
  }

  return { document: data as DocumentSummary, warnings };
}

async function updateDocMeta(
  service: ServiceClient,
  id: string,
  patchInput: unknown,
): Promise<Response> {
  const row = await getDocument(service, id);
  const prepared = await prepareDocMutation(service, row, editablePatch(patchInput));
  await assertNoDocIdConflict(service, [prepared]);

  const result = await applyDocMutation(service, prepared);
  return json(200, { document: result.document, warnings: result.warnings });
}

async function downloadDocHtml(service: ServiceClient, id: string): Promise<Response> {
  const row = await getDocument(service, id);
  const { data: blob, error } = await service.storage.from(row.bucket).download(row.storage_key);
  if (error || !blob) {
    apiError(500, 'storage_download_failed', error?.message ?? 'Storage download failed');
  }
  return new Response(await blob.text(), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'text/html; charset=utf-8' },
  });
}

async function moveDoc(service: ServiceClient, id: string, bodyInput: unknown): Promise<Response> {
  if (!isRecord(bodyInput)) apiError(400, 'invalid_payload', 'Request body must be an object');
  const targetFolderPath = normalizeFolderPath(assertString(bodyInput.targetFolderPath, 'invalid_payload'));
  await assertFolderExists(service, targetFolderPath);

  const row = await getDocument(service, id);
  const nextPath = `${targetFolderPath}/${fileLeaf(row.path)}`;
  return await updateDocMeta(service, id, { path: nextPath });
}

async function createFolder(
  service: ServiceClient,
  userId: string,
  bodyInput: unknown,
): Promise<Response> {
  if (!isRecord(bodyInput)) apiError(400, 'invalid_payload', 'Request body must be an object');
  const name = normalizeFolderName(assertString(bodyInput.name, 'invalid_payload'));
  const parentPath =
    typeof bodyInput.parentPath === 'string' && bodyInput.parentPath.trim()
      ? normalizeFolderPath(bodyInput.parentPath)
      : null;
  if (parentPath) await assertFolderExists(service, parentPath);

  const path = parentPath ? `${parentPath}/${name}` : name;
  await assertNoDocumentFilePath(service, path);

  const now = new Date().toISOString();
  const folder = {
    path,
    name,
    parent_path: parentPath,
    owner_uid: userId,
    updated_at: now,
  };

  const { data, error } = await service.from('document_folders').insert(folder).select('*').single();
  if (error) {
    if (error.code === '23505') {
      apiError(409, 'path_conflict', `Folder already exists at ${path}`);
    }
    apiError(500, 'db_update_failed', error.message);
  }

  return json(200, { folder: data as FolderRow, warnings: [] });
}

async function deleteFolder(service: ServiceClient, bodyInput: unknown): Promise<Response> {
  if (!isRecord(bodyInput)) apiError(400, 'invalid_payload', 'Request body must be an object');
  const path = normalizeFolderPath(assertString(bodyInput.path, 'invalid_payload'));

  const { data: folder, error: folderError } = await service
    .from('document_folders')
    .select('path')
    .eq('path', path)
    .maybeSingle();
  if (folderError) apiError(500, 'db_update_failed', folderError.message);
  if (!folder) apiError(404, 'not_found', 'Folder not found');

  const { data: docs, error: docsError } = await service.from('documents').select('path').like('path', `${path}/%`).limit(50);
  if (docsError) apiError(500, 'db_update_failed', docsError.message);
  if ((docs ?? []).some((row: { path: string }) => row.path.startsWith(`${path}/`))) {
    apiError(409, 'folder_not_empty', 'Folder contains documents');
  }

  const { data: children, error: childrenError } = await service
    .from('document_folders')
    .select('path')
    .like('path', `${path}/%`)
    .limit(50);
  if (childrenError) apiError(500, 'db_update_failed', childrenError.message);
  if ((children ?? []).some((row: { path: string }) => row.path.startsWith(`${path}/`))) {
    apiError(409, 'folder_not_empty', 'Folder contains child folders');
  }

  const { error } = await service.from('document_folders').delete().eq('path', path);
  if (error) apiError(500, 'db_update_failed', error.message);
  return json(200, { warnings: [] });
}

async function documentsUnderFolder(service: ServiceClient, oldPath: string): Promise<DocumentRow[]> {
  const { data, error } = await service.from('documents').select('*').like('path', `${oldPath}/%`).limit(10000);
  if (error) apiError(500, 'db_update_failed', error.message);
  return ((data ?? []) as DocumentRow[]).filter((row) => row.path.startsWith(`${oldPath}/`));
}

async function explicitFoldersUnder(service: ServiceClient, oldPath: string): Promise<FolderRow[]> {
  const { data, error } = await service.from('document_folders').select('*').limit(10000);
  if (error) apiError(500, 'db_update_failed', error.message);
  return ((data ?? []) as FolderRow[]).filter(
    (folder) => folder.path === oldPath || folder.path.startsWith(`${oldPath}/`),
  );
}

async function renameFolder(
  service: ServiceClient,
  userId: string,
  bodyInput: unknown,
): Promise<Response> {
  if (!isRecord(bodyInput)) apiError(400, 'invalid_payload', 'Request body must be an object');
  const oldPath = normalizeFolderPath(assertString(bodyInput.oldPath, 'invalid_payload'));
  const newName = normalizeFolderName(assertString(bodyInput.newName, 'invalid_payload'));
  await assertFolderExists(service, oldPath);

  const parent = folderPathOf(oldPath);
  const newPath = parent ? `${parent}/${newName}` : newName;
  if (newPath === oldPath) {
    return json(200, {
      folder: {
        path: oldPath,
        name: fileLeaf(oldPath),
        parent_path: parent || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      movedDocuments: [],
      warnings: [],
    });
  }

  await assertNoDocumentFilePath(service, newPath);
  await assertNoFolderConflict(service, newPath, oldPath);
  await assertNoDerivedFolderConflict(service, newPath, oldPath);

  const docs = await documentsUnderFolder(service, oldPath);
  const prepared = await Promise.all(
    docs.map((row) => prepareDocMutation(service, row, { path: renamePathPrefix(row.path, oldPath, newPath) })),
  );
  await assertNoDocIdConflict(service, prepared);

  const movedDocuments: DocumentSummary[] = [];
  const warnings: string[] = [];

  for (const item of prepared) {
    try {
      const result = await applyDocMutation(service, item);
      movedDocuments.push(result.document);
      warnings.push(...result.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(500, 'db_update_failed', `Folder rename partially failed: ${message}`, warnings);
    }
  }

  const now = new Date().toISOString();
  const folderRows = await explicitFoldersUnder(service, oldPath);
  const renamedFolders = folderRows.map((folder) => {
    const path = renamePathPrefix(folder.path, oldPath, newPath);
    const parentPath = folderPathOf(path);
    return {
      ...folder,
      path,
      name: fileLeaf(path),
      parent_path: parentPath || null,
      owner_uid: folder.owner_uid ?? userId,
      updated_at: now,
    };
  });

  if (renamedFolders.length > 0) {
    const { error: upsertError } = await service.from('document_folders').upsert(renamedFolders);
    if (upsertError) apiError(500, 'db_update_failed', upsertError.message);
  }

  const oldFolderPaths = folderRows.map((folder) => folder.path).filter((path) => !renamedFolders.some((row) => row.path === path));
  if (oldFolderPaths.length > 0) {
    const { error: deleteError } = await service.from('document_folders').delete().in('path', oldFolderPaths);
    if (deleteError) {
      warnings.push(`old folder rows were not removed: ${deleteError.message}`);
    }
  }

  return json(200, {
    folder: {
      path: newPath,
      name: fileLeaf(newPath),
      parent_path: folderPathOf(newPath) || null,
      created_at: renamedFolders.find((folder) => folder.path === newPath)?.created_at ?? now,
      updated_at: now,
    },
    movedDocuments,
    warnings,
  });
}

function shareLinkSummary(row: ShareLinkRow) {
  return {
    id: row.id,
    docId: row.doc_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

async function listShareLinks(service: ServiceClient, docId: string): Promise<Response> {
  await getDocument(service, docId);
  const { data, error } = await service
    .from('document_share_links')
    .select('id,doc_id,token_hash,created_by,expires_at,revoked_at,created_at')
    .eq('doc_id', docId)
    .order('created_at', { ascending: false });
  if (error) apiError(500, 'db_update_failed', error.message);
  return json(200, { links: ((data ?? []) as ShareLinkRow[]).map(shareLinkSummary) });
}

async function createShareLink(
  service: ServiceClient,
  userId: string,
  bodyInput: unknown,
): Promise<Response> {
  if (!isRecord(bodyInput)) apiError(400, 'invalid_payload', 'Request body must be an object');
  const docId = assertString(bodyInput.docId, 'invalid_payload');
  await getDocument(service, docId);

  let expiresAt: string | null = null;
  if (typeof bodyInput.expiresAt === 'string' && bodyInput.expiresAt.trim()) {
    const date = new Date(bodyInput.expiresAt);
    if (Number.isNaN(date.getTime())) apiError(400, 'invalid_payload', 'expiresAt must be an ISO date');
    expiresAt = date.toISOString();
  }

  const token = randomShareToken();
  const tokenHash = await sha256Hex(token);
  const { data, error } = await service
    .from('document_share_links')
    .insert({
      doc_id: docId,
      token_hash: tokenHash,
      created_by: userId,
      expires_at: expiresAt,
    })
    .select('id,doc_id,token_hash,created_by,expires_at,revoked_at,created_at')
    .single();
  if (error || !data) apiError(500, 'db_update_failed', error?.message ?? 'Share link creation failed');

  return json(200, { link: shareLinkSummary(data as ShareLinkRow), token });
}

async function revokeShareLink(service: ServiceClient, id: string): Promise<Response> {
  const { data, error } = await service
    .from('document_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,doc_id,token_hash,created_by,expires_at,revoked_at,created_at')
    .single();
  if (error || !data) apiError(404, 'not_found', 'Share link not found');
  return json(200, { link: shareLinkSummary(data as ShareLinkRow) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ownerUid = Deno.env.get('OWNER_UID');
  if (!supabaseUrl || !serviceKey || !ownerUid) {
    return json(500, { error: 'server_misconfigured', message: 'Missing Supabase environment variables' });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized', message: 'Missing bearer token' });

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userResult, error: userError } = await service.auth.getUser(token);
  if (userError || !userResult.user) {
    return json(401, { error: 'unauthorized', message: 'Invalid bearer token' });
  }
  if (userResult.user.id !== ownerUid) {
    return json(403, { error: 'forbidden', message: 'Only the owner can modify documents' });
  }

  try {
    const path = routePath(new URL(req.url));

    if (req.method === 'GET' && path.startsWith('docs/') && path.endsWith('/html')) {
      const id = decodeURIComponent(path.slice('docs/'.length, -'/html'.length));
      return await downloadDocHtml(service, id);
    }

    if (req.method === 'PATCH' && path.startsWith('docs/') && path.endsWith('/meta')) {
      const id = decodeURIComponent(path.slice('docs/'.length, -'/meta'.length));
      return await updateDocMeta(service, id, await readJson(req));
    }

    if (req.method === 'PATCH' && path.startsWith('docs/') && path.endsWith('/move')) {
      const id = decodeURIComponent(path.slice('docs/'.length, -'/move'.length));
      return await moveDoc(service, id, await readJson(req));
    }

    if (req.method === 'POST' && path === 'folders') {
      return await createFolder(service, userResult.user.id, await readJson(req));
    }

    if (req.method === 'PATCH' && path === 'folders/rename') {
      return await renameFolder(service, userResult.user.id, await readJson(req));
    }

    if (req.method === 'DELETE' && path === 'folders') {
      return await deleteFolder(service, await readJson(req));
    }

    if (req.method === 'GET' && path === 'shares') {
      const docId = new URL(req.url).searchParams.get('docId');
      if (!docId) apiError(400, 'invalid_payload', 'docId is required');
      return await listShareLinks(service, docId);
    }

    if (req.method === 'POST' && path === 'shares') {
      return await createShareLink(service, userResult.user.id, await readJson(req));
    }

    if (req.method === 'DELETE' && path.startsWith('shares/')) {
      const id = decodeURIComponent(path.slice('shares/'.length));
      return await revokeShareLink(service, id);
    }

    return json(404, { error: 'not_found', message: 'Unknown admin-docs route' });
  } catch (error) {
    if (error instanceof ApiError) {
      return json(error.status, { error: error.code, message: error.message, warnings: error.warnings });
    }

    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: 'server_error', message });
  }
});
