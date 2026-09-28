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

create policy "merchant_categories_owner" on public.merchant_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
