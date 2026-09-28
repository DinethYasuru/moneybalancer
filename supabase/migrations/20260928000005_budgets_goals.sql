-- Budgets, essential/discretionary tagging, and savings goals — the pieces
-- needed to move from "here's what you spent" to "here's what to cut and
-- what to save toward".

alter table public.categories add column if not exists monthly_budget numeric(12, 2);
alter table public.categories add column if not exists is_essential boolean not null default true;

alter table public.statement_transactions add column if not exists balance_after numeric(14, 2);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null,
  target_date date,
  current_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.savings_goals enable row level security;

create policy "savings_goals_owner" on public.savings_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sensible defaults: bills/necessities are essential, lifestyle categories are not.
update public.categories set is_essential = false where name in ('Dining Out', 'Subscriptions', 'Other');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, icon, color, is_default, is_essential) values
    (new.id, 'Rent', '🏠', '#5b4fe8', true, true),
    (new.id, 'Electricity', '⚡', '#f0a93a', true, true),
    (new.id, 'Water', '💧', '#14b8a6', true, true),
    (new.id, 'Internet', '🌐', '#3b82f6', true, true),
    (new.id, 'Groceries', '🛒', '#17a673', true, true),
    (new.id, 'Transport', '🚗', '#f97316', true, true),
    (new.id, 'Dining Out', '🍽️', '#e0435c', true, false),
    (new.id, 'Subscriptions', '🔁', '#8b5cf6', true, false),
    (new.id, 'Health', '➕', '#ec4899', true, true),
    (new.id, 'Other', '📦', '#6b7280', true, false);
  return new;
end;
$$;
