-- XamXam Bac — schéma Supabase (à exécuter dans SQL Editor)

-- Profils élèves
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text,
  serie text check (serie in ('L','S1S3','S2S4')),
  etablissement text,
  created_at timestamptz not null default now()
);

-- Sessions de cours (un sujet = une session)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  serie text,
  chapitre_id text,
  titre text not null,
  niveau text,
  programme jsonb not null default '[]'::jsonb,   -- titres des leçons
  lecons_validees int[] not null default '{}',
  etape text not null default 'demarrage',
  note_finale numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on public.sessions(user_id, updated_at desc);

-- Messages de l'entretien
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx on public.messages(session_id, id);

-- Compteur d'usage quotidien (anti-abus)
create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  jour date not null default current_date,
  nb int not null default 0,
  primary key (user_id, jour)
);

-- RLS
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.usage    enable row level security;

drop policy if exists "profil perso" on public.profiles;
create policy "profil perso" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "sessions perso" on public.sessions;
create policy "sessions perso" on public.sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "messages perso" on public.messages;
create policy "messages perso" on public.messages for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())));

drop policy if exists "usage lecture" on public.usage;
create policy "usage lecture" on public.usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- Incrément atomique du quota (appelé par la fonction Netlify avec le jeton de l'élève)
create or replace function public.increment_usage()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'non authentifié'; end if;
  insert into public.usage(user_id, jour, nb) values (auth.uid(), current_date, 1)
  on conflict (user_id, jour) do update set nb = public.usage.nb + 1
  returning nb into n;
  return n;
end $$;
revoke all on function public.increment_usage() from public, anon;
grant execute on function public.increment_usage() to authenticated;

-- Profil créé automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, prenom, serie)
  values (new.id, new.raw_user_meta_data->>'prenom', new.raw_user_meta_data->>'serie')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
