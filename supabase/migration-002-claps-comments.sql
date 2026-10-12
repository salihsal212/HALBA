-- ====================================================================
-- HALBA migration 002: claps replace likes; typed comments
-- Run in Supabase -> SQL Editor. Safe to run once after schema.sql.
-- ====================================================================

-- ---------- claps (one per user per post) ----------
create table if not exists public.claps (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.claps enable row level security;

create policy "claps are readable by everyone"
  on public.claps for select using (true);

create policy "logged-in users clap as themselves"
  on public.claps for insert with check (auth.uid() = user_id);

create policy "users remove their own claps"
  on public.claps for delete using (auth.uid() = user_id);

-- carry over any existing likes, then retire the likes table
insert into public.claps (post_id, user_id, created_at)
select post_id, user_id, created_at from public.likes
on conflict do nothing;

drop table if exists public.likes;

-- ---------- comments with a type: appreciate / suggest / ask ----------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('appreciate', 'suggest', 'ask')),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

create policy "comments are readable by everyone"
  on public.comments for select using (true);

create policy "logged-in users comment as themselves"
  on public.comments for insert with check (auth.uid() = user_id);

create policy "users delete their own comments"
  on public.comments for delete using (auth.uid() = user_id);
