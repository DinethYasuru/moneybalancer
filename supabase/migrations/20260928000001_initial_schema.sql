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
