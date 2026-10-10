-- ====================================================================
-- HALBA database schema for Supabase
-- How to use: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Safe to run once on a fresh project.
-- ====================================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  city text default '',
  skill text default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

create policy "users insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "users update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- ---------- posts ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  caption text not null check (char_length(caption) <= 500),
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  created_at timestamptz not null default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id);

alter table public.posts enable row level security;

create policy "posts are readable by everyone"
  on public.posts for select using (true);

create policy "logged-in users create their own posts"
  on public.posts for insert with check (auth.uid() = user_id);

create policy "users delete their own posts"
  on public.posts for delete using (auth.uid() = user_id);

-- ---------- likes ----------
create table if not exists public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.likes enable row level security;

create policy "likes are readable by everyone"
  on public.likes for select using (true);

create policy "logged-in users like as themselves"
  on public.likes for insert with check (auth.uid() = user_id);

create policy "users remove their own likes"
  on public.likes for delete using (auth.uid() = user_id);

-- ---------- storage bucket for photos & videos ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "users upload into their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own media"
  on storage.objects for delete
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
