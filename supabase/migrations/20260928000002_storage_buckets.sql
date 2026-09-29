-- Storage buckets for uploaded slips/receipts and bank statement PDFs.
-- Files are stored under a path prefixed with the owning user's id, e.g.
-- "{user_id}/2026-09-28-electricity.pdf", and policies check that prefix.

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('bank-statements', 'bank-statements', false)
on conflict (id) do nothing;

drop policy if exists "attachments_owner_rw" on storage.objects;
create policy "attachments_owner_rw" on storage.objects
  for all using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "bank_statements_owner_rw" on storage.objects;
create policy "bank_statements_owner_rw" on storage.objects
  for all using (
    bucket_id = 'bank-statements'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'bank-statements'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
