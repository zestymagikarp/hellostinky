-- Add instructions column to recipes table
alter table recipes add column if not exists instructions jsonb default '[]';
