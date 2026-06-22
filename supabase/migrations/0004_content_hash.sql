-- Content hash for duplicate / unchanged detection on upload.
-- The CLI computes sha256(html); same hash under a different id = duplicate,
-- same id + same hash = unchanged (skip), same id + different hash = update.

alter table public.documents
  add column if not exists content_hash text;

create index if not exists documents_content_hash_idx on public.documents (content_hash);
