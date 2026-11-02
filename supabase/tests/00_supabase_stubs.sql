-- Minimal stand-ins for the Supabase-managed schemas so the migrations can be
-- tested on a plain PostgreSQL 15+/16 server. NOT used in Supabase itself.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema auth, storage, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
