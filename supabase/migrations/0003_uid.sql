-- Stable node identity for the future knowledge graph.
-- Existing rows get a generated uuid; new rows default one too. The CLI only
-- sends `uid` when the doc's meta authored one, so re-uploads preserve it.

alter table public.documents
  add column if not exists uid uuid not null default gen_random_uuid();

create unique index if not exists documents_uid_idx on public.documents (uid);
