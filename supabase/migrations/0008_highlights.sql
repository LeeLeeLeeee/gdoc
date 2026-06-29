-- supabase/migrations/0008_highlights.sql
create table if not exists highlights (
  id          uuid primary key default gen_random_uuid(),
  doc_id      text not null references documents(id) on delete cascade on update cascade,
  owner_uid   uuid not null,
  exact       text not null,
  prefix      text,
  suffix      text,
  text_pos    int,
  note        text,
  keywords    text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table highlights enable row level security;

create policy highlights_owner_all on highlights
  for all
  using (auth.uid() = owner_uid)
  with check (auth.uid() = owner_uid);

create index if not exists highlights_doc_owner_idx on highlights (doc_id, owner_uid);
