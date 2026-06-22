-- Single-user model: "authenticated = owner".
-- Anyone reads PUBLIC docs; the signed-in owner reads EVERYTHING.
-- IMPORTANT: disable public sign-ups in Supabase (Auth → Providers/Settings:
-- turn off "Allow new users to sign up") so only the owner account can authenticate.

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents
  for select using (visibility = 'public' or auth.role() = 'authenticated');

drop policy if exists private_read on storage.objects;
create policy private_read on storage.objects
  for select using (bucket_id = 'private' and auth.role() = 'authenticated');
