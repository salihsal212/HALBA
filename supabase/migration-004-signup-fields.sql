-- ====================================================================
-- HALBA migration 004: age, gender, nationality, residence + private contact
-- Run in Supabase -> SQL Editor after migration 003.
-- ====================================================================

-- ---------- public profile fields ----------
-- birth_year + age_bracket are public (safe); the exact date of birth is private.
alter table public.profiles
  add column if not exists gender text,
  add column if not exists nationality text,
  add column if not exists residence text,
  add column if not exists birth_year int,
  add column if not exists age_bracket text;

alter table public.profiles drop constraint if exists profiles_gender_chk;
alter table public.profiles add constraint profiles_gender_chk
  check (gender is null or gender in ('male', 'female', 'unspecified'));

alter table public.profiles drop constraint if exists profiles_bracket_chk;
alter table public.profiles add constraint profiles_bracket_chk
  check (age_bracket is null or age_bracket in ('U12', 'U15', 'U18', 'OPEN'));

-- ---------- private fields: only the owner can read or write ----------
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date,
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{7,16}$'),
  guardian_name text,
  guardian_phone text check (guardian_phone is null or guardian_phone ~ '^\+?[0-9 ]{7,16}$'),
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;

create policy "owner reads private profile"
  on public.profile_private for select using (auth.uid() = user_id);

create policy "owner creates private profile"
  on public.profile_private for insert with check (auth.uid() = user_id);

create policy "owner updates private profile"
  on public.profile_private for update using (auth.uid() = user_id);
