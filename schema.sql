-- Run this in Supabase: Dashboard -> SQL Editor -> New query -> paste this -> Run

-- The items table. Each row belongs to one user.
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  location text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Speed up queries that list a user's items newest-first.
create index items_user_updated_idx on items(user_id, updated_at desc);

-- Turn on Row Level Security so users can only see their own items.
alter table items enable row level security;

-- Single policy: a user can do anything on rows where they are the owner.
create policy "Users manage their own items"
  on items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
