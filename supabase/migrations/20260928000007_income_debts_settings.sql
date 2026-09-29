-- Income, debt tracking (loans/credit cards/informal lending), and
-- per-user personalization settings — the pieces needed to answer
-- "am I actually ahead or behind this month" and "what does my debt
-- actually cost me".

create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  amount numeric(12, 2) not null,
  frequency text not null default 'monthly' check (frequency in ('monthly', 'weekly', 'biweekly', 'one_time')),
  received_date date not null default current_date,
  is_recurring boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists income_user_date_idx on public.income (user_id, received_date desc);

alter table public.income enable row level security;

drop policy if exists "income_owner" on public.income;
create policy "income_owner" on public.income
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  debt_type text not null default 'loan' check (debt_type in ('loan', 'credit_card', 'personal_lending', 'other')),
  lender text,
  principal_amount numeric(12, 2),
  current_balance numeric(12, 2) not null,
  interest_rate numeric(5, 2), -- annual %, nullable for interest-free personal loans
  minimum_payment numeric(12, 2),
  due_day smallint check (due_day between 1 and 31),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists debts_user_idx on public.debts (user_id);

alter table public.debts enable row level security;

drop policy if exists "debts_owner" on public.debts;
create policy "debts_owner" on public.debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Debt repayments are logged as expenses (so they show up in normal
-- spending totals too) but linked back to the debt so we can reduce
-- its balance and track payment history.
alter table public.expenses add column if not exists debt_id uuid references public.debts(id) on delete set null;
create index if not exists expenses_debt_idx on public.expenses (debt_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'LKR',
  accent_color text not null default '#8b7ef5',
  dashboard_widgets jsonb not null default '{"income": true, "debt": true, "safeToSpend": true}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_owner" on public.user_settings;
create policy "user_settings_owner" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
