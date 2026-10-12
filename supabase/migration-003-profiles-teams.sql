-- ====================================================================
-- HALBA migration 003: richer profiles (username, photo, about) + teams
-- Run in Supabase -> SQL Editor after migration 002.
-- ====================================================================

-- ---------- profiles: username (unique), avatar, about ----------
alter table public.profiles
  add column if not exists username text,
  add column if not exists avatar_url text,
  add column if not exists about text default '';

alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

alter table public.profiles
  drop constraint if exists profiles_about_len;
alter table public.profiles
  add constraint profiles_about_len check (char_length(about) <= 200);

create unique index if not exists profiles_username_key
  on public.profiles (username);

-- ---------- teams (pages) ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  skill text default '',
  city text default '',
  about text default '' check (char_length(about) <= 300),
  logo_url text,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;

create policy "teams are readable by everyone"
  on public.teams for select using (true);

create policy "logged-in users create teams they admin"
  on public.teams for insert with check (auth.uid() = admin_id);

create policy "admins update their team"
  on public.teams for update using (auth.uid() = admin_id);

create policy "admins delete their team"
  on public.teams for delete using (auth.uid() = admin_id);

-- ---------- team membership with approval ----------
create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  role text not null default 'member' check (role in ('admin', 'member')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members (user_id);

alter table public.team_members enable row level security;

create policy "memberships are readable by everyone"
  on public.team_members for select using (true);

-- a user can request to join (pending); a team admin can add themselves as approved admin
create policy "users request membership as themselves"
  on public.team_members for insert with check (
    auth.uid() = user_id
    and (
      (status = 'pending' and role = 'member')
      or exists (select 1 from public.teams t where t.id = team_id and t.admin_id = auth.uid())
    )
  );

-- only the team admin can approve / change a membership
create policy "team admin updates memberships"
  on public.team_members for update using (
    exists (select 1 from public.teams t where t.id = team_id and t.admin_id = auth.uid())
  );

-- a user can leave / cancel; the admin can remove anyone
create policy "leave or remove membership"
  on public.team_members for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.teams t where t.id = team_id and t.admin_id = auth.uid())
  );
