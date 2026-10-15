-- ====================================================================
-- HALBA migration 008: owners can edit their own posts (caption / media)
-- ====================================================================
drop policy if exists "users edit their own posts" on public.posts;
create policy "users edit their own posts" on public.posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
