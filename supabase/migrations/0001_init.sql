-- gdoc 0001_init — documents table, RLS, full-text search, storage buckets.
-- Verify with: `supabase start` then `supabase db reset` (applies migrations locally).

create table if not exists public.documents (
  id          text primary key,                 -- slug(resolvePath(meta))
  type        text not null check (type in
                ('tech-note','overview','change-log','feature-spec','deploy-test','index')),
  title       text not null,
  tags        text[] not null default '{}',
  category    text not null,
  created_at  timestamptz not null,
  visibility  text not null default 'private' check (visibility in ('public','private')),
  path        text not null,
  project     text,
  bucket      text not null check (bucket in ('public','private')),
  storage_key text not null,
  owner_uid   uuid,  -- CLI sets from OWNER_UID env (owner's auth user id); null ⇒ public-only readable
  updated_at  timestamptz not null default now()
  -- Full-text search (tsvector) deferred: a GENERATED column tripped Postgres'
  -- immutability check on Supabase. Add later via a trigger-maintained tsvector
  -- column. For now name/meta search uses ILIKE / client-side filter.
);

create index if not exists documents_path_idx   on public.documents (path);
create index if not exists documents_owner_idx  on public.documents (owner_uid);

alter table public.documents enable row level security;

-- Read: anyone for public docs; the owner for their own (public or private).
create policy documents_read on public.documents
  for select using (visibility = 'public' or auth.uid() = owner_uid);

-- No insert/update/delete policy on purpose: clients cannot write.
-- The CLI writes with the service_role key, which bypasses RLS.

-- Storage buckets: public (world-readable) + private (owner-only).
insert into storage.buckets (id, name, public)
  values ('public', 'public', true), ('private', 'private', false)
  on conflict (id) do nothing;

-- Private objects: owner-only read.
-- NOTE (open decision from eng review): serving a private doc into the viewer's
-- <iframe> uses a short-lived signed URL (createSignedUrl). The exact issuer
-- (owner client vs. edge function) is finalized during T4.
create policy private_read on storage.objects
  for select using (bucket_id = 'private' and auth.uid() = owner);
