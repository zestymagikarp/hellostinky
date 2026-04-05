-- Run this in Supabase SQL Editor → New query
-- These are ADDITIONS to your existing schema — safe to run on top of what you already have

-- ── Meal ratings (thumbs up/down after the week) ─────────────
create table if not exists meal_ratings (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  meal_name text not null,
  meal_data jsonb,
  rating integer not null check (rating in (1, -1)),
  week_start date not null,
  created_at timestamptz default now(),
  unique(household_id, user_id, meal_name, week_start)
);
alter table meal_ratings enable row level security;
create policy "Household members can read ratings" on meal_ratings
  for select using (household_id in (select household_id from household_members where user_id = auth.uid()));
create policy "Users can insert own ratings" on meal_ratings
  for insert with check (auth.uid() = user_id);
create policy "Users can update own ratings" on meal_ratings
  for update using (auth.uid() = user_id);

-- ── Meal history (archive of past boxes) ────────────────────
create table if not exists meal_history (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  week_start date not null,
  meals jsonb not null,
  archived_at timestamptz default now(),
  unique(household_id, week_start)
);
alter table meal_history enable row level security;
create policy "Household members can read history" on meal_history
  for select using (household_id in (select household_id from household_members where user_id = auth.uid()));
create policy "Household members can insert history" on meal_history
  for insert with check (household_id in (select household_id from household_members where user_id = auth.uid()));

-- ── Push subscriptions ────────────────────────────────────────
create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(user_id)
);
alter table push_subscriptions enable row level security;
create policy "Users can manage own push sub" on push_subscriptions
  for all using (auth.uid() = user_id);

-- Enable realtime on history too
alter publication supabase_realtime add table meal_ratings;
