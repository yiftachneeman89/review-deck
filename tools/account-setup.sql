-- Review Deck accounts: paste all of this into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run again.

-- one row per account: every rd./cc./sm./dc. setting (progress, quiz, caches, Gemini key)
create table if not exists public.decks (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  state jsonb not null default '{}',
  state_at bigint not null default 0,     -- when the settings were last saved (ms)
  project_at bigint not null default 0,   -- savedAt of the project file in storage (ms)
  updated_at timestamptz not null default now()
);
alter table public.decks enable row level security;
drop policy if exists "own deck" on public.decks;
create policy "own deck" on public.decks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- "Open on phone": a one-time code -> a spare sign-in made when you typed your password
create table if not exists public.phone_links (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);
alter table public.phone_links enable row level security;
drop policy if exists "own links" on public.phone_links;
create policy "own links" on public.phone_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- the phone isn't signed in yet: it trades the code for the sign-in once, within 10 minutes
create or replace function public.take_phone_link(link_id text) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  delete from phone_links where id = link_id and created_at > now() - interval '10 minutes' returning token into t;
  return t;
end $$;
revoke all on function public.take_phone_link(text) from public;
grant execute on function public.take_phone_link(text) to anon, authenticated;

-- the project files: one private file per account, in a folder named after the account
insert into storage.buckets (id, name, public) values ('projects', 'projects', false) on conflict (id) do nothing;
drop policy if exists "own project read" on storage.objects;
drop policy if exists "own project add" on storage.objects;
drop policy if exists "own project change" on storage.objects;
drop policy if exists "own project delete" on storage.objects;
create policy "own project read" on storage.objects for select to authenticated
  using (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own project add" on storage.objects for insert to authenticated
  with check (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own project change" on storage.objects for update to authenticated
  using (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own project delete" on storage.objects for delete to authenticated
  using (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);
