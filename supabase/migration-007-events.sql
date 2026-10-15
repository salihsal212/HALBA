-- ====================================================================
-- HALBA migration 007: Events — competitions, training sessions,
-- bootcamps, workshops, tryouts, showcases. Registration + results.
-- Run in Supabase -> SQL Editor after migration 006.
-- ====================================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  kind text not null check (kind in ('competition', 'training', 'bootcamp', 'workshop', 'tryout', 'showcase')),
  title text not null check (char_length(title) between 3 and 80),
  skill text default '',
  city text default '',
  venue text default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  description text default '' check (char_length(description) <= 1000),
  brackets text[] not null default '{}',          -- U12 / U15 / U18 / OPEN; empty = everyone
  fee_kwd numeric(8,3) not null default 0,
  capacity int check (capacity is null or capacity > 0),
  cover_url text,
  status text not null default 'open' check (status in ('open', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at);

alter table public.events enable row level security;
create policy "events are readable by everyone" on public.events for select using (true);
create policy "users create events as themselves" on public.events for insert with check (auth.uid() = organiser_id);
create policy "organisers update their events" on public.events for update using (auth.uid() = organiser_id);
create policy "organisers delete their events" on public.events for delete using (auth.uid() = organiser_id);

create table if not exists public.event_registrations (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'waitlist')),
  attended boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_registrations enable row level security;
create policy "registrations are readable by everyone" on public.event_registrations for select using (true);
create policy "users register themselves" on public.event_registrations for insert with check (auth.uid() = user_id);
create policy "users or organisers update registrations" on public.event_registrations for update using (
  auth.uid() = user_id
  or exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid())
);
create policy "users withdraw themselves, organisers remove" on public.event_registrations for delete using (
  auth.uid() = user_id
  or exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid())
);

create table if not exists public.event_results (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rank int not null check (rank > 0),
  note text default '' check (char_length(note) <= 120),   -- e.g. "31.2s", "5/5", "Gold"
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_results enable row level security;
create policy "results are readable by everyone" on public.event_results for select using (true);
create policy "organisers write results" on public.event_results for all using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid())
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid())
);
