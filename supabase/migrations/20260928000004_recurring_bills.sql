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
