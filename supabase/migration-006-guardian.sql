-- HALBA migration 006: accounts for ages 3+; under-13 accounts are guardian-managed
alter table public.profiles
  add column if not exists guardian_managed boolean not null default false;
