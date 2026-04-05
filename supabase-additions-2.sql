-- Run in Supabase SQL Editor → New query
-- Safe to run on top of existing schema

-- ── Pantry items ──────────────────────────────────────────────
create table if not exists pantry_items (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  name text not null,
  added_by uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  unique(household_id, name)
);
alter table pantry_items enable row level security;
create policy "Household members can manage pantry" on pantry_items
  for all using (household_id in (select household_id from household_members where user_id = auth.uid()));

-- ── Household preferences (dietary, allergies, etc) ──────────
create table if not exists household_preferences (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null unique,
  dietary jsonb default '[]',
  allergies jsonb default '[]',
  household_size integer default 2,
  cuisine_likes jsonb default '[]',
  cuisine_dislikes jsonb default '[]',
  updated_at timestamptz default now()
);
alter table household_preferences enable row level security;
create policy "Household members can manage preferences" on household_preferences
  for all using (household_id in (select household_id from household_members where user_id = auth.uid()));

-- ── Meal notes (per recipe, per household) ────────────────────
create table if not exists meal_notes (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  meal_name text not null,
  note text not null,
  author_id uuid references auth.users on delete set null,
  updated_at timestamptz default now(),
  unique(household_id, meal_name)
);
alter table meal_notes enable row level security;
create policy "Household members can manage meal notes" on meal_notes
  for all using (household_id in (select household_id from household_members where user_id = auth.uid()));

-- ── Meal schedule (assign meals to days) ─────────────────────
create table if not exists meal_schedule (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households on delete cascade not null,
  week_start date not null,
  schedule jsonb default '{}',
  updated_at timestamptz default now(),
  unique(household_id, week_start)
);
alter table meal_schedule enable row level security;
create policy "Household members can manage schedule" on meal_schedule
  for all using (household_id in (select household_id from household_members where user_id = auth.uid()));

-- Enable realtime
alter publication supabase_realtime add table pantry_items;
alter publication supabase_realtime add table meal_notes;
alter publication supabase_realtime add table meal_schedule;
