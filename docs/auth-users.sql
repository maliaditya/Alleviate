-- Run in the Supabase SQL Editor for the project used by this app.
-- The server accesses these tables with SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.auth_users (
  username text primary key,
  email text,
  is_priviledge boolean not null default false,
  password_hash text not null,
  password_salt text not null,
  password_algo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  migrated_from_storage_at timestamptz
);

-- Support databases created before the privilege flag was added.
alter table public.auth_users
  add column if not exists is_priviledge boolean not null default false;

create unique index if not exists auth_users_email_lower_unique
  on public.auth_users (lower(email))
  where email is not null;

create table if not exists public.user_github_settings (
  username text primary key references public.auth_users(username) on update cascade on delete cascade,
  github_token text,
  github_owner text,
  github_repo text,
  github_path text,
  github_fetch_missing_only boolean not null default true,
  supabase_url text,
  supabase_anon_key text,
  supabase_pdf_bucket text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  migrated_from_storage_at timestamptz
);

alter table public.user_github_settings enable row level security;
alter table public.auth_users enable row level security;

-- These tables contain password hashes and user credentials. The app's server
-- uses the service role; browser-facing roles must not access them directly.
revoke all on table public.auth_users from anon, authenticated;
revoke all on table public.user_github_settings from anon, authenticated;
