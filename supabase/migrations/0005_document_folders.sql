create table if not exists public.document_folders (
  path        text primary key,
  name        text not null,
  parent_path text,
  owner_uid   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (length(trim(path)) > 0),
  check (position('//' in path) = 0)
);

create index if not exists document_folders_parent_idx on public.document_folders (parent_path);

alter table public.document_folders enable row level security;

create policy document_folders_read on public.document_folders
  for select using (auth.role() = 'authenticated');
