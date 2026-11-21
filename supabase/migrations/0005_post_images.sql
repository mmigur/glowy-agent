-- Картинка, которую пользователь прикрепил к варианту поста. Файл лежит в бакете post-images,
-- путь всегда начинается с id пользователя. Публикация берёт короткую подписанную ссылку.

alter table public.drafts add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy post_images_select on storage.objects for select to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy post_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy post_images_update on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy post_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
