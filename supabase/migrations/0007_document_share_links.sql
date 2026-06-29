create table if not exists public.document_share_links (
  id          uuid primary key default gen_random_uuid(),
  doc_id      text not null references public.documents(id) on delete cascade,
  token_hash  text not null unique,
  created_by  uuid not null,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists document_share_links_doc_idx on public.document_share_links (doc_id);
create index if not exists document_share_links_token_hash_idx on public.document_share_links (token_hash);

alter table public.document_share_links enable row level security;

create policy document_share_links_owner_read on public.document_share_links
  for select using (auth.uid() = created_by);
