-- Run this entire file in your Supabase dashboard:
-- Go to your project → SQL Editor → New query → paste this → Run

-- ── Step 1: Create all tables first ─────────────────────────

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  email text,
  updated_at timestamptz default now()
);

create table if not exists households (
  id uuid default gen_random_uuid() primary key,
  name text not null default 'My Household',
  invite_code text unique not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now()
);

create table if not exists household_members (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(household_id, user_id)
);

create table if not exists recipes (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  name text not null,
  subtitle text,
  time integer default 30,
  servings integer default 4,
  calories integer,
  price numeric(6,2) default 9.99,
  badge text,
  tags jsonb default '[]',
  ingredients jsonb default '[]',
  seasonal text,
  emoji text,
  created_at timestamptz default now()
);

create table if not exists weekly_menus (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  week_start date not null,
  meals text not null,
  updated_at timestamptz default now(),
  unique(household_id, week_start)
);

create table if not exists picks (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  week_start date not null,
  meal_ids jsonb default '[]',
  updated_at timestamptz default now(),
  unique(household_id, user_id, week_start)
);

-- ── Step 2: Enable RLS on all tables ────────────────────────

alter table profiles enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table recipes enable row level security;
alter table weekly_menus enable row level security;
alter table picks enable row level security;

-- ── Step 3: Create all policies ──────────────────────────────

create policy "Users can read all profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

create policy "Anyone can read households" on households for select using (true);
create policy "Authenticated users can create households" on households
  for insert with check (auth.uid() is not null);

create policy "Members can read household members" on household_members
  for select using (
    household_id in (select household_id from household_members hm where hm.user_id = auth.uid())
  );
create policy "Authenticated users can join households" on household_members
  for insert with check (auth.uid() = user_id);

create policy "Household members can read recipes" on recipes
  for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "Household members can insert recipes" on recipes
  for insert with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "Household members can delete recipes" on recipes
  for delete using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );

create policy "Household members can read menus" on weekly_menus
  for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "Household members can insert menus" on weekly_menus
  for insert with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "Household members can update menus" on weekly_menus
  for update using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );

create policy "Household members can read picks" on picks
  for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "Users can insert own picks" on picks
  for insert with check (auth.uid() = user_id);
create policy "Users can update own picks" on picks
  for update using (auth.uid() = user_id);

-- ── Step 4: Auto-create profile on signup ───────────────────

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, new.raw_user_meta_data->>'name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Step 5: Enable realtime for live pick syncing ────────────

alter publication supabase_realtime add table picks;
