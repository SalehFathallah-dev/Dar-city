-- =====================================================================
-- Migration 3: Private storage buckets and policies
-- Files are never public; the app uses short-lived signed URLs.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('medical-documents', 'medical-documents', false, 10485760, array['application/pdf','image/jpeg','image/png']),
  ('player-photos', 'player-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Medical documents: clinical staff read/upload, physician removes.
create policy "medical docs read" on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and public.is_clinical());
create policy "medical docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and public.is_clinical());
create policy "medical docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and public.is_physician());

-- Player photos: all active staff can view, physician/admin manage.
create policy "player photos read" on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and public.is_staff());
create policy "player photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin'));
create policy "player photos update" on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin'));
create policy "player photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and public.has_role('team_physician','super_admin'));
