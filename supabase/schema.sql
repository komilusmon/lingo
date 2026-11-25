create extension if not exists pgcrypto;

create table if not exists public.drill_sessions (
  id uuid primary key,
  level text not null check (level in ('A2', 'B1', 'B2')),
  status text not null check (status in ('draft', 'generated', 'completed')),
  correct_count integer not null default 0,
  total_count integer not null default 0,
  xp_balance int4 not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.drill_sessions add column if not exists xp_balance int4 not null default 0;

alter table public.drill_sessions enable row level security;

drop policy if exists "Public read drill sessions" on public.drill_sessions;
create policy "Public read drill sessions"
  on public.drill_sessions
  for select
  using (true);

drop policy if exists "Public insert drill sessions" on public.drill_sessions;
create policy "Public insert drill sessions"
  on public.drill_sessions
  for insert
  with check (true);

drop policy if exists "Public update drill sessions" on public.drill_sessions;
create policy "Public update drill sessions"
  on public.drill_sessions
  for update
  using (true)
  with check (true);
