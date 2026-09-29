-- ============================================================
-- 20260928000001_initial_schema.sql
-- ============================================================
-- MoneyBalancer initial schema
-- Every table carries user_id and is protected by Row Level Security so a
-- user can only ever see/modify their own rows.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(12, 2) not null,
  currency text not null default 'LKR',
  description text,
  expense_date date not null default current_date,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  file_type text not null,
  file_size_bytes integer,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'reviewed', 'failed')),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.statement_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement_id uuid not null references public.bank_statements(id) on delete cascade,
  txn_date date not null,
  description text,
  amount numeric(12, 2) not null,
  direction text not null check (direction in ('debit', 'credit')),
  category_id uuid references public.categories(id) on delete set null,
  confirmed boolean not null default false,
  expense_id uuid references public.expenses(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index if not exists attachments_expense_idx on public.attachments (expense_id);
create index if not exists statement_transactions_statement_idx on public.statement_transactions (statement_id);

-- Row Level Security: every table only exposes rows owned by the caller.
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.attachments enable row level security;
alter table public.bank_statements enable row level security;
alter table public.statement_transactions enable row level security;

drop policy if exists "categories_owner" on public.categories;
create policy "categories_owner" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "expenses_owner" on public.expenses;
create policy "expenses_owner" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "attachments_owner" on public.attachments;
create policy "attachments_owner" on public.attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bank_statements_owner" on public.bank_statements;
create policy "bank_statements_owner" on public.bank_statements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "statement_transactions_owner" on public.statement_transactions;
create policy "statement_transactions_owner" on public.statement_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seed a sensible set of default categories for every new user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, is_default) values
    (new.id, 'Rent', true),
    (new.id, 'Electricity', true),
    (new.id, 'Water', true),
    (new.id, 'Internet', true),
    (new.id, 'Groceries', true),
    (new.id, 'Transport', true),
    (new.id, 'Dining Out', true),
    (new.id, 'Subscriptions', true),
    (new.id, 'Health', true),
    (new.id, 'Other', true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- 20260928000002_storage_buckets.sql
-- ============================================================
-- Storage buckets for uploaded slips/receipts and bank statement PDFs.
-- Files are stored under a path prefixed with the owning user's id, e.g.
-- "{user_id}/2026-09-28-electricity.pdf", and policies check that prefix.

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('bank-statements', 'bank-statements', false)
on conflict (id) do nothing;

drop policy if exists "attachments_owner_rw" on storage.objects;
create policy "attachments_owner_rw" on storage.objects
  for all using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "bank_statements_owner_rw" on storage.objects;
create policy "bank_statements_owner_rw" on storage.objects
  for all using (
    bucket_id = 'bank-statements'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'bank-statements'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- 20260928000003_category_colors.sql
-- ============================================================
-- Give default categories a color/icon so the UI can show them distinctly,
-- and backfill any categories already seeded before this existed.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, icon, color, is_default) values
    (new.id, 'Rent', '🏠', '#5b4fe8', true),
    (new.id, 'Electricity', '⚡', '#f0a93a', true),
    (new.id, 'Water', '💧', '#14b8a6', true),
    (new.id, 'Internet', '🌐', '#3b82f6', true),
    (new.id, 'Groceries', '🛒', '#17a673', true),
    (new.id, 'Transport', '🚗', '#f97316', true),
    (new.id, 'Dining Out', '🍽️', '#e0435c', true),
    (new.id, 'Subscriptions', '🔁', '#8b5cf6', true),
    (new.id, 'Health', '➕', '#ec4899', true),
    (new.id, 'Other', '📦', '#6b7280', true);
  return new;
end;
$$;

update public.categories set icon = '🏠', color = '#5b4fe8' where name = 'Rent' and color is null;
update public.categories set icon = '⚡', color = '#f0a93a' where name = 'Electricity' and color is null;
update public.categories set icon = '💧', color = '#14b8a6' where name = 'Water' and color is null;
update public.categories set icon = '🌐', color = '#3b82f6' where name = 'Internet' and color is null;
update public.categories set icon = '🛒', color = '#17a673' where name = 'Groceries' and color is null;
update public.categories set icon = '🚗', color = '#f97316' where name = 'Transport' and color is null;
update public.categories set icon = '🍽️', color = '#e0435c' where name = 'Dining Out' and color is null;
update public.categories set icon = '🔁', color = '#8b5cf6' where name = 'Subscriptions' and color is null;
update public.categories set icon = '➕', color = '#ec4899' where name = 'Health' and color is null;
update public.categories set icon = '📦', color = '#6b7280' where name = 'Other' and color is null;
update public.categories set icon = '🏷️', color = '#6b7280' where color is null;


-- ============================================================
-- 20260928000004_recurring_bills.sql
-- ============================================================
-- Recurring monthly bills (Rent, Electricity, etc.) as reusable templates,
-- separate from one-off expenses. Each month you "log payment" against a
-- bill, which creates a normal expense linked back to the bill.

create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  expected_amount numeric(12, 2),
  due_day smallint check (due_day between 1 and 31),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists recurring_bill_id uuid references public.recurring_bills(id) on delete set null;

create index if not exists recurring_bills_user_idx on public.recurring_bills (user_id);
create index if not exists expenses_recurring_bill_idx on public.expenses (recurring_bill_id);

alter table public.recurring_bills enable row level security;

drop policy if exists "recurring_bills_owner" on public.recurring_bills;
create policy "recurring_bills_owner" on public.recurring_bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ============================================================
-- 20260928000005_budgets_goals.sql
-- ============================================================
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

drop policy if exists "savings_goals_owner" on public.savings_goals;
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


-- ============================================================
-- 20260928000006_merchant_memory.sql
-- ============================================================
-- Remembers which category a merchant was assigned to last, so future
-- expenses/imports from the same merchant get auto-categorized without
-- relying only on static keyword guesses.

create table if not exists public.merchant_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

alter table public.merchant_categories enable row level security;

drop policy if exists "merchant_categories_owner" on public.merchant_categories;
create policy "merchant_categories_owner" on public.merchant_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ============================================================
-- 20260928000007_income_debts_settings.sql
-- ============================================================
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


-- ============================================================
-- 20260928000008_auto_deduct_debts.sql
-- ============================================================
-- Some loan/credit payments are automatic — deducted by the bank on a
-- fixed date, or taken straight out of salary before it's even seen.
-- These should count against "safe to spend" whether or not the user
-- has manually logged an expense for them yet this month.

alter table public.debts add column if not exists auto_deduct boolean not null default false;
alter table public.debts add column if not exists deduction_trigger text check (deduction_trigger in ('fixed_date', 'on_income'));


-- ============================================================
-- 20260928000009_ai_config.sql
-- ============================================================
-- Stores the user's own AI provider config (they bring their own API key,
-- since this app has no backend server to hold one safely — it's used
-- directly from their browser to their chosen provider).
alter table public.user_settings add column if not exists ai_config jsonb not null default '{"enabled": false, "provider": "openai_compatible", "base_url": "https://api.openai.com/v1", "api_key": "", "model": "gpt-4o-mini"}'::jsonb;


-- ============================================================
-- 20260928000010_transfer_direction.sql
-- ============================================================
-- Internal transfers (main account -> secondary -> third party, all the
-- user's own money moving around) shouldn't count as real income or
-- expense. Add a third "transfer" direction so these can be recorded for
-- history without inflating expense/income totals. No account numbers or
-- other bank identifiers are ever stored here — just timestamp,
-- description, amount, and direction, same as every other transaction.

alter table public.statement_transactions drop constraint if exists statement_transactions_direction_check;
alter table public.statement_transactions add constraint statement_transactions_direction_check
  check (direction in ('debit', 'credit', 'transfer'));


