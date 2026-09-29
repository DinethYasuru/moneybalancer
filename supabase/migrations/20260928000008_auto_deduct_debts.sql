-- Some loan/credit payments are automatic — deducted by the bank on a
-- fixed date, or taken straight out of salary before it's even seen.
-- These should count against "safe to spend" whether or not the user
-- has manually logged an expense for them yet this month.

alter table public.debts add column if not exists auto_deduct boolean not null default false;
alter table public.debts add column if not exists deduction_trigger text check (deduction_trigger in ('fixed_date', 'on_income'));
