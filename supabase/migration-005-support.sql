-- ====================================================================
-- HALBA migration 005: Support (one-way follow)
-- Run in Supabase -> SQL Editor after migration 004.
-- ====================================================================

create table if not exists public.supports (
  supporter_id uuid not null references public.profiles (id) on delete cascade,
  supported_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (supporter_id, supported_id),
  check (supporter_id <> supported_id)
);

create index if not exists supports_supported_idx on public.supports (supported_id);

alter table public.supports enable row level security;

create policy "supports are readable by everyone"
  on public.supports for select using (true);

create policy "users support as themselves"
  on public.supports for insert with check (auth.uid() = supporter_id);

create policy "users withdraw their own support"
  on public.supports for delete using (auth.uid() = supporter_id);
