-- Tighten the previous single-user "authenticated = owner" model into an
-- explicit owner_uid check. Existing docs are already uploaded with owner_uid.

update storage.objects as object
set owner = documents.owner_uid
from public.documents as documents
where object.bucket_id = documents.bucket
  and object.name = documents.storage_key
  and documents.owner_uid is not null
  and object.owner is distinct from documents.owner_uid;

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents
  for select using (visibility = 'public' or auth.uid() = owner_uid);

drop policy if exists private_read on storage.objects;
create policy private_read on storage.objects
  for select using (bucket_id = 'private' and auth.uid() = owner);

drop policy if exists document_folders_read on public.document_folders;
create policy document_folders_read on public.document_folders
  for select using (auth.uid() = owner_uid);
