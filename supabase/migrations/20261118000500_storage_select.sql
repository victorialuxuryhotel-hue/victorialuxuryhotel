-- Storage API deletes (and upserts) must be able to SELECT the object first.
-- Without these, a manager's "delete photo" removed the database record but
-- silently left the file in the bucket. Public reads use the public URL and
-- don't depend on these policies.
create policy "managers read room images" on storage.objects
  for select to authenticated using (bucket_id = 'room-images' and public.is_manager());
create policy "managers read site images" on storage.objects
  for select to authenticated using (bucket_id = 'site-images' and public.is_manager());
