-- Open Higgsfield: owner allowlist, saved provider keys, and templates.
-- Every table is prefixed ohf_ so it can share a Supabase project with other apps.

-- Who may use the studio. Sign-in alone is not enough; the user must be listed here.
create table if not exists public.ohf_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  added_at timestamptz not null default now()
);
alter table public.ohf_owners enable row level security;
revoke all on public.ohf_owners from anon;
drop policy if exists "owner reads own row" on public.ohf_owners;
create policy "owner reads own row" on public.ohf_owners
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.ohf_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ohf_owners o where o.user_id = (select auth.uid()));
$$;
revoke execute on function public.ohf_is_owner() from public, anon;
grant execute on function public.ohf_is_owner() to authenticated;

create or replace function public.ohf_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Provider keys. The app encrypts each key with AES-256-GCM on the server
-- (OHF_KEY_ENCRYPTION_SECRET) before it reaches this table, so the database
-- only ever holds ciphertext plus a masked hint for display.
create table if not exists public.ohf_api_keys (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('higgsfield', 'openai', 'google', 'kie')),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  hint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.ohf_api_keys enable row level security;
revoke all on public.ohf_api_keys from anon;
drop trigger if exists ohf_api_keys_touch on public.ohf_api_keys;
create trigger ohf_api_keys_touch before update on public.ohf_api_keys
  for each row execute function public.ohf_touch();

drop policy if exists "owner reads own keys" on public.ohf_api_keys;
drop policy if exists "owner adds own keys" on public.ohf_api_keys;
drop policy if exists "owner replaces own keys" on public.ohf_api_keys;
drop policy if exists "owner deletes own keys" on public.ohf_api_keys;
create policy "owner reads own keys" on public.ohf_api_keys
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.ohf_is_owner()));
create policy "owner adds own keys" on public.ohf_api_keys
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.ohf_is_owner()));
create policy "owner replaces own keys" on public.ohf_api_keys
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.ohf_is_owner()))
  with check (user_id = (select auth.uid()) and (select public.ohf_is_owner()));
create policy "owner deletes own keys" on public.ohf_api_keys
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.ohf_is_owner()));

-- Saved setups: model, prompt, settings and inputs of a finished run.
create table if not exists public.ohf_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text,
  surface text not null check (surface in ('image', 'video')),
  model_id text not null,
  model_label text not null,
  prompt text not null default '',
  settings jsonb not null default '{}'::jsonb,
  inputs jsonb not null default '[]'::jsonb,
  urls jsonb not null default '[]'::jsonb,
  ratio text not null default '1 / 1',
  meta text not null default '',
  badge text,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ohf_templates_user_created on public.ohf_templates (user_id, created_at desc);
alter table public.ohf_templates enable row level security;
revoke all on public.ohf_templates from anon;
drop trigger if exists ohf_templates_touch on public.ohf_templates;
create trigger ohf_templates_touch before update on public.ohf_templates
  for each row execute function public.ohf_touch();

drop policy if exists "owner reads own templates" on public.ohf_templates;
drop policy if exists "owner adds own templates" on public.ohf_templates;
drop policy if exists "owner edits own templates" on public.ohf_templates;
drop policy if exists "owner deletes own templates" on public.ohf_templates;
create policy "owner reads own templates" on public.ohf_templates
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.ohf_is_owner()));
create policy "owner adds own templates" on public.ohf_templates
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.ohf_is_owner()));
create policy "owner edits own templates" on public.ohf_templates
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.ohf_is_owner()))
  with check (user_id = (select auth.uid()) and (select public.ohf_is_owner()));
create policy "owner deletes own templates" on public.ohf_templates
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.ohf_is_owner()));

-- No one is an owner until added. The repo is public, so the owner's email is
-- not written here. Add each person (after creating them in Supabase Auth) with:
--   insert into public.ohf_owners (user_id, email)
--   select id, email from auth.users where email = 'you@example.com'
--   on conflict (user_id) do nothing;
